import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Per-match "Notify me": add or remove a follow for one fixture, keyed by an
// accent-folded team pair (e.g. "japan|netherlands"). Reuses the same Web Push
// subscription the subscribe flow uses, so it adds no Cloudflare load.
//
// A follow lives in `match_follows`; the push engine reads that table directly.
// We also make sure a `push_subscriptions` row exists for this device (the
// follow has a foreign key onto it). For a device that has never used the full
// subscribe page, we seed minimal prefs (wcAll:false) so it ONLY gets the
// matches it explicitly follows — never the whole World Cup.

const DEFAULT_ALERTS = {
  startingSoon: true, almostKickoff: true, kickoff: true,
  goal: true, halftime: true, secondHalf: true, fulltime: true,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.action === "remove" ? "remove" : "add";
    const sub = body?.subscription;
    const endpoint: unknown = sub?.endpoint;
    const p256dh: unknown = sub?.keys?.p256dh;
    const auth: unknown = sub?.keys?.auth;
    const rawKey: unknown = body?.teamKey;

    if (typeof endpoint !== "string" || typeof rawKey !== "string" || !rawKey) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const teamKey = rawKey.slice(0, 120);
    const admin = getSupabaseAdmin();

    if (action === "remove") {
      await admin.from("match_follows").delete().eq("team_key", teamKey).eq("endpoint", endpoint);
      return NextResponse.json({ ok: true });
    }

    // ADD — keys required to (re)create the subscription row the follow depends on.
    if (typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (existing) {
      // Keep this device's existing follow choices; just refresh keys/seen.
      await admin
        .from("push_subscriptions")
        .update({
          p256dh, auth,
          last_seen_at: new Date().toISOString(),
          user_agent: typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : undefined,
        })
        .eq("endpoint", endpoint);
    } else {
      await admin.from("push_subscriptions").insert({
        endpoint, p256dh, auth,
        topics: [],
        prefs: { wcAll: false, countries: [], alerts: { ...DEFAULT_ALERTS } },
        user_agent: typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : null,
        last_seen_at: new Date().toISOString(),
      });
    }

    const title = typeof body?.title === "string" ? (body.title as string).slice(0, 120) : null;
    const { error } = await admin
      .from("match_follows")
      .upsert({ team_key: teamKey, endpoint, title }, { onConflict: "team_key,endpoint" });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
