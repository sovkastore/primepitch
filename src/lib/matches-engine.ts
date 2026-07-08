import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows, normTitle } from "@/lib/match-merge";
import { getMatches, getAllMatches, getMatchStatus, isFinishedStatus, type Match } from "@/lib/api";

// Single source of truth for the Matches table — used by the admin Match
// Analytics page AND the partner / admin-p partner Matches views.
// We query D1 for all high-speed traffic (views, peaks, referrers)
// and fetch metadata/configurations from Supabase.

export type MatchStatus = "played" | "live" | "upcoming";

export interface EngineRow {
  match_id: string;
  title: string;
  sport: string;
  views: number;
  live_views: number;
  pre_views: number;
  unique_viewers: number;
  unique_live: number;
  unique_pre: number;
  peak_viewers: number;
  avg_duration: number;
  last_viewed: string;
  kickoff: number | null;
  status: MatchStatus;
  // present only when refCode is supplied
  uniqueHis?: number;
  uniqueOwn?: number;
  uniqueYours?: number;
  peakHis?: number;
  peakOwn?: number;
  viewsHis?: number;
  viewsOwn?: number;
  liveUniqueHis?: number;
  liveUniqueOwn?: number;
}

export interface EngineParams {
  sport?: string | null;
  sort?: "views" | "recent";
  status?: MatchStatus | "all";
  from?: string | null;
  to?: string | null;
  page?: number;
  limit?: number;
  refCode?: string | null;
}

export interface EngineResult { matches: EngineRow[]; total: number; page: number }

