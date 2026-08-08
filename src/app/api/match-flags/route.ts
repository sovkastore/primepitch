import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { normTeamKey } from "@/lib/api";

// Public: which matches are hidden / featured / hot, so the upcoming lists
// can honor them. `hiddenTitles` carries a team-name key for each hidden match
// so the same fixture is hidden across every feed/league it appears under, not
// just the one id it was flagged on.
const TTL = 30_000;
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const fetchFlags = (async () => {
      const res = await d1.prepare("SELECT match_id, hidden, hide_one, featured, hot, popular, match_data, custom_notice FROM d1_match_flags WHERE hidden = 0 ORDER BY updated_at DESC LIMIT 1000").all();
      // SQLite booleans are returned as 0 or 1, map them to boolean
      return res.results.map((r: any) => ({
        ...r,
        hidden: Boolean(r.hidden),
        hide_one: Boolean(r.hide_one),
        featured: Boolean(r.featured),
        hot: Boolean(r.hot),
        popular: Boolean(r.popular),
        custom_notice: r.custom_notice ? String(r.custom_notice).trim() : null,
        match_data: typeof r.match_data === "string" ? JSON.parse(r.match_data) : r.match_data
      }));
    })();
      
    // Race against a 3s timeout to keep the site snappy during DB glitches
    const data = await Promise.race([
      fetchFlags,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000))
    ]);
      
    const hidden: string[] = [];
    const featured: string[] = [];
    const hot: string[] = [];
    const popular: string[] = [];
    const hiddenTitles: string[] = [];
    const notices: Record<string, string> = {};
    for (const r of (data ?? []) as Array<{ match_id: string; hidden: boolean; hide_one: boolean; featured: boolean; hot: boolean; popular: boolean; match_data: unknown; custom_notice?: string | null }>) {
      if (r.hidden) {
        // Whole-fixture hide: by id AND by team name (covers every copy).
        hidden.push(r.match_id);
        const key = normTeamKey((r.match_data ?? {}) as { teams?: { home?: { name?: string }; away?: { name?: string } }; title?: string });
        if (key) hiddenTitles.push(key);
      } else if (r.hide_one) {
        // "Hide this copy": id only — never expands to same-teams copies.
        hidden.push(r.match_id);
      }
      if (r.featured) featured.push(r.match_id);
      if (r.hot) hot.push(r.match_id);
      if (r.popular) popular.push(r.match_id);
      if (r.custom_notice) notices[r.match_id] = r.custom_notice;
    }
    
    const result = { hidden, featured, hot, popular, hiddenTitles, notices };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch {
    // If DB is down, serve stale cache so the user sees something!
    return NextResponse.json(cache?.data ?? { hidden: [], featured: [], hot: [], popular: [], hiddenTitles: [], notices: {} });
  }
}
