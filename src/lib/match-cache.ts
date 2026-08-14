// Shared writer for the RapidAPI matches cache. The feed is paginated, so a
// fresh fetch (often just page 1) can be missing matches we currently have
// LIVE on the site from a deeper page. Overwriting the cache blindly would
// break those viewers' watch pages — so before saving, carry over the cached
// entries of any still-live converted match that the new list doesn't contain.

export interface FeedMatch {
  home_team_name: string;
  away_team_name: string;
  match_time: string | number;
  match_status?: string;
  league_name?: string;
  home_team_logo?: string;
  away_team_logo?: string;
  servers?: unknown[];
}

const LIVE_WINDOW_MINUTES = 130;

function altId(m: FeedMatch): string {
  return `alt-${(m.home_team_name || "").replace(/\s+/g, "")}-${(m.away_team_name || "").replace(/\s+/g, "")}-${m.match_time}`;
}

export async function saveMatchesCache(d1: D1Database, fetched: FeedMatch[]): Promise<void> {
  let toSave = fetched;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const { results: liveRows } = await d1
      .prepare(
        "SELECT live_id FROM d1_auto_live WHERE status = 'converted' AND live_id IS NOT NULL AND kickoff >= ? AND kickoff <= ?"
      )
      .bind(nowSec - LIVE_WINDOW_MINUTES * 60, nowSec)
      .all<{ live_id: string }>();

    const liveIds = new Set((liveRows ?? []).map((r) => r.live_id));
    if (liveIds.size > 0) {
      const fetchedIds = new Set(fetched.map(altId));
      const missingIds = [...liveIds].filter((id) => !fetchedIds.has(id));
      if (missingIds.length > 0) {
        const row = await d1
          .prepare("SELECT data FROM d1_pro_matches_cache WHERE id = 'matches_cache'")
          .first<{ data: string }>();
        const old: FeedMatch[] = row?.data ? JSON.parse(row.data) : [];
        const carryOver = old.filter((m) => missingIds.includes(altId(m)));
        if (carryOver.length > 0) toSave = [...fetched, ...carryOver];
      }
    }
  } catch {
    /* preservation is best-effort — never block the cache update */
  }

  await d1
    .prepare(
      `INSERT INTO d1_pro_matches_cache (id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .bind("matches_cache", JSON.stringify(toSave), Date.now())
    .run();
}