export async function aggregateMatches(params: EngineParams): Promise<EngineResult> {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;
  const sb = getSupabaseAdmin();

  if (!d1) throw new Error("D1_BINDING_MISSING");

  const sport = params.sport || null;
  const sort = params.sort || "views";
  const status = params.status || "played";
  const from = params.from || null;
  const to = params.to || null;
  const page = params.page || 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  const refCode = params.refCode || null;

  // 1) Fetch telemetry from Cloudflare D1
  let viewsQuery = `
    SELECT match_id, match_title, sport, duration_sec, visitor_id, created_at, is_live 
    FROM d1_match_views
    WHERE 1=1
  `;
  const binds: any[] = [];

  if (sport) {
    viewsQuery += ` AND sport = ?`;
    binds.push(sport);
  }
  if (from) {
    // Buffer ±24h to avoid split days in UTC
    const fromFetch = new Date(Date.parse(from) - 24 * 60 * 60 * 1000).toISOString();
    viewsQuery += ` AND created_at >= ?`;
    binds.push(fromFetch);
  }
  if (to) {
    const toFetch = new Date(Date.parse(to) + 24 * 60 * 60 * 1000).toISOString();
    viewsQuery += ` AND created_at <= ?`;
    binds.push(toFetch);
  }

  const d1Res = await d1.prepare(viewsQuery).bind(...binds).all();
  const allData = (d1Res.results || []) as Array<{
    match_id: string; match_title: string | null; sport: string | null;
    duration_sec: number | null; visitor_id: string; created_at: string; is_live: number | null;
  }>;

  // 2) Fetch visitor referrals from D1 for partnerships
  const attrMap = new Map<string, string>();
  if (refCode) {
    const refRes = await d1.prepare(`SELECT visitor_id, partner_code FROM d1_partner_referrals`).all();
    (refRes.results || []).forEach((r: any) => {
      attrMap.set(r.visitor_id, r.partner_code);
    });
  }

  // Group views
  const grouped: Record<string, {
    title: string; sport: string; views: number; liveViews: number; preViews: number;
    uniqueViewers: Set<string>; liveViewers: Set<string>; totalDuration: number;
    lastViewed: string; firstViewed: string; lastLiveView: string | null; firstLiveView: string | null;
    vHis: number; vOwn: number;
  }> = {};

  allData.forEach((r) => {
    if (!grouped[r.match_id]) {
      grouped[r.match_id] = {
        title: r.match_title || r.match_id, sport: r.sport || "",
        views: 0, liveViews: 0, preViews: 0,
        uniqueViewers: new Set(), liveViewers: new Set(), totalDuration: 0,
        lastViewed: r.created_at, firstViewed: r.created_at, lastLiveView: null, firstLiveView: null,
        vHis: 0, vOwn: 0,
      };
    }
    const g = grouped[r.match_id];
    g.views++;
    if (refCode) {
      const rc = attrMap.get(r.visitor_id);
      if (rc === refCode) g.vHis++;
      else if (rc === undefined) g.vOwn++;
    }
    if (r.is_live === 1) g.liveViews++; else g.preViews++;
    g.uniqueViewers.add(r.visitor_id);
    if (r.is_live === 1) g.liveViewers.add(r.visitor_id);
    g.totalDuration += r.duration_sec || 0;
    if (r.created_at > g.lastViewed) g.lastViewed = r.created_at;
    if (r.created_at < g.firstViewed) g.firstViewed = r.created_at;
    if (r.is_live === 1 && (!g.lastLiveView || r.created_at > g.lastLiveView)) g.lastLiveView = r.created_at;
    if (r.is_live === 1 && (!g.firstLiveView || r.created_at < g.firstLiveView)) g.firstLiveView = r.created_at;
  });

  const merged: Record<string, {
    match_id: string; matchIds: string[]; title: string; titleViews: number; sport: string;
    views: number; liveViews: number; preViews: number;
    uniqueViewers: Set<string>; liveViewers: Set<string>; totalDuration: number;
    lastViewed: string; firstViewed: string; lastLiveView: string | null; firstLiveView: string | null;
    vHis: number; vOwn: number;
  }> = {};

  const entries = Object.entries(grouped).map(([id, g]) => ({ id, ...g }));
  const clusters = clusterRows(entries, { title: (r) => r.title, sport: (r) => r.sport, day: (r) => r.firstViewed });
  let ck = 0;
  for (const cluster of clusters) {
    const key = String(ck++);
    for (const g of cluster) {
      if (!merged[key]) {
        merged[key] = {
          match_id: g.id, matchIds: [], title: g.title, titleViews: g.views, sport: g.sport,
          views: 0, liveViews: 0, preViews: 0, uniqueViewers: new Set(), liveViewers: new Set(),
          totalDuration: 0, lastViewed: g.lastViewed, firstViewed: g.firstViewed,
          lastLiveView: null, firstLiveView: g.firstLiveView,
          vHis: 0, vOwn: 0,
        };
      }
      const m = merged[key];
      m.matchIds.push(g.id);
      m.views += g.views;
      m.liveViews += g.liveViews;
      m.preViews += g.preViews;
      m.vHis += g.vHis;
      m.vOwn += g.vOwn;
      g.uniqueViewers.forEach((v) => m.uniqueViewers.add(v));
      g.liveViewers.forEach((v) => m.liveViewers.add(v));
      m.totalDuration += g.totalDuration;
      if (g.lastViewed > m.lastViewed) m.lastViewed = g.lastViewed;
      if (g.firstViewed < m.firstViewed) m.firstViewed = g.firstViewed;
      if (g.firstLiveView && (!m.firstLiveView || g.firstLiveView < m.firstLiveView)) m.firstLiveView = g.firstLiveView;
      if (g.lastLiveView && (!m.lastLiveView || g.lastLiveView > m.lastLiveView)) m.lastLiveView = g.lastLiveView;
      if (g.views > m.titleViews) { m.title = g.title; m.titleViews = g.views; m.sport = g.sport; m.match_id = g.id; }
    }
  }

  // Peak concurrent per match from D1 summaries
  const peakById: Record<string, number> = {};
  const allMatchIds = Object.values(merged).flatMap((m) => m.matchIds);
  if (allMatchIds.length > 0) {
    const placeholders = allMatchIds.map(() => '?').join(',');
    const summaryRes = await d1.prepare(`
      SELECT match_id, peak_viewers 
      FROM d1_match_summaries 
      WHERE match_id IN (${placeholders})
    `).bind(...allMatchIds).all();
    
    (summaryRes.results || []).forEach((s: any) => {
      peakById[s.match_id] = s.peak_viewers ?? 0;
    });
  }

  // Fallback classifier for orphan D1 telemetry
  const LIVE_WINDOW = 3 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const classify = (g: { lastLiveView: string | null }): MatchStatus => {
    if (!g.lastLiveView) return "upcoming";
    return nowMs - Date.parse(g.lastLiveView) <= LIVE_WINDOW ? "live" : "played";
  };

  // Fixtures from Supabase/Static API decide status + score
  type Fixture = { kickoffMs: number; status: MatchStatus; sport: string; title: string };
  const statusByTime = (kMs: number): MatchStatus => {
    const diffMin = (kMs - nowMs) / 60000;
    if (diffMin > 0) return "upcoming";
    if (diffMin > -180) return "live";
    return "played";
  };
  const fixtureIndex = new Map<string, Fixture>();

  try {
    const feed: Match[] = sport ? await getMatches(sport) : await getAllMatches();
    for (const m of feed) {
      if (!m.date) continue;
      const fs = getMatchStatus(m);
      const st: MatchStatus = m.ended || fs === "ended" ? "played" : fs;
      fixtureIndex.set(normTitle(m.title), { kickoffMs: m.date, status: st, sport: m.category || "", title: m.title });
    }
  } catch { }

  try {
    const { data: wc } = await sb.from("wc_results").select("home_team, away_team, event_date, status");
    for (const r of (wc ?? []) as Array<{ home_team: string; away_team: string; event_date: string; status: string | null }>) {
      if (!r.event_date) continue;
      const kickoffMs = Date.parse(r.event_date);
      const title = `${r.home_team} vs ${r.away_team}`;
      const st: MatchStatus = isFinishedStatus(r.status) ? "played" : statusByTime(kickoffMs);
      fixtureIndex.set(normTitle(title), { kickoffMs, status: st, sport: "football", title });
    }
  } catch { }

  try {
    const { data: ov } = await sb.from("stream_overrides").select("match_title, match_data, enabled");
    for (const r of (ov ?? []) as Array<{ match_title: string | null; match_data: { date?: number | string; title?: string; category?: string } | null; enabled: boolean }>) {
      if (!r.enabled) continue;
      const md = r.match_data || {};
      const kickoffMs = typeof md.date === "number" ? md.date : (md.date ? Date.parse(md.date) : NaN);
      const title = r.match_title || md.title;
      if (!title || !Number.isFinite(kickoffMs)) continue;
      const key = normTitle(title);
      if (fixtureIndex.has(key)) continue;
      fixtureIndex.set(key, { kickoffMs, status: statusByTime(kickoffMs), sport: md.category || "football", title });
    }
  } catch { }

  try {
    const { data: flags } = await sb.from("match_flags").select("match_data, forced_live, force_ended").eq("forced_live", true);
    const finishedKeys = new Set<string>();
    try {
      const { data: fin } = await sb.from("push_match_state").select("match_key").eq("finished", true);
      for (const fr of (fin ?? []) as Array<{ match_key: string }>) if (fr.match_key) finishedKeys.add(fr.match_key);
    } catch { }
    const normTeam = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const FORCE_MAX_AGE_MS = 5 * 3600 * 1000;
    for (const r of (flags ?? []) as Array<{ match_data: { date?: number | string; title?: string; category?: string; teams?: { home?: { name?: string }; away?: { name?: string } } } | null; forced_live: boolean; force_ended: boolean | null }>) {
      if (r.force_ended) continue;
      const md = r.match_data || {};
      const home = md.teams?.home?.name; const away = md.teams?.away?.name;
      const hv = home && away ? home + " vs " + away : null;
      const title = md.title || hv;
      if (!title) continue;
      const kMs = typeof md.date === "number" ? md.date : (md.date ? Date.parse(md.date) : nowMs);
      const ph = normTeam(home || ""); const pa = normTeam(away || "");
      const reallyFinished = !!(ph && pa) && (finishedKeys.has("wc:" + ph + "|" + pa) || finishedKeys.has("wc:" + pa + "|" + ph));
      const tooOld = Number.isFinite(kMs) && (nowMs - kMs) > FORCE_MAX_AGE_MS;
      if (reallyFinished || tooOld) continue;
      const keys = [normTitle(title), hv ? normTitle(hv) : null].filter(Boolean) as string[];
      let existed = false;
      for (const k of keys) {
        const ex = fixtureIndex.get(k);
        if (ex) { fixtureIndex.set(k, { ...ex, status: "live" }); existed = true; }
      }
      if (!existed) fixtureIndex.set(normTitle(title), { kickoffMs: Number.isFinite(kMs) ? kMs : nowMs, status: "live", sport: md.category || "football", title });
    }
  } catch { }

  const resolveFixture = (title: string): Fixture | null => fixtureIndex.get(normTitle(title)) ?? null;
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  const inWindow = (kMs: number) => {
    if (fromMs === null && toMs === null) return true;
    return (fromMs === null || kMs >= fromMs) && (toMs === null || kMs <= toMs);
  };

  const splitOf = (m: { matchIds: string[]; uniqueViewers: Set<string>; liveViewers: Set<string>; vHis: number; vOwn: number }) => {
    if (!refCode) return {};
    let his = 0, attributed = 0;
    for (const v of m.uniqueViewers) {
      const rc = attrMap.get(v);
      if (rc !== undefined) { attributed++; if (rc === refCode) his++; }
    }
    let liveHis = 0, liveAttr = 0;
    for (const v of m.liveViewers) {
      const rc = attrMap.get(v);
      if (rc !== undefined) { liveAttr++; if (rc === refCode) liveHis++; }
    }
    const total = m.uniqueViewers.size;
    const liveTotal = m.liveViewers.size;
    // Map D1 partner referral peaks if we tracking splits later. Left organic/his as standard D1 data
    return {
      uniqueHis: his, uniqueOwn: total - attributed, uniqueYours: total - his,
      peakHis: 0, peakOwn: 0,
      viewsHis: m.vHis, viewsOwn: m.vOwn,
      liveUniqueHis: liveHis, liveUniqueOwn: liveTotal - liveAttr,
    };
  };

  const rows: EngineRow[] = [];
  const seen = new Set<string>();

  for (const g of Object.values(merged)) {
    const fx = resolveFixture(g.title);
    const kickoffMs = fx ? fx.kickoffMs : Date.parse(g.firstLiveView ?? g.firstViewed);
    if (!inWindow(kickoffMs)) continue;
    seen.add(normTitle(g.title));
    rows.push({
      match_id: g.match_id,
      title: fx?.title ?? g.title,
      sport: g.sport || fx?.sport || "",
      views: g.views,
      live_views: g.liveViews,
      pre_views: g.preViews,
      unique_viewers: g.uniqueViewers.size,
      unique_live: g.liveViewers.size,
      unique_pre: g.uniqueViewers.size - g.liveViewers.size,
      peak_viewers: Math.max(0, ...g.matchIds.map((id) => peakById[id] ?? 0)),
      avg_duration: g.views > 0 ? Math.round(g.totalDuration / g.views) : 0,
      last_viewed: g.lastViewed,
      kickoff: kickoffMs,
      status: fx ? fx.status : classify(g),
      ...splitOf(g),
    });
  }

  // Scheduled fixtures with zero views
  if (fromMs !== null && toMs !== null) {
    for (const [key, fx] of fixtureIndex) {
      if (seen.has(key)) continue;
      if (!inWindow(fx.kickoffMs)) continue;
      if (sport && fx.sport && fx.sport !== sport) continue;
      rows.push({
        match_id: `fixture:${key}`, title: fx.title, sport: fx.sport,
        views: 0, live_views: 0, pre_views: 0,
        unique_viewers: 0, unique_live: 0, unique_pre: 0,
        peak_viewers: 0, avg_duration: 0,
        last_viewed: new Date(fx.kickoffMs).toISOString(),
        kickoff: fx.kickoffMs, status: fx.status,
        ...(refCode ? { uniqueHis: 0, uniqueOwn: 0, uniqueYours: 0, peakHis: 0, peakOwn: 0, viewsHis: 0, viewsOwn: 0, liveUniqueHis: 0, liveUniqueOwn: 0 } : {}),
      });
    }
  }

  const filtered = rows.filter((m) => status === "all" || m.status === status);
  filtered.sort((a, b) => (sort === "recent" ? (b.kickoff ?? 0) - (a.kickoff ?? 0) : b.views - a.views));

  return { matches: filtered.slice(offset, offset + limit), total: filtered.length, page };
}

