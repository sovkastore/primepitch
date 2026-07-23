import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-side proxy for streamed.pk's per-sport match list.
//
// The homepage used to fetch streamed.pk DIRECTLY from the visitor's browser and
// gate its loading screen on that call with no timeout. Any visitor whose network
// could not reach streamed.pk (some ISPs block it) was stuck on "Loading live
// matches..." forever. Routing it through the worker means the browser only talks
// to our own origin - which it can always reach - and we fetch streamed.pk
// server-side, where consumer ISP blocks do not apply. Mirrors /api/live-matches.

const SPORTS = new Set([
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
]);

const TTL = 30_000;
const cache = new Map<string, { data: unknown[]; ts: number }>();

export async function GET(req: Request) {
  const sport = new URL(req.url).searchParams.get("sport") || "";
  if (!SPORTS.has(sport)) return NextResponse.json([], { status: 400 });

  const now = Date.now();
  const hit = cache.get(sport);
  if (hit && now - hit.ts < TTL) return NextResponse.json(hit.data);

  try {
    const res = await fetch(`https://streamed.pk/api/matches/${sport}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "primepitch" },
    });
    const j = res.ok ? await res.json() : [];
    const data = Array.isArray(j) ? j : [];
    cache.set(sport, { data, ts: now });
    return NextResponse.json(data);
  } catch {
    // streamed.pk slow/unreachable from the server - serve last good data (or empty).
    return NextResponse.json(hit?.data ?? []);
  }
}
