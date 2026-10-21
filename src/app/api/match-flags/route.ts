import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { normTeamKey } from "@/lib/api";

// Public: which matches are hidden / featured / hot, so the upcoming lists
// can honor them. `hiddenTitles` carries a team-name key for each hidden match
// so the same fixture is hidden across every feed/league it appears under, not
// just the one id it was flagged on.
const TTL = 10_000;
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
      const res = await d1.prepare("SELECT match_id, hidden, hide_one, featured, hot, popular, match_data, custom_notice, alt_visible, force_ended FROM d1_match_flags ORDER BY updated_at DESC LIMIT 1000").all();
      
      let globalNotice = "";
      try {
        const configRow = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = 'alt_api_config'").first<{ value: string }>();
        if (configRow && configRow.value) {
          const config = JSON.parse(configRow.value);
          if (config.global_notice) globalNotice = config.global_notice;
        }
      } catch (e) {
        // ignore
      }

      // SQLite booleans are returned as 0 or 1, map them to boolean
      const flags = res.results.map((r: any) => ({
        ...r,
        hidden: Boolean(r.hidden),
        hide_one: Boolean(r.hide_one),
        featured: Boolean(r.featured),
        hot: Boolean(r.hot),
        popular: Boolean(r.popular),
        alt_visible: Boolean(r.alt_visible),
        custom_notice: r.custom_notice ? String(r.custom_notice).trim() : null,
        match_data: typeof r.match_data === "string" ? JSON.parse(r.match_data) : r.match_data
      }));

      // Fixtures the auto-live cron has turned into a real alt match in the
      // last day: mock id -> live alt id, so a viewer who opened the fixture
      // early lands on the real match once it exists.
      const converted: Record<string, string> = {};
      try {
        const since = Math.floor(Date.now() / 1000) - 24 * 3600;
        const cv = await d1.prepare("SELECT match_id, live_id FROM d1_auto_live WHERE status = 'converted' AND live_id IS NOT NULL AND kickoff >= ?").bind(since).all();
        for (const r of (cv.results || []) as any[]) if (r.match_id && r.live_id) converted[String(r.match_id)] = String(r.live_id);
      } catch { /* table may not exist yet */ }

      return { flags, globalNotice, converted };
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
    const altVisible: string[] = [];
    const forceEnded: string[] = [];
    const mockFixtures: any[] = [];
    const notices: Record<string, string> = {};
    for (const r of (data?.flags ?? []) as Array<{ match_id: string; hidden: boolean; hide_one: boolean; featured: boolean; hot: boolean; popular: boolean; alt_visible: boolean; force_ended: boolean; match_data: unknown; custom_notice?: string | null }>) {
      const teamKey = normTeamKey((r.match_data ?? {}) as { teams?: { home?: { name?: string }; away?: { name?: string } }; title?: string });
      if (r.hidden) {
        // Whole-fixture hide: by id AND by team name (covers every copy).
        hidden.push(r.match_id);
        if (teamKey) hiddenTitles.push(teamKey);
      } else if (r.hide_one) {
        // "Hide this copy": id only — never expands to same-teams copies.
        hidden.push(r.match_id);
      }
      if (r.featured) featured.push(r.match_id);
      if (r.hot) {
        hot.push(r.match_id);
        if (teamKey && teamKey.includes("|")) hot.push(teamKey);
      }
      if (r.popular) {
        popular.push(r.match_id);
        if (teamKey && teamKey.includes("|")) popular.push(teamKey);
      }
      if (r.alt_visible) {
        altVisible.push(r.match_id);
        if (r.match_data && (r.match_data as any).is_mock) {
          mockFixtures.push({ ...r.match_data, match_id: r.match_id });
        }
      }
      if (r.force_ended) forceEnded.push(r.match_id);
      if (r.custom_notice) notices[r.match_id] = r.custom_notice;
    }
    
    const result = { 
      hidden, featured, hot, popular, hiddenTitles, altVisible, forceEnded, notices, mockFixtures,
      converted: data?.converted || {},
      globalNotice: data?.globalNotice || ""
    };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (e) {
    console.error("DB error in match-flags:", e);
    // If DB is down, serve stale cache so the user sees something!
    return NextResponse.json(cache?.data ?? { hidden: [], featured: [], hot: [], popular: [], hiddenTitles: [], notices: {} });
  }
}