export interface PanelMatchRow {
  match_id: string; title: string; sport: string; status: MatchStatus;
  viewsTotal: number; viewsHis: number; viewsYours: number; viewsOwn: number;
  liveViews: number; preViews: number;
  uniqueTotal: number; uniqueHis: number; uniqueYours: number; uniqueOwn: number;
  liveTotal: number; liveHis: number; liveYours: number; liveOwn: number;
  preTotal: number; preHis: number; preYours: number; preOwn: number;
  peakTotal: number; peakHis: number; peakYours: number; peakOwn: number;
  avgDuration: number; lastViewed: string; kickoff: number | null;
}

export async function partnerMatches(refCode: string, day?: string | null): Promise<PanelMatchRow[]> {
  let from: string | null = null, to: string | null = null;
  if (day) { from = `${day}T00:00:00.000Z`; to = `${day}T23:59:59.999Z`; }
  const { matches } = await aggregateMatches({ refCode, from, to, status: "all", sort: "recent", page: 1, limit: 500 });
  return matches.map((m) => {
    const uniqueTotal = m.unique_viewers, uniqueHis = m.uniqueHis ?? 0, uniqueOwn = m.uniqueOwn ?? 0;
    const liveTotal = m.unique_live, liveHis = m.liveUniqueHis ?? 0, liveOwn = m.liveUniqueOwn ?? 0;
    const preTotal = m.unique_pre, preHis = Math.max(0, uniqueHis - liveHis), preOwn = Math.max(0, uniqueOwn - liveOwn);
    const viewsTotal = m.views, viewsHis = m.viewsHis ?? 0, viewsOwn = m.viewsOwn ?? 0;
    return {
      match_id: m.match_id, title: m.title, sport: m.sport, status: m.status,
      viewsTotal, viewsHis, viewsYours: Math.max(0, viewsTotal - viewsHis), viewsOwn,
      liveViews: m.live_views, preViews: m.pre_views,
      uniqueTotal, uniqueHis, uniqueYours: Math.max(0, uniqueTotal - uniqueHis), uniqueOwn,
      liveTotal, liveHis, liveYours: Math.max(0, liveTotal - liveHis), liveOwn,
      preTotal, preHis, preYours: Math.max(0, preTotal - preHis), preOwn,
      peakTotal: m.peak_viewers, peakHis: m.peakHis ?? 0, peakYours: m.peakOwn ?? 0, peakOwn: m.peakOwn ?? 0,
      avgDuration: m.avg_duration, lastViewed: m.last_viewed, kickoff: m.kickoff,
    };
  });
}
