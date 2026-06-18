import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows, normTitle } from "@/lib/match-merge";
import { getMatches, getAllMatches, getMatchStatus, isFinishedStatus, type Match } from "@/lib/api";

// Single source of truth for the Matches table — used by the admin Match
// Analytics page AND the partner / admin-p partner Matches views, so all three
// merge duplicate listings, attribute day + status from fixtures, and compute
// peak/unique identically. When `refCode` is given, each row also carries the
// partner split (his / own / yours).

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
  const sb = getSupabaseAdmin();
  const sport = params.sport || null;
  const sort = params.sort || "views";
  const status = params.status || "played";
  const from = params.from || null;
  const to = params.to || null;
  const page = params.page || 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  const refCode = params.refCode || null;

  // Day attribution = match START (first view); widen the fetch ±24h so a match
  // running past midnight isn't split, and matches that began before the window
  // can be detected and excluded.
  const BUFFER_MS = 24 * 60 * 60 * 1000;
  const fromFetch = from ? new Date(Date.parse(from) - BUFFER_MS).toISOString() : null;
  const toFetch = to ? new Date(Date.parse(to) + BUFFER_MS).toISOString() : null;

  // Page through ALL matching match_views (Supabase caps a select at 1000).
  const PAGE = 1000;
  const allData: Array<{
    match_id: string; match_title: string | null; sport: string | null;
    duration_sec: number | null; visitor_id: string; created_at: string; is_live: boolean | null;
  }> = [];
  for (let i = 0; i < 200; i++) {
    let q = sb.from("match_views")
      .select("match_id, match_title, sport, duration_sec, visitor_id, created_at, is_live")
      .order("id", { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    if (sport) q = q.eq("sport", sport);
    if (fromFetch) q = q.gte("created_at", fromFetch);
    if (toFetch) q = q.lte("created_at", toFetch);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE) break;
  }

  // Attribution map (visitor_id -> ref_code, non-null only). Needed during
  // grouping to split raw view-event counts. Only when a code is requested.
  const attrMap = new Map<string, string>();
  if (refCode) {
    for (let i = 0; i < 500; i++) {
      const { data, error } = await sb.from("visitors").select("visitor_id, ref_code")
        .not("ref_code", "is", null).order("visitor_id", { ascending: true }).range(i * PAGE, i * PAGE + PAGE - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data as Array<{ visitor_id: string; ref_code: string }>) attrMap.set(r.visitor_id, r.ref_code);
      if (data.length < PAGE) break;
    }
  }

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
    if (refCode) { const rc = attrMap.get(r.visitor_id); if (rc === refCode) g.vHis++; else if (rc === undefined) g.vOwn++; }
    if (r.is_live) g.liveViews++; else g.preViews++;
    g.uniqueViewers.add(r.visitor_id);
    if (r.is_live) g.liveViewers.add(r.visitor_id);
    g.totalDuration += r.duration_sec || 0;
    if (r.created_at > g.lastViewed) g.lastViewed = r.created_at;
    if (r.created_at < g.firstViewed) g.firstViewed = r.created_at;
    if (r.is_live && (!g.lastLiveView || r.created_at > g.lastLiveView)) g.lastLiveView = r.created_at;
    if (r.is_live && (!g.firstLiveView || r.created_at < g.firstLiveView)) g.firstLiveView = r.created_at;
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

  // Peak concurrent (total) per match from match_stats; merged peak = max across listings.
  const peakById: Record<string, number> = {};
  const allMatchIds = Object.values(merged).flatMap((m) => m.matchIds);
  if (allMatchIds.length > 0) {
    const { data: statRows } = await sb.from("match_stats").select("match_id, peak_viewers").in("match_id", allMatchIds);
    for (const s of (statRows ?? []) as Array<{ match_id: string; peak_viewers: number }>) {
      peakById[s.match_id] = s.peak_viewers ?? 0;
    }
  }

  // Per-match peak by segment (his code / organic). Only when a code is requested.
  const refPeak = new Map<string, Map<string, number>>(); // match_id -> seg -> peak
  if (refCode) {
    for (let i = 0; i < allMatchIds.length; i += 200) {
      const chunk = allMatchIds.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data } = await sb.from("match_ref_peak").select("match_id, seg, peak").in("match_id", chunk);
      for (const r of (data ?? []) as Array<{ match_id: string; seg: string; peak: number }>) {
        if (!refPeak.has(r.match_id)) refPeak.set(r.match_id, new Map());
        refPeak.get(r.match_id)!.set(r.seg, r.peak ?? 0);
      }
    }
  }

  // Fallback classifier for orphan telemetry (no fixture match).
  const LIVE_WINDOW = 3 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const classify = (g: { lastLiveView: string | null }): MatchStatus => {
    if (!g.lastLiveView) return "upcoming";
    return nowMs - Date.parse(g.lastLiveView) <= LIVE_WINDOW ? "live" : "played";
  };

  // Fixtures decide DAY + STATUS (feed → results → overrides). Telemetry is metrics only.
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
  } catch { /* feed unavailable */ }

  {
    let wcQuery = sb.from("wc_results").select("home_team, away_team, event_date, status");
    if (fromFetch) wcQuery = wcQuery.gte("event_date", fromFetch);
    if (toFetch) wcQuery = wcQuery.lte("event_date", toFetch);
    const { data: wc } = await wcQuery;
    for (const r of (wc ?? []) as Array<{ home_team: string; away_team: string; event_date: string; status: string | null }>) {
      if (!r.event_date) continue;
      const kickoffMs = Date.parse(r.event_date);
      const title = `${r.home_team} vs ${r.away_team}`;
      const st: MatchStatus = isFinishedStatus(r.status) ? "played" : statusByTime(kickoffMs);
      fixtureIndex.set(normTitle(title), { kickoffMs, status: st, sport: "football", title });
    }
  }

  {
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
  }

  // Force-lived matches (admin flag) are treated as LIVE here regardless of the
  // scheduled clock — the operator has declared the stream live, so the match
  // shows under Live and its viewers (recorded is_live) count as live. Clearing
  // the flag (or setting force_ended) reverts to the time-based status.
  try {
    const { data: flags } = await sb.from("match_flags")
      .select("match_data, forced_live, force_ended")
      .eq("forced_live", true);
    for (const r of (flags ?? []) as Array<{ match_data: { date?: number | string; title?: string; category?: string; teams?: { home?: { name?: string }; away?: { name?: string } } } | null; forced_live: boolean; force_ended: boolean | null }>) {
      if (r.force_ended) continue;
      const md = r.match_data || {};
      const home = md.teams?.home?.name; const away = md.teams?.away?.name;
      const hv = home && away ? home + " vs " + away : null;
      const title = md.title || hv;
      if (!title) continue;
      const kMs = typeof md.date === "number" ? md.date : (md.date ? Date.parse(md.date) : nowMs);
      const keys = [normTitle(title), hv ? normTitle(hv) : null].filter(Boolean) as string[];
      let existed = false;
      for (const k of keys) {
        const ex = fixtureIndex.get(k);
        if (ex) { fixtureIndex.set(k, { ...ex, status: "live" }); existed = true; }
      }
      if (!existed) fixtureIndex.set(normTitle(title), { kickoffMs: Number.isFinite(kMs) ? kMs : nowMs, status: "live", sport: md.category || "football", title });
    }
  } catch { /* match_flags unavailable */ }

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
    const peakHis = Math.max(0, ...m.matchIds.map((id) => refPeak.get(id)?.get(refCode) ?? 0));
    const peakOwn = Math.max(0, ...m.matchIds.map((id) => refPeak.get(id)?.get("__organic__") ?? 0));
    return {
      uniqueHis: his, uniqueOwn: total - attributed, uniqueYours: total - his,
      peakHis, peakOwn,
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

  // Scheduled fixtures with zero views (only when a specific day is selected).
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
  liveViews: number; preViews: number; // view-event totals (the "live · pre" sub-line)
  uniqueTotal: number; uniqueHis: number; uniqueYours: number; uniqueOwn: number;
  liveTotal: number; liveHis: number; liveYours: number; liveOwn: number; // watched live (distinct people)
  preTotal: number; preHis: number; preYours: number; preOwn: number; // before kickoff (distinct people)
  peakTotal: number; peakHis: number; peakYours: number; peakOwn: number;
  avgDuration: number; lastViewed: string; kickoff: number | null;
}

// Partner Matches (own dashboard + admin p/ view) — same merged/fixture-resolved
// rows as the admin page, plus the his/own/yours split. Returns ALL matches; the
// panel does its own status/sport/sort filtering client-side.
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
