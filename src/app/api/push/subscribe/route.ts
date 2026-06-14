import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Stores (or removes) a browser's Web Push subscription together with the
// person's follow choices. Server-only table, reached with the service role.

type AlertKey = "startingSoon" | "kickoff" | "goal" | "halftime" | "fulltime";
const ALERT_KEYS: AlertKey[] = ["startingSoon", "kickoff", "goal", "halftime", "fulltime"];

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
  // Sensible defaults: everything on except half-time.
  for (const k of ALERT_KEYS) {
    alerts[k] = k in a ? a[k] === true : k !== "halftime";
  }
  return { wcAll, countries, alerts };
}

export async function POST(request: NextRequest) {
  try {
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
    const { error } = await getSupabaseAdmin()
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          topics,
          prefs,
          user_agent:
            typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await getSupabaseAdmin()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
