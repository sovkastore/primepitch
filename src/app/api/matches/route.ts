import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Per-sport match list from the feeds (ppv.st + streamfree, see lib/feed.ts).
// (Originally a proxy for streamed.pk, which closed in Oct 2026.)
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
    const { getFeedMatches } = await import("@/lib/feed");
    const data = await getFeedMatches(sport);
    cache.set(sport, { data, ts: now });
    return NextResponse.json(data);
  } catch {
    // both feeds slow/unreachable - serve last good data (or empty).
    return NextResponse.json(hit?.data ?? [], { headers: { "x-pp-degraded": "1" } });
  }
}
