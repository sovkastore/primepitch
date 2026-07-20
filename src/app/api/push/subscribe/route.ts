import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Stores (or removes) a browser's Web Push subscription together with the
// person's follow choices. Server-only table, reached with D1 database binding.

type AlertKey = "startingSoon" | "almostKickoff" | "kickoff" | "goal" | "halftime" | "secondHalf" | "fulltime";
const ALERT_KEYS: AlertKey[] = ["startingSoon", "almostKickoff", "kickoff", "goal", "halftime", "secondHalf", "fulltime"];

function cleanPrefs(raw: unknown): {
  wcAll: boolean;
  countries: string[];
  alerts: Record<AlertKey, boolean>;
} {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const wcAll = p.wcAll === true;
  const countries = Array.isArray(p.countries)
    ? (p.countries as unknown[])
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.slice(0, 60))
        .slice(0, 60)
    : [];
  const a = (p.alerts && typeof p.alerts === "object" ? p.alerts : {}) as Record<string, unknown>;
  const alerts = {} as Record<AlertKey, boolean>;
  // Default: every alert type on (people can switch any off).
  for (const k of ALERT_KEYS) {
    alerts[k] = k in a ? a[k] === true : true;
  }
  return { wcAll, countries, alerts };
}

export async function POST(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    const body = await request.json();
    const sub = body?.subscription;
    const endpoint: unknown = sub?.endpoint;
    const p256dh: unknown = sub?.keys?.p256dh;
    const auth: unknown = sub?.keys?.auth;
    if (
      typeof endpoint !== "string" ||
      typeof p256dh !== "string" ||
      typeof auth !== "string"
    ) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const prefs = cleanPrefs(body?.prefs);
    // Legacy topics column kept populated for backward compatibility.
    const topics = prefs.wcAll ? ["football:world-cup"] : [];

    const userAgent = typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : null;
    const lastSeenAt = new Date().toISOString();

    await d1.prepare(`
      INSERT INTO d1_push_subscriptions (endpoint, p256dh, auth, topics, prefs, user_agent, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        topics = excluded.topics,
        prefs = excluded.prefs,
        user_agent = excluded.user_agent,
        last_seen_at = excluded.last_seen_at
    `).bind(
      endpoint, p256dh, auth,
      JSON.stringify(topics), JSON.stringify(prefs),
      userAgent, lastSeenAt
    ).run();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST subscribe error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    const body = await request.json();
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await d1.prepare(`
      DELETE FROM d1_push_subscriptions WHERE endpoint = ?
    `).bind(endpoint).run();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE subscribe error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
