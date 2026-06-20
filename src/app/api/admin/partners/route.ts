import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Codes that would clash with real site paths (kept in sync with middleware).
const RESERVED = new Set([
  "admin", "api", "watch", "contact", "subscribe", "match-alerts",
  "world-cup", "partner", "partner-program", "ppv", "_next", "offline", "icons", "alerts",
]);

const CODE_RE = /^[a-z0-9-]{2,30}$/;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();

  const [partnersRes, zonesRes, appsRes, settingsRes] = await Promise.all([
    sb.from("partners")
      .select("id, code, name, email, active, suspended, banned, created_at, revenue_split, full_stats, earned_total, paid_total, payout_currency, payout_address")
      .order("created_at", { ascending: true }),
    sb.from("partner_zones").select("id, partner_id, zone_id, label, format, full_tag, gross_seen, last_impressions"),
    sb.from("partner_applications")
      .select("id, name, email, country, platform, audience_size, contact_handle, status, created_at")
      .eq("status", "pending").order("created_at", { ascending: false }),
    sb.from("site_settings").select("key, value").in("key", ["partner_public_page", "partner_ads"]),
  ]);

  const [balRes, payoutsRes] = await Promise.all([
    sb.from("partner_balances").select("partner_id, earned, hold, paid, balance"),
    sb.from("partner_payouts")
      .select("id, partner_id, amount, currency, from_address, to_address, status, proof_link, proof_image, note, fail_reason, created_at")
      .order("created_at", { ascending: false }),
  ]);
  const balByPartner: Record<string, { earned: number; hold: number; paid: number; balance: number }> = {};
  for (const b of balRes.data ?? []) {
    const r = b as { partner_id: string; earned: number; hold: number; paid: number; balance: number };
    balByPartner[r.partner_id] = { earned: num(r.earned), hold: num(r.hold), paid: num(r.paid), balance: num(r.balance) };
  }
  const payoutsByPartner: Record<string, unknown[]> = {};
  for (const po of payoutsRes.data ?? []) {
    const pid = (po as { partner_id: string }).partner_id;
    (payoutsByPartner[pid] ??= []).push(po);
  }

  const zoneByPartner: Record<string, unknown[]> = {};
  for (const z of zonesRes.data ?? []) {
    const pid = (z as { partner_id: string }).partner_id;
    (zoneByPartner[pid] ??= []).push(z);
  }

  const partners = (partnersRes.data ?? []).map((p) => {
    const rec = p as { id: string; earned_total: number };
    const bal = balByPartner[rec.id] ?? { earned: num(rec.earned_total), hold: 0, paid: 0, balance: num(rec.earned_total) };
    return {
      ...p,
      earned_total: bal.earned,
      hold: bal.hold,
      paid_total: bal.paid,
      balance: bal.balance,
      zones: zoneByPartner[rec.id] ?? [],
      payouts: payoutsByPartner[rec.id] ?? [],
    };
  });

  const settings: Record<string, boolean> = { partner_public_page: false, partner_ads: false };
  for (const s of settingsRes.data ?? []) {
    const row = s as { key: string; value: unknown };
    settings[row.key] = row.value === true || row.value === "true";
  }

  const totalBalance = partners.reduce((a, p) => a + (p.balance > 0 ? p.balance : 0), 0);
  const totalHold = partners.reduce((a, p) => a + p.hold, 0);
  const totalPaid = partners.reduce((a, p) => a + p.paid_total, 0);

  return NextResponse.json({
    partners,
    applications: appsRes.data ?? [],
    settings,
    summary: {
      partnerCount: partners.length,
      pendingCount: (appsRes.data ?? []).length,
      totalBalance,
      totalHold,
      totalPaid,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  try {
    const body = await request.json();
    const action = String(body.action || "");

    // ---- Master switches: public program page / partner ads ----
    if (action === "settings") {
      const key = String(body.key || "");
      if (key !== "partner_public_page" && key !== "partner_ads")
        return NextResponse.json({ error: "unknown setting" }, { status: 400 });
      const { error } = await sb.from("site_settings")
        .upsert({ key, value: !!body.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- Per-partner platform-wide stats switch ----
    if (action === "fullstats") {
      const code = String(body.code || "").trim().toLowerCase();
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      const { error } = await sb.from("partners").update({ full_stats: !!body.full_stats }).eq("code", code);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- Set / change a partner's revenue split (affects only future earnings) ----
    if (action === "split") {
      const code = String(body.code || "").trim().toLowerCase();
      const split = num(body.split);
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      if (split < 0 || split > 100) return NextResponse.json({ error: "split must be 0–100" }, { status: 400 });
      const { error } = await sb.from("partners").update({ revenue_split: split }).eq("code", code);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- Applications: approve (creates a real login) / reject ----
    if (action === "approve") {
      const appId = String(body.app_id || "");
      const code = String(body.code || "").trim().toLowerCase();
      const password = String(body.password || "");
      const split = body.split === undefined ? 50 : num(body.split);
      if (!appId) return NextResponse.json({ error: "app_id required" }, { status: 400 });
      if (!CODE_RE.test(code)) return NextResponse.json({ error: "Code must be 2–30 chars: lowercase letters, numbers, hyphens" }, { status: 400 });
      if (RESERVED.has(code)) return NextResponse.json({ error: `"${code}" is reserved — choose another code` }, { status: 400 });
      if (password.length < 4) return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
      const { data, error } = await sb.rpc("approve_partner_application", { p_app_id: appId, p_code: code, p_password: password, p_split: split });
      if (error) throw error;
      const res = data as { error?: string } | null;
      if (res?.error) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, partner: data });
    }
    if (action === "reject") {
      const appId = String(body.app_id || "");
      if (!appId) return NextResponse.json({ error: "app_id required" }, { status: 400 });
      const { error } = await sb.from("partner_applications")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", appId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- Zones: add/update (unique per zone_id) / remove ----
    if (action === "addzone") {
      const partnerId = String(body.partner_id || "");
      const zoneId = String(body.zone_id || "").trim();
      if (!partnerId || !zoneId) return NextResponse.json({ error: "partner and zone id required" }, { status: 400 });
      if (!/^[a-zA-Z0-9_-]{3,40}$/.test(zoneId)) return NextResponse.json({ error: "That doesn't look like a Monetag zone ID" }, { status: 400 });
      const { error } = await sb.from("partner_zones").upsert({
        partner_id: partnerId,
        zone_id: zoneId,
        label: body.label ? String(body.label) : null,
        format: body.format ? String(body.format) : "popunder",
        full_tag: body.full_tag ? String(body.full_tag) : null,
      }, { onConflict: "zone_id" });
      if (error) {
        if ((error.message || "").includes("duplicate")) return NextResponse.json({ error: "That zone ID is already assigned" }, { status: 409 });
        throw error;
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "removezone") {
      const zoneId = String(body.zone_id || "").trim();
      if (!zoneId) return NextResponse.json({ error: "zone id required" }, { status: 400 });
      const { error } = await sb.from("partner_zones").delete().eq("zone_id", zoneId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- Record a payout. status drives the buckets (in_progress/sent = Hold, completed = Paid). ----
    const PAYOUT_STATUSES = ["in_progress", "sent", "completed", "failed"];
    if (action === "payout") {
      const partnerId = String(body.partner_id || "");
      const amount = num(body.amount);
      if (!partnerId) return NextResponse.json({ error: "partner required" }, { status: 400 });
      if (amount <= 0) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
      const status = PAYOUT_STATUSES.includes(String(body.status)) ? String(body.status) : "in_progress";
      let proofImage: string | null = null;
      const img = typeof body.proof_image === "string" ? body.proof_image : "";
      if (img.startsWith("data:image/")) {
        try {
          const m = img.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (m) {
            const mime = m[1];
            const ext = mime.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
            const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
            const path = `${partnerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const up = await sb.storage.from("payout-proofs").upload(path, bytes, { contentType: mime, upsert: false });
            if (!up.error) proofImage = sb.storage.from("payout-proofs").getPublicUrl(path).data.publicUrl;
          }
        } catch { /* proof is optional — ignore upload failures */ }
      }
      const { error } = await sb.from("partner_payouts").insert({
        partner_id: partnerId,
        amount,
        currency: body.currency ? String(body.currency) : null,
        method: body.currency ? String(body.currency) : "crypto",
        from_address: body.from_address ? String(body.from_address) : null,
        to_address: body.to_address ? String(body.to_address) : null,
        status,
        note: body.note ? String(body.note) : null,
        proof_link: body.proof_link ? String(body.proof_link) : null,
        proof_image: proofImage,
        fail_reason: status === "failed" ? (body.fail_reason ? String(body.fail_reason) : null) : null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "payout_status") {
      const id = String(body.payout_id || "");
      const status = String(body.status || "");
      if (!id) return NextResponse.json({ error: "payout id required" }, { status: 400 });
      if (!PAYOUT_STATUSES.includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      const failReason = status === "failed" ? (body.fail_reason ? String(body.fail_reason) : null) : null;
      const { error } = await sb.from("partner_payouts").update({ status, fail_reason: failReason, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "payout_delete") {
      const id = String(body.payout_id || "");
      if (!id) return NextResponse.json({ error: "payout id required" }, { status: 400 });
      const { error } = await sb.from("partner_payouts").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- CSV earnings import (rows parsed client-side from the Monetag file) ----
    if (action === "import") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return NextResponse.json({ error: "No rows found in that file" }, { status: 400 });
      const { data, error } = await sb.rpc("partner_apply_earnings", { p_rows: rows });
      if (error) throw error;
      return NextResponse.json({ ok: true, result: data });
    }

    // ================= existing behavior below (unchanged) =================
    const code = String(body.code || "").trim().toLowerCase();

    // State changes: referral on/off (active), suspend (login), ban (both). Each independent.
    if (action === "state") {
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      const patch: Record<string, boolean> = {};
      if ("active" in body) patch.active = !!body.active;
      if ("suspended" in body) patch.suspended = !!body.suspended;
      if ("banned" in body) patch.banned = !!body.banned;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to change" }, { status: 400 });
      const { error } = await sb.from("partners").update(patch).eq("code", code);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = body.password ? String(body.password) : null;
    const active = body.active === undefined ? true : !!body.active;
    const isNew = !!body.create;

    if (!code) return NextResponse.json({ error: "The referral code is required" }, { status: 400 });
    if (!CODE_RE.test(code))
      return NextResponse.json({ error: "Code must be 2–30 characters: lowercase letters, numbers and hyphens only" }, { status: 400 });
    if (RESERVED.has(code))
      return NextResponse.json({ error: `"${code}" is a reserved word — please choose another code` }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    if (isNew && (!password || password.length < 4))
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });

    const { data, error } = await sb.rpc("admin_upsert_partner", {
      p_code: code, p_name: name, p_email: email, p_password: password, p_active: active,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("EMAIL_TAKEN")) return NextResponse.json({ error: "That email already belongs to another partner" }, { status: 409 });
      if (msg.includes("PASSWORD_REQUIRED")) return NextResponse.json({ error: "A password is required for a new partner" }, { status: 400 });
      throw error;
    }
    return NextResponse.json({ ok: true, partner: data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
