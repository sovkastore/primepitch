import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
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
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const [partnersRes, zonesRes, appsRes, settingsRes, balRes, payoutsRes] = await Promise.all([
    d1.prepare("SELECT id, code, name, email, password_hash, active, suspended, banned, created_at, revenue_split, full_stats, payout_currency, payout_address FROM d1_partners ORDER BY created_at ASC").all(),
    d1.prepare("SELECT id, partner_id, zone_id, label, format, full_tag, gross_seen, last_impressions FROM d1_partner_zones").all(),
    d1.prepare("SELECT id, name, email, country, platform, audience_size, contact_handle, status, created_at FROM d1_partner_applications WHERE status = 'pending' ORDER BY created_at DESC").all(),
    d1.prepare("SELECT key, value FROM d1_site_settings WHERE key IN ('partner_public_page', 'partner_ads')").all(),
    d1.prepare("SELECT partner_id, earned, approved, hold, paid, balance FROM d1_partner_balances").all(),
    d1.prepare("SELECT id, partner_id, amount, currency, from_address, to_address, status, proof_link, proof_image, note, fail_reason, created_at FROM d1_partner_payouts ORDER BY created_at DESC").all(),
  ]);

  const balByPartner: Record<string, { earned: number; approved: number; hold: number; paid: number; balance: number }> = {};
  for (const b of (balRes.results ?? []) as any[]) {
    balByPartner[b.partner_id] = { earned: num(b.earned), approved: num(b.approved), hold: num(b.hold), paid: num(b.paid), balance: num(b.balance) };
  }
  const payoutsByPartner: Record<string, unknown[]> = {};
  for (const po of (payoutsRes.results ?? []) as any[]) {
    (payoutsByPartner[po.partner_id] ??= []).push(po);
  }

  const zoneByPartner: Record<string, unknown[]> = {};
  for (const z of (zonesRes.results ?? []) as any[]) {
    (zoneByPartner[z.partner_id] ??= []).push(z);
  }

  const partners = (partnersRes.results ?? []).map((p: any) => {
    const bal = balByPartner[p.id] ?? { earned: 0, approved: 0, hold: 0, paid: 0, balance: 0 };
    return {
      ...p,
      password: p.password_hash || "",
      active: !!p.active,
      suspended: !!p.suspended,
      banned: !!p.banned,
      full_stats: !!p.full_stats,
      earned_total: bal.earned,
      approved_balance: bal.approved,
      hold: bal.hold,
      paid_total: bal.paid,
      balance: bal.balance,
      zones: zoneByPartner[p.id] ?? [],
      payouts: payoutsByPartner[p.id] ?? [],
    };
  });

  const settings: Record<string, boolean> = { partner_public_page: false, partner_ads: false };
  for (const s of (settingsRes.results ?? []) as any[]) {
    settings[s.key] = s.value === true || s.value === "true";
  }

  const totalBalance = partners.reduce((a, p) => a + (p.balance > 0 ? p.balance : 0), 0);
  const totalHold = partners.reduce((a, p) => a + p.hold, 0);
  const totalPaid = partners.reduce((a, p) => a + p.paid_total, 0);

  return NextResponse.json({
    partners,
    applications: appsRes.results ?? [],
    settings,
    summary: {
      partnerCount: partners.length,
      pendingCount: (appsRes.results ?? []).length,
      totalBalance,
      totalHold,
      totalPaid,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  try {
    const body = await request.json();
    const action = String(body.action || "");

    // ---- Master switches: public program page / partner ads ----
    if (action === "settings") {
      const key = String(body.key || "");
      if (key !== "partner_public_page" && key !== "partner_ads")
        return NextResponse.json({ error: "unknown setting" }, { status: 400 });
      await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(key, body.value ? "true" : "false", new Date().toISOString()).run();
      return NextResponse.json({ ok: true });
    }

    // ---- Per-partner platform-wide stats switch ----
    if (action === "fullstats") {
      const code = String(body.code || "").trim().toLowerCase();
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      await d1.prepare("UPDATE d1_partners SET full_stats = ? WHERE code = ?").bind(!!body.full_stats, code).run();
      return NextResponse.json({ ok: true });
    }

    // ---- Set / change a partner's revenue split (affects only future earnings) ----
    if (action === "split") {
      const code = String(body.code || "").trim().toLowerCase();
      const split = num(body.split);
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      if (split < 0 || split > 100) return NextResponse.json({ error: "split must be 0–100" }, { status: 400 });
      await d1.prepare("UPDATE d1_partners SET revenue_split = ? WHERE code = ?").bind(split, code).run();
      return NextResponse.json({ ok: true });
    }

    // ---- Change a partner's password ----
    if (action === "update_password") {
      const code = String(body.code || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      if (password.length < 4) return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
      await d1.prepare("UPDATE d1_partners SET password_hash = ? WHERE code = ?").bind(password, code).run();
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
      
      const app = await d1.prepare("SELECT name, email FROM d1_partner_applications WHERE id = ?").bind(appId).first() as any;
      if (!app) return NextResponse.json({ error: "Application not found" }, { status: 400 });
      
      const existing = await d1.prepare("SELECT id FROM d1_partners WHERE code = ? OR email = ?").bind(code, app.email).first();
      if (existing) return NextResponse.json({ error: "Code or email already in use" }, { status: 400 });
      
      const partnerId = crypto.randomUUID();
      await d1.prepare(
        "INSERT INTO d1_partners (id, code, name, email, password_hash, revenue_split, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(partnerId, code, app.name, app.email, password, split, true, new Date().toISOString()).run();
      
      await d1.prepare("INSERT INTO d1_partner_balances (partner_id, earned, hold, paid, balance) VALUES (?, 0, 0, 0, 0)").bind(partnerId).run();
      
      await d1.prepare("UPDATE d1_partner_applications SET status = 'approved', reviewed_at = ? WHERE id = ?").bind(new Date().toISOString(), appId).run();
      
      return NextResponse.json({ ok: true, partner: { id: partnerId, code } });
    }
    
    if (action === "reject") {
      const appId = String(body.app_id || "");
      if (!appId) return NextResponse.json({ error: "app_id required" }, { status: 400 });
      await d1.prepare("UPDATE d1_partner_applications SET status = 'rejected', reviewed_at = ? WHERE id = ?").bind(new Date().toISOString(), appId).run();
      return NextResponse.json({ ok: true });
    }

    // ---- Zones: add/update (unique per zone_id) / remove ----
    if (action === "addzone") {
      const partnerId = String(body.partner_id || "");
      const zoneId = String(body.zone_id || "").trim();
      if (!partnerId || !zoneId) return NextResponse.json({ error: "partner and zone id required" }, { status: 400 });
      if (!/^[a-zA-Z0-9_-]{2,40}$/.test(zoneId)) return NextResponse.json({ error: "Invalid Zone ID format" }, { status: 400 });
      
      try {
        await d1.prepare(`
          INSERT INTO d1_partner_zones (id, partner_id, zone_id, label, format, full_tag, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(zone_id) DO UPDATE SET 
            partner_id = excluded.partner_id,
            label = excluded.label,
            format = excluded.format,
            full_tag = excluded.full_tag
        `).bind(
          crypto.randomUUID(), partnerId, zoneId, 
          body.label ? String(body.label) : null,
          body.format ? String(body.format) : "popunder",
          body.full_tag ? String(body.full_tag) : null,
          new Date().toISOString()
        ).run();
      } catch (error: any) {
        if ((error.message || "").includes("duplicate")) return NextResponse.json({ error: "That zone ID is already assigned" }, { status: 409 });
        throw error;
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "removezone") {
      const zoneId = String(body.zone_id || "").trim();
      if (!zoneId) return NextResponse.json({ error: "zone id required" }, { status: 400 });
      await d1.prepare("DELETE FROM d1_partner_zones WHERE zone_id = ?").bind(zoneId).run();
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
      // Money goes out of Approved only. Approve first, then pay.
      if (status !== "failed") {
        const cur = await d1.prepare("SELECT approved FROM d1_partner_balances WHERE partner_id = ?").bind(partnerId).first<{ approved: number }>();
        const approved = num(cur?.approved);
        if (amount > approved + 0.000001) {
          return NextResponse.json({ error: `Only $${approved.toFixed(2)} is approved for this partner. Approve the funds first, then record the payout.` }, { status: 400 });
        }
      }
      let proofImage: string | null = null;
      
      // We skip actual storage upload in D1 migration, unless using a custom blob/R2 integration.
      // Assuming proof base64 saving or external url.
      const img = typeof body.proof_image === "string" ? body.proof_image : "";
      if (img.startsWith("data:image/")) {
        // Just store the base64 or mock if requested. We'll store it as data url to not break things,
        // although real file storage is recommended.
        proofImage = img;
      }
      
      await d1.prepare(`
        INSERT INTO d1_partner_payouts (id, partner_id, amount, currency, method, from_address, to_address, status, note, proof_link, proof_image, fail_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), partnerId, amount,
        body.currency ? String(body.currency) : null,
        body.currency ? String(body.currency) : "crypto",
        body.from_address ? String(body.from_address) : null,
        body.to_address ? String(body.to_address) : null,
        status,
        body.note ? String(body.note) : null,
        body.proof_link ? String(body.proof_link) : null,
        proofImage,
        status === "failed" ? (body.fail_reason ? String(body.fail_reason) : null) : null,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
      
      // Update balances
      if (status !== "failed") {
        const isCompleted = status === "completed";
        await d1.prepare(`
          UPDATE d1_partner_balances 
          SET approved = approved - ?, 
              balance = balance - ?,
              hold = hold + ?,
              paid = paid + ?
          WHERE partner_id = ?
        `).bind(
          amount, amount, 
          isCompleted ? 0 : amount, 
          isCompleted ? amount : 0, 
          partnerId
        ).run();
      }
      
      return NextResponse.json({ ok: true });
    }
    
    if (action === "payout_status") {
      const id = String(body.payout_id || "");
      const status = String(body.status || "");
      if (!id) return NextResponse.json({ error: "payout id required" }, { status: 400 });
      if (!PAYOUT_STATUSES.includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      const failReason = status === "failed" ? (body.fail_reason ? String(body.fail_reason) : null) : null;
      
      const oldPo = await d1.prepare("SELECT partner_id, amount, status FROM d1_partner_payouts WHERE id = ?").bind(id).first<{ partner_id: string; amount: number; status: string }>();
      if (!oldPo) return NextResponse.json({ error: "payout not found" }, { status: 404 });
      
      await d1.prepare("UPDATE d1_partner_payouts SET status = ?, fail_reason = ?, updated_at = ? WHERE id = ?").bind(status, failReason, new Date().toISOString(), id).run();
      
      if (oldPo.status !== status) {
        let approvedChange = 0;
        let balanceChange = 0;
        let holdChange = 0;
        let paidChange = 0;
        const amt = num(oldPo.amount);
        
        // From failed (was refunded) -> Active
        if (oldPo.status === "failed" && status !== "failed") {
          approvedChange -= amt;
          balanceChange -= amt;
          if (status === "completed") paidChange += amt;
          else holdChange += amt;
        }
        // From Active -> failed (refund)
        else if (oldPo.status !== "failed" && status === "failed") {
          approvedChange += amt;
          balanceChange += amt;
          if (oldPo.status === "completed") paidChange -= amt;
          else holdChange -= amt;
        }
        // From Hold -> Completed
        else if (oldPo.status !== "completed" && status === "completed") {
          holdChange -= amt;
          paidChange += amt;
        }
        // From Completed -> Hold
        else if (oldPo.status === "completed" && status !== "failed" && status !== "completed") {
          holdChange += amt;
          paidChange -= amt;
        }
        
        if (approvedChange !== 0 || balanceChange !== 0 || holdChange !== 0 || paidChange !== 0) {
          await d1.prepare(`
            UPDATE d1_partner_balances 
            SET approved = approved + ?, balance = balance + ?, hold = hold + ?, paid = paid + ?
            WHERE partner_id = ?
          `).bind(approvedChange, balanceChange, holdChange, paidChange, oldPo.partner_id).run();
        }
      }
      
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_funds") {
      const partnerId = String(body.partner_id || "");
      const amount = num(body.amount);
      if (!partnerId) return NextResponse.json({ error: "partner required" }, { status: 400 });
      if (amount <= 0) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
      
      // Approved is the part of the partner's balance that has been released
      // for payout — it can never exceed what they actually have.
      const cur = await d1.prepare("SELECT approved, balance FROM d1_partner_balances WHERE partner_id = ?").bind(partnerId).first<{ approved: number; balance: number }>();
      if (!cur) return NextResponse.json({ error: "partner has no balance row" }, { status: 404 });
      const room = Math.max(0, num(cur.balance) - num(cur.approved));
      if (amount > room + 0.000001) {
        return NextResponse.json({ error: `Only $${room.toFixed(2)} is left to approve (balance $${num(cur.balance).toFixed(2)}, already approved $${num(cur.approved).toFixed(2)}).` }, { status: 400 });
      }
      await d1.prepare("UPDATE d1_partner_balances SET approved = MIN(balance, MAX(0, approved + ?)) WHERE partner_id = ?").bind(amount, partnerId).run();
      return NextResponse.json({ ok: true });
    }

    if (action === "unapprove_funds") {
      const partnerId = String(body.partner_id || "");
      const amount = num(body.amount);
      if (!partnerId) return NextResponse.json({ error: "partner required" }, { status: 400 });
      if (amount <= 0) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
      await d1.prepare("UPDATE d1_partner_balances SET approved = MAX(0, approved - ?) WHERE partner_id = ?").bind(amount, partnerId).run();
      return NextResponse.json({ ok: true });
    }

    if (action === "adjust_balance") {
      const partnerId = String(body.partner_id || "");
      const earnedDelta = num(body.earned_delta);
      const balanceDelta = num(body.balance_delta !== undefined ? body.balance_delta : body.earned_delta);
      if (!partnerId) return NextResponse.json({ error: "partner required" }, { status: 400 });
      
      // An adjustment changes what the partner has earned and can still
      // receive. It never approves anything — that is a separate, deliberate
      // step — but a deduction can shrink approved so it stays within balance.
      await d1.prepare(`
        UPDATE d1_partner_balances
        SET earned = MAX(0, earned + ?),
            balance = MAX(0, balance + ?),
            approved = MIN(MAX(0, balance + ?), approved)
        WHERE partner_id = ?
      `).bind(earnedDelta, balanceDelta, balanceDelta, partnerId).run();
      return NextResponse.json({ ok: true });
    }
    
    if (action === "payout_delete") {
      const id = String(body.payout_id || "");
      if (!id) return NextResponse.json({ error: "payout id required" }, { status: 400 });
      
      const oldPo = await d1.prepare("SELECT partner_id, amount, status FROM d1_partner_payouts WHERE id = ?").bind(id).first<{ partner_id: string; amount: number; status: string }>();
      if (!oldPo) return NextResponse.json({ error: "payout not found" }, { status: 404 });
      
      await d1.prepare("DELETE FROM d1_partner_payouts WHERE id = ?").bind(id).run();
      
      if (oldPo.status !== "failed") {
        const amt = num(oldPo.amount);
        const isCompleted = oldPo.status === "completed";
        await d1.prepare(`
          UPDATE d1_partner_balances 
          SET approved = approved + ?, balance = balance + ?, hold = hold - ?, paid = paid - ?
          WHERE partner_id = ?
        `).bind(amt, amt, isCompleted ? 0 : amt, isCompleted ? amt : 0, oldPo.partner_id).run();
      }
      
      return NextResponse.json({ ok: true });
    }

    // ---- CSV earnings preview (calculates cuts but does not apply them) ----
    if (action === "preview_import") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return NextResponse.json({ error: "No rows found in that file" }, { status: 400 });

      const zonesRes = await d1.prepare("SELECT zone_id, partner_id, gross_seen, last_impressions FROM d1_partner_zones").all();
      const zoneMap: Record<string, { partner_id: string; gross_seen: number; last_impressions: number }> = {};
      for (const z of (zonesRes.results || []) as any[]) {
        zoneMap[z.zone_id] = { partner_id: z.partner_id, gross_seen: num(z.gross_seen), last_impressions: num(z.last_impressions) };
      }

      const partnersRes = await d1.prepare("SELECT id, name, revenue_split FROM d1_partners").all();
      const partnerMap: Record<string, { name: string; split: number; earned_add: number }> = {};
      for (const p of (partnersRes.results || []) as any[]) {
        partnerMap[p.id] = { name: p.name, split: num(p.revenue_split), earned_add: 0 };
      }

      let rowsMatched = 0;
      const zoneUpdates: { zone_id: string; gross_seen: number; last_impressions: number }[] = [];

      for (const row of rows) {
        const zId = String(row.zone_id || "").trim();
        const zData = zoneMap[zId];
        if (!zData) continue;
        rowsMatched++;

        const csvProfit = num(row.profit);
        const csvImps = num(row.impressions);
        let updated = false;
        let newGrossSeen = zData.gross_seen;
        let newImps = zData.last_impressions;

        if (csvProfit > zData.gross_seen) {
          const newGross = csvProfit - zData.gross_seen;
          const split = partnerMap[zData.partner_id]?.split ?? 50;
          const partnerCut = newGross * (split / 100);

          if (partnerMap[zData.partner_id]) {
            partnerMap[zData.partner_id].earned_add += partnerCut;
          }
          newGrossSeen = csvProfit;
          updated = true;
        }

        if (csvImps > zData.last_impressions) {
          newImps = csvImps;
          updated = true;
        }

        if (updated) {
          zoneUpdates.push({ zone_id: zId, gross_seen: newGrossSeen, last_impressions: newImps });
        }
      }

      const partnerPayouts = [];
      for (const [pId, pData] of Object.entries(partnerMap)) {
        if (pData.earned_add > 0) {
          partnerPayouts.push({
            partner_id: pId,
            partner_name: pData.name,
            calculated_cut: pData.earned_add,
            adjusted_cut: pData.earned_add,
          });
        }
      }

      return NextResponse.json({ ok: true, result: { rows_matched: rowsMatched, zoneUpdates, partnerPayouts } });
    }

    // ---- Apply customized earnings and sync zones ----
    if (action === "apply_import") {
      const zoneUpdates = Array.isArray(body.zoneUpdates) ? body.zoneUpdates : [];
      const partnerPayouts = Array.isArray(body.partnerPayouts) ? body.partnerPayouts : [];

      const stmts = [];
      for (const zu of zoneUpdates) {
        stmts.push(d1.prepare("UPDATE d1_partner_zones SET gross_seen = ?, last_impressions = ? WHERE zone_id = ?").bind(zu.gross_seen, zu.last_impressions, zu.zone_id));
      }
      for (const po of partnerPayouts) {
        const amt = num(po.adjusted_cut);
        if (amt > 0) {
          stmts.push(d1.prepare("UPDATE d1_partner_balances SET earned = earned + ?, balance = balance + ? WHERE partner_id = ?").bind(amt, amt, po.partner_id));
        }
      }

      for (let i = 0; i < stmts.length; i += 100) {
        await d1.batch(stmts.slice(i, i + 100));
      }

      return NextResponse.json({ ok: true });
    }

    // ================= existing behavior below (unchanged) =================
    const code = String(body.code || "").trim().toLowerCase();

    // State changes: referral on/off (active), suspend (login), ban (both). Each independent.
    if (action === "state") {
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
      
      const updates = [];
      const args = [];
      if ("active" in body) { updates.push("active = ?"); args.push(!!body.active); }
      if ("suspended" in body) { updates.push("suspended = ?"); args.push(!!body.suspended); }
      if ("banned" in body) { updates.push("banned = ?"); args.push(!!body.banned); }
      
      if (updates.length === 0) return NextResponse.json({ error: "nothing to change" }, { status: 400 });
      
      args.push(code);
      await d1.prepare(`UPDATE d1_partners SET ${updates.join(", ")} WHERE code = ?`).bind(...args).run();
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

    const existingEmail = await d1.prepare("SELECT id FROM d1_partners WHERE email = ? AND code != ?").bind(email, code).first();
    if (existingEmail) return NextResponse.json({ error: "That email already belongs to another partner" }, { status: 409 });

    const existingCode = await d1.prepare("SELECT id FROM d1_partners WHERE code = ?").bind(code).first();
    if (existingCode) {
      await d1.prepare(
        "UPDATE d1_partners SET name=?, email=?, active=?, password_hash=COALESCE(?, password_hash) WHERE code=?"
      ).bind(name, email, active, password || null, code).run();
      return NextResponse.json({ ok: true, partner: { code } });
    } else {
      if (!password) return NextResponse.json({ error: "A password is required for a new partner" }, { status: 400 });
      const pid = crypto.randomUUID();
      await d1.prepare(
        "INSERT INTO d1_partners (id, code, name, email, password_hash, active, created_at, revenue_split) VALUES (?, ?, ?, ?, ?, ?, ?, 50)"
      ).bind(pid, code, name, email, password, active, new Date().toISOString()).run();
      await d1.prepare("INSERT INTO d1_partner_balances (partner_id, earned, hold, paid, balance) VALUES (?, 0, 0, 0, 0)").bind(pid).run();
      return NextResponse.json({ ok: true, partner: { id: pid, code } });
    }

  } catch (error: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
