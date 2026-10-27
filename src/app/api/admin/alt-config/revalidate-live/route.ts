import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";
import { fetchRapidPage, type RapidFeedMatch } from "@/lib/rapid-fetch";
import { saveMatchesCache } from "@/lib/match-cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await adminGuard(req as unknown as Request);
  if (denied) return denied;
  try {
    // Optional ?page=N: fetch a specific feed page. Page 1 replaces the cache;
    // deeper pages MERGE into it (a match fetched again is refreshed) so the
    // admin can accumulate the list page by page, as deep as the feed goes.
    const pageParam = Number(new URL(req.url).searchParams.get("page") || 1);
    const page = Math.min(50, Math.max(1, Number.isFinite(pageParam) ? Math.floor(pageParam) : 1));
    // Clear Next.js cache
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches-page-1");
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches");

    // We manually fetch from RapidAPI right here because the user is controlling it!
    const matches = (await fetchRapidPage("manual button", page)) ?? [];

    // Save to D1 Database Cache (preserves live matches from deeper feed
    // pages). Page 1 replaces; deeper pages merge into the existing cache.
    try {
      const d1 = await getD1();
      if (d1 && matches.length > 0) {
        let toSave = matches;
        if (page > 1) {
          const row = await d1
            .prepare("SELECT data FROM d1_pro_matches_cache WHERE id = 'matches_cache'")
            .first<{ data: string }>();
          const old: RapidFeedMatch[] = row?.data ? JSON.parse(row.data) : [];
          const key = (m: RapidFeedMatch) => `${m.home_team_name}|${m.away_team_name}|${m.match_time}`;
          const fetchedKeys = new Set(matches.map(key));
          toSave = [...old.filter((m) => !fetchedKeys.has(key(m))), ...matches];
        }
        await saveMatchesCache(d1, toSave);
      }
    } catch(e) {
      console.error("Failed to update D1 cache:", e);
    }

    return NextResponse.json({ ok: true, revalidated: true, type: "live-only", page, matchCount: matches.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
