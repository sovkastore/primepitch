import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows, normTitle } from "@/lib/match-merge";
import { getMatches, getAllMatches, getMatchStatus, isFinishedStatus, type Match } from "@/lib/api";
import { getD1 } from "./d1";


export type MatchStatus = "played" | "live" | "upcoming";

export interface EngineRow {
  match_id: string; title: string; sport: string;
  views: number; live_views: number; pre_views: number;
  unique_viewers: number; unique_live: number; unique_pre: number;
  peak_viewers: number; avg_duration: number; last_viewed: string;
  kickoff: number | null; status: MatchStatus;
  // present only when refCode is supplied
  uniqueHis?: number; uniqueOwn?: number; uniqueYours?: number;
  peakHis?: number; peakOwn?: number;
  viewsHis?: number; viewsOwn?: number;
  liveUniqueHis?: number; liveUniqueOwn?: number;
}

export interface EngineParams {
  sport?: string | null; sort?: "views" | "recent"; status?: MatchStatus | "all";
  from?: string | null; to?: string | null; page?: number; limit?: number;
  refCode?: string | null;
}

export interface EngineResult { matches: EngineRow[]; total: number; page: number }

export async function aggregateMatches(params: EngineParams): Promise<EngineResult> {
  const d1 = await getD1();
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

  // 1) Get Metrics from D1
  let where = "1=1";
  const args: any[] = [];
  if (from) { where += " AND created_at >= ?"; args.push(from); }
  if (to) { where += " AND created_at <= ?"; args.push(to); }
  // Sport filter is done post-aggregation to allow matching with fixtures

  const d1Query = `
    SELECT 
      match_id, 
      MAX(match_title) as title, 
      MAX(sport) as sport,
      COUNT(*) as views,
      SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END) as live_views,
      SUM(CASE WHEN is_live = 0 THEN 1 ELSE 0 END) as pre_views,
      COUNT(DISTINCT visitor_id) as unique_viewers,
      COUNT(DISTINCT CASE WHEN is_live = 1 THEN visitor_id END) as unique_live,
      AVG(duration_sec) as avg_duration,
      MAX(created_at) as last_viewed,
      MIN(created_at) as first_viewed,
      -- Partner Splits (New Data Only)
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as views_his,
      SUM(CASE WHEN ref_code IS NULL OR ref_code = '' THEN 1 ELSE 0 END) as views_own,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as unique_his,
      COUNT(DISTINCT CASE WHEN ref_code IS NULL OR ref_code = '' THEN visitor_id END) as unique_own,
      COUNT(DISTINCT CASE WHEN is_live = 1 AND ref_code = ? THEN visitor_id END) as live_unique_his
    FROM d1_match_views
    WHERE ${where}
    GROUP BY match_id
  `;
  
  const d1Res = await d1.prepare(d1Query).bind(refCode || "", refCode || "", refCode || "", ...args).all();
  const d1Rows = (d1Res.results || []) as any[];

  // 2) Get Peaks from Summaries
  const peaksRes = await d1.prepare(`SELECT match_id, peak_viewers FROM d1_match_summaries`).all();
  const peaksMap = new Map(peaksRes.results?.map((r: any) => [r.match_id, r.peak_viewers]) || []);

  // 3) Resolve Fixtures (Metadata)
  const fixtureIndex = new Map<string, { kickoffMs: number; status: MatchStatus; sport: string; title: string }>();
  try {
    const feed: Match[] = sport ? await getMatches(sport) : await getAllMatches();
    for (const m of feed) {
      if (!m.date) continue;
      const fs = getMatchStatus(m);
      const st: MatchStatus = m.ended || fs === "ended" ? "played" : fs;
      fixtureIndex.set(normTitle(m.title), { kickoffMs: m.date, status: st, sport: m.category || "", title: m.title });
    }
  } catch (e) { console.error("Feed fail:", e); }

  // 4) Cluster and Consolidate
  const entries = d1Rows.map((r) => ({
    match_id: r.match_id,
    title: r.title || r.match_id,
    sport: r.sport || "",
    views: r.views,
    live_views: r.live_views,
    pre_views: r.pre_views,
    unique_viewers: r.unique_viewers,
    unique_live: r.unique_live,
    unique_pre: Math.max(0, r.unique_viewers - r.unique_live),
    avg_duration: Math.round(r.avg_duration || 0),
    last_viewed: r.last_viewed,
    first_viewed: r.first_viewed,
    peak_viewers: peaksMap.get(r.match_id) || 0,
    // Partner splits
    viewsHis: r.views_his,
    uniqueHis: r.unique_his,
    uniqueOwn: r.unique_own,
    uniqueYours: Math.max(0, r.unique_viewers - r.unique_his),
    liveUniqueHis: r.live_unique_his,
    liveUniqueOwn: Math.max(0, r.unique_live - r.live_unique_his),
  }));

  const clusters = clusterRows(entries, { title: (r) => r.title, sport: (r) => r.sport, day: (r) => r.first_viewed });
  const rows: EngineRow[] = [];

  for (const cluster of clusters) {
    const top = cluster.reduce((a, b) => (b.unique_viewers > a.unique_viewers ? b : a));
    const fx = fixtureIndex.get(normTitle(top.title));
    
    // Status Logic
    const LIVE_WINDOW = 3.5 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const kickoffMs = fx ? fx.kickoffMs : Date.parse(top.first_viewed);
    const mStatus: MatchStatus = fx ? fx.status : (nowMs - Date.parse(top.last_viewed) <= LIVE_WINDOW ? "live" : "played");

    if (sport && top.sport !== sport && fx?.sport !== sport) continue;
    if (status !== "all" && mStatus !== status) continue;

    rows.push({
      match_id: top.match_id,
      title: fx?.title || top.title,
      sport: fx?.sport || top.sport,
      views: cluster.reduce((s, c) => s + c.views, 0),
      live_views: cluster.reduce((s, c) => s + c.live_views, 0),
      pre_views: cluster.reduce((s, c) => s + c.pre_views, 0),
      unique_viewers: top.unique_viewers, // Set logic would be better but top is a good proxy for clustered uniques
      unique_live: top.unique_live,
      unique_pre: top.unique_pre,
      peak_viewers: Math.max(...cluster.map(c => c.peak_viewers)),
      avg_duration: top.avg_duration,
      last_viewed: top.last_viewed,
      kickoff: kickoffMs,
      status: mStatus,
      // Ref Splits
      uniqueHis: refCode ? top.uniqueHis : undefined,
      uniqueOwn: refCode ? top.uniqueOwn : undefined,
      uniqueYours: refCode ? top.uniqueYours : undefined,
      viewsHis: refCode ? cluster.reduce((s, c) => s + c.viewsHis, 0) : undefined,
      viewsOwn: refCode ? cluster.reduce((s, c) => s + (c.views - c.viewsHis), 0) : undefined,
      liveUniqueHis: refCode ? top.liveUniqueHis : undefined,
      liveUniqueOwn: refCode ? top.liveUniqueOwn : undefined,
    });
  }

  rows.sort((a, b) => (sort === "recent" ? (b.kickoff ?? 0) - (a.kickoff ?? 0) : b.views - a.views));

  return { matches: rows.slice(offset, offset + limit), total: rows.length, page };
}

export interface PanelMatchRow {
  match_id: string; title: string; sport: string; status: MatchStatus;
  viewsTotal: number; viewsHis: number; viewsYours: number; viewsOwn: number;
  liveViews: number; preViews: number; uniqueTotal: number; uniqueHis: number; uniqueYours: number; uniqueOwn: number;
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
      avgDuration: m.avg_duration, last_viewed: m.last_viewed, lastViewed: m.last_viewed, kickoff: m.kickoff,
    } as PanelMatchRow;
  });
}
