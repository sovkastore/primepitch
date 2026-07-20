import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Per-match "Notify me": add or remove a follow for one fixture, keyed by an
// accent-folded team pair (e.g. "japan|netherlands"). Reuses the same Web Push
// subscription the subscribe flow uses.

const DEFAULT_ALERTS = {
  startingSoon: true, almostKickoff: true, kickoff: true,
  goal: true, halftime: true, secondHalf: true, fulltime: true,
};

export async function POST(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

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

    if (action === "remove") {
      await d1.prepare(`
        DELETE FROM d1_match_follows WHERE team_key = ? AND endpoint = ?
      `).bind(teamKey, endpoint).run();
      return NextResponse.json({ ok: true });
    }

    // ADD — keys required to (re)create the subscription row the follow depends on.
    if (typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const existing = await d1.prepare(`
      SELECT endpoint FROM d1_push_subscriptions WHERE endpoint = ?
    `).bind(endpoint).first<{ endpoint: string }>();

    const userAgent = typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : null;
    const lastSeenAt = new Date().toISOString();

    if (existing) {
      // Keep this device's existing follow choices; just refresh keys/seen.
      await d1.prepare(`
        UPDATE d1_push_subscriptions
        SET p256dh = ?, auth = ?, last_seen_at = ?, user_agent = ?
        WHERE endpoint = ?
      `).bind(p256dh, auth, lastSeenAt, userAgent, endpoint).run();
    } else {
      await d1.prepare(`
        INSERT INTO d1_push_subscriptions (endpoint, p256dh, auth, topics, prefs, user_agent, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        endpoint, p256dh, auth,
        JSON.stringify([]),
        JSON.stringify({ wcAll: false, countries: [], alerts: { ...DEFAULT_ALERTS } }),
        userAgent, lastSeenAt
      ).run();
    }

    const title = typeof body?.title === "string" ? (body.title as string).slice(0, 120) : null;
    await d1.prepare(`
      INSERT INTO d1_match_follows (team_key, endpoint, title, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(team_key, endpoint) DO UPDATE SET
        title = excluded.title
    `).bind(teamKey, endpoint, title, new Date().toISOString()).run();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST notify-match error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
