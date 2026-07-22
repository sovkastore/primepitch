import { type OverviewData } from "@/components/partner/OverviewPanel";

export async function getPartnerOverviewD1(d1: D1Database, refCode: string): Promise<OverviewData> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const start = `${dateStr}T00:00:00.000Z`;
  const end = `${dateStr}T23:59:59.999Z`;

  // Fetch live active data from Durable Object
  let onlineTotal = 0;
  let onlineHis = 0;
  let liveTotal = 0;
  let liveHis = 0;

  try {
    const doUrl = "https://primepitch-live-tracker.daxonicstudios.workers.dev/stats";
    const res = await fetch(doUrl, { cache: "no-store" });
    if (res.ok) {
      const stats = await res.json() as any;
      onlineTotal = stats.total || 0;
      
      // Calculate 'his' total across all pages
      let hisPages = 0;
      if (stats.pages) {
        for (const [path, data] of Object.entries<any>(stats.pages)) {
          hisPages += data.refs?.[refCode] || 0;
        }
      }
      onlineHis = hisPages;

      // Calculate live on match pages
      if (stats.matches) {
        for (const [mId, data] of Object.entries<any>(stats.matches)) {
          liveTotal += data.total || 0;
          liveHis += data.refs?.[refCode] || 0;
        }
      }
    }
  } catch (e) {
    console.error("Failed to fetch DO stats:", e);
  }

  // 3) New Today
  const newRes = await d1.prepare(`
    SELECT 
      SUM(new_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN new_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date = ?
  `).bind(refCode, dateStr).first<any>();

  const newTotal = newRes?.total || 0;
  const newHis = newRes?.his || 0;

  // 4) Uniques Today (needed to calculate Returns = Uniques - New)
  const uniquesRes = await d1.prepare(`
    SELECT 
      SUM(unique_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN unique_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date = ?
  `).bind(refCode, dateStr).first<any>();

  const uTotal = uniquesRes?.total || 0;
  const uHis = uniquesRes?.his || 0;

  const returnsTotal = Math.max(0, uTotal - newTotal);
  const returnsHis = Math.max(0, uHis - newHis);

  // 5) Lifetime Visitors (ever joined)
  const lifetimeRes = await d1.prepare(`
    SELECT 
      SUM(unique_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN unique_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
  `).bind(refCode).first<any>();

  const lifeTotal = lifetimeRes?.total || 0;
  const lifeHis = lifetimeRes?.his || 0;

  // 6) Page Views Today
  const pvRes = await d1.prepare(`
    SELECT 
      SUM(page_views) as total,
      SUM(CASE WHEN ref_code = ? THEN page_views ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date = ?
  `).bind(refCode, dateStr).first<any>();

  const pvTotal = pvRes?.total || 0;
  const pvHis = pvRes?.his || 0;

  // 7) Match Views Today
  const mvRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_match_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, start, end).first<any>();

  const mvTotal = mvRes?.total || 0;
  const mvHis = mvRes?.his || 0;

  // 8) Active Matches
  let activeMatches: any[] = [];
  try {
    const doUrl = "https://primepitch-live-tracker.daxonicstudios.workers.dev/stats";
    const res = await fetch(doUrl, { cache: "no-store" });
    if (res.ok) {
      const stats = await res.json() as any;
      if (stats.matches) {
        activeMatches = Object.entries<any>(stats.matches).map(([match_id, data]) => ({
          match_id,
          total: data.total || 0,
          his: data.refs?.[refCode] || 0,
        }));
      }
    }
  } catch (e) {}

  const split = (t: number, h: number) => ({ total: t, his: h, yours: Math.max(0, t - h) });

  return {
    onlineNow: split(onlineTotal, onlineHis),
    liveNow: split(liveTotal, liveHis),
    newToday: split(newTotal, newHis),
    returnsToday: split(returnsTotal, returnsHis),
    totalVisitors: split(lifeTotal, lifeHis),
    pageViewsToday: split(pvTotal, pvHis),
    matchViewsToday: split(mvTotal, mvHis),
    activeMatches,
  };
}

import { type PulseData } from "@/components/partner/PulsePanel";

export async function getPartnerPulseD1(d1: D1Database, refCode: string): Promise<PulseData> {
  const split = (t: number, h: number, o: number) => ({ total: t, his: h, yours: Math.max(0, t - h), own: o });

  // 1) Fetch all active presence from Durable Object
  let activeRows: any[] = [];
  try {
    const doUrl = "https://primepitch-live-tracker.daxonicstudios.workers.dev/stats";
    const res = await fetch(doUrl, { cache: "no-store" });
    if (res.ok) {
      const stats = await res.json() as any;
      
      // Reconstruct "activeRows" approximation from DO stats
      // We don't have individual rows, but we have aggregated counts per page and match.
      // But the original code filters 'activeRows' by match_id, path, and ref_code.
      // To mimic activeRows:
      // Actually, since we only need counts, let's just populate a synthetic activeRows array 
      // or directly calculate the totals from stats.pages and stats.matches!
      // For compatibility with the rest of the function, we can build synthetic rows:
      if (stats.pages) {
        for (const [path, data] of Object.entries<any>(stats.pages)) {
          const refs = data.refs || {};
          let match_id = null;
          if (path.startsWith("/watch/")) {
            match_id = path.split("/").pop();
          }
          for (const [ref, count] of Object.entries<any>(refs)) {
            for (let i = 0; i < (count as number); i++) {
              activeRows.push({ path, ref_code: ref, match_id });
            }
          }
        }
      }
      if (stats.matches) {
        for (const [match_id, data] of Object.entries<any>(stats.matches)) {
          const refs = data.refs || {};
          for (const [ref, count] of Object.entries<any>(refs)) {
            for (let i = 0; i < (count as number); i++) {
              activeRows.push({ path: `/watch/${match_id}`, ref_code: ref, match_id });
            }
          }
        }
      }
    }
  } catch (e) {}

  const isOwn = (r: any) => !r.ref_code || r.ref_code === "none" || r.ref_code === "";

  // 2) Online Now & Live Page splits
  const onlineTotal = activeRows.length;
  const onlineHis = activeRows.filter((r) => r.ref_code === refCode).length;
  const onlineOwn = activeRows.filter(isOwn).length;

  const liveTotal = activeRows.filter((r) => r.match_id).length;
  const liveHis = activeRows.filter((r) => r.match_id && r.ref_code === refCode).length;
  const liveOwn = activeRows.filter((r) => r.match_id && isOwn(r)).length;

  const onlineNow = split(onlineTotal, onlineHis, onlineOwn);
  const liveNow = split(liveTotal, liveHis, liveOwn);

  // 3) Group Active Pages
  const pageBuckets: Record<string, { total: number; his: number; own: number }> = {};
  activeRows.forEach((r) => {
    const path = r.path || "/";
    if (!pageBuckets[path]) pageBuckets[path] = { total: 0, his: 0, own: 0 };
    pageBuckets[path].total++;
    if (r.ref_code === refCode) pageBuckets[path].his++;
    if (isOwn(r)) pageBuckets[path].own++;
  });

  const pages = Object.entries(pageBuckets)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 30)
    .map(([path, counts]) => ({
      path,
      total: counts.total,
      his: counts.his,
      yours: Math.max(0, counts.total - counts.his),
      own: counts.own,
    }));

  // 4) Group Active Matches
  const matchBuckets: Record<string, { total: number; his: number; own: number }> = {};
  activeRows.forEach((r) => {
    if (!r.match_id) return;
    if (!matchBuckets[r.match_id]) matchBuckets[r.match_id] = { total: 0, his: 0, own: 0 };
    matchBuckets[r.match_id].total++;
    if (r.ref_code === refCode) matchBuckets[r.match_id].his++;
    if (isOwn(r)) matchBuckets[r.match_id].own++;
  });

  const activeMatchIds = Object.keys(matchBuckets);
  let activeMatches: any[] = [];

  if (activeMatchIds.length > 0) {
    // Resolve peaks and titles for active matches
    const peaksRes = await d1.prepare(`
      SELECT match_id, peak_viewers 
      FROM d1_match_summaries
    `).all();
    const peaksMap = new Map(peaksRes.results?.map((r: any) => [r.match_id, r.peak_viewers]) || []);

    const titlesRes = await d1.prepare(`
      SELECT match_id, MAX(match_title) as match_title 
      FROM d1_match_views 
      GROUP BY match_id
    `).all();
    const titlesMap = new Map(titlesRes.results?.map((r: any) => [r.match_id, r.match_title]) || []);

    // Get uniques today for each active match
    const nowStr = new Date().toISOString().slice(0,10);
    const dayStart = `${nowStr}T00:00:00.000Z`;
    const uniquesRes = await d1.prepare(`
      SELECT 
        match_id,
        COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as uniques_his
      FROM d1_match_views
      WHERE created_at >= datetime(?)
      GROUP BY match_id
    `).bind(refCode, dayStart).all();
    const uniquesMap = new Map((uniquesRes.results || []).map((r: any) => [r.match_id, r.uniques_his]));

    activeMatches = activeMatchIds.map((matchId) => {
      const counts = matchBuckets[matchId];
      const peakTotal = peaksMap.get(matchId) || counts.total;
      const uniquesHis = uniquesMap.get(matchId) || counts.his;
      const peakHis = Math.max(counts.his, Math.round(uniquesHis * 0.65));

      const peakOwn = Math.round(peakTotal * (counts.own / (counts.total || 1)));

      return {
        match_id: matchId,
        title: titlesMap.get(matchId) || matchId,
        total: counts.total,
        his: counts.his,
        yours: Math.max(0, counts.total - counts.his),
        own: counts.own,
        peakTotal,
        peakHis,
        peakYours: Math.max(0, peakTotal - peakHis),
        peakOwn,
      };
    });
  }

  return {
    onlineNow,
    liveNow,
    matches: activeMatches,
    pages,
  };
}

import { type AnalyticsData } from "@/components/partner/AnalyticsPanel";

export async function getPartnerAnalyticsD1(
  d1: D1Database,
  refCode: string,
  start: string,
  end: string
): Promise<AnalyticsData> {
  const split = (t: number, h: number) => ({ total: t, his: h, yours: Math.max(0, t - h) });

  // 1) Page Views (range)
  const pvRes = await d1.prepare(`
    SELECT 
      SUM(page_views) as total,
      SUM(CASE WHEN ref_code = ? THEN page_views ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const pageViews = split(pvRes?.total || 0, pvRes?.his || 0);

  // 2) Unique Visitors (range)
  const uRes = await d1.prepare(`
    SELECT 
      SUM(unique_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN unique_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const unique = split(uRes?.total || 0, uRes?.his || 0);

  // 3) New Visitors (range)
  const newRes = await d1.prepare(`
    SELECT 
      SUM(new_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN new_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const newVisitors = split(newRes?.total || 0, newRes?.his || 0);

  // 4) Returning Visitors (range)
  const returning = split(
    Math.max(0, unique.total - newVisitors.total),
    Math.max(0, unique.his - newVisitors.his)
  );

  // 5) Match Views / Watchers statistics (range)
  const statsRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his,
      
      SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END) as live_total,
      SUM(CASE WHEN is_live = 1 AND ref_code = ? THEN 1 ELSE 0 END) as live_his,
      
      SUM(CASE WHEN is_live = 0 THEN 1 ELSE 0 END) as pre_total,
      SUM(CASE WHEN is_live = 0 AND ref_code = ? THEN 1 ELSE 0 END) as pre_his,
      
      COUNT(DISTINCT visitor_id) as watchers_total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as watchers_his,
      
      COUNT(DISTINCT match_id) as matches_watched_total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN match_id END) as matches_watched_his,
      
      COUNT(DISTINCT CASE WHEN is_live = 1 THEN visitor_id END) as watchers_live_total,
      COUNT(DISTINCT CASE WHEN is_live = 1 AND ref_code = ? THEN visitor_id END) as watchers_live_his
    FROM d1_match_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, refCode, refCode, refCode, refCode, refCode, start, end).first<any>();

  const matchViews = split(statsRes?.total || 0, statsRes?.his || 0);
  const liveViews = split(statsRes?.live_total || 0, statsRes?.live_his || 0);
  const preViews = split(statsRes?.pre_total || 0, statsRes?.pre_his || 0);
  
  const uniqueWatchers = split(statsRes?.watchers_total || 0, statsRes?.watchers_his || 0);
  const matchesWatched = split(statsRes?.matches_watched_total || 0, statsRes?.matches_watched_his || 0);
  const watchersLive = split(statsRes?.watchers_live_total || 0, statsRes?.watchers_live_his || 0);

  // 6) Top Matches
  const matchesRes = await d1.prepare(`
    SELECT 
      match_id,
      MAX(match_title) as title,
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_match_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
    GROUP BY match_id
    ORDER BY total DESC
    LIMIT 20
  `).bind(refCode, start, end).all();

  const topMatches = (matchesRes.results || []).map((r: any) => ({
    match_id: r.match_id,
    title: r.title || r.match_id,
    total: r.total,
    his: r.his || 0,
  }));

  // 7) Device, Pages, Referrers Breakdowns
  const cacheRes = await d1.prepare(`
    SELECT ref_code, devices_json, pages_json, referrers_json
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(start, end).all();

  const devMap: Record<string, { total: number; his: number }> = {};
  const pgMap: Record<string, { total: number; his: number }> = {};
  const refMap: Record<string, { total: number; his: number }> = {};

  const addMap = (target: any, jsonStr: string, isHis: boolean) => {
    if (!jsonStr) return;
    try {
      const obj = JSON.parse(jsonStr);
      for (const [k, v] of Object.entries(obj)) {
        if (!target[k]) target[k] = { total: 0, his: 0 };
        target[k].total += (v as number);
        if (isHis) target[k].his += (v as number);
      }
    } catch (e) {}
  };

  (cacheRes.results || []).forEach((row: any) => {
    const isHis = row.ref_code === refCode;
    addMap(devMap, row.devices_json, isHis);
    addMap(pgMap, row.pages_json, isHis);
    addMap(refMap, row.referrers_json, isHis);
  });

  const byDevice = Object.entries(devMap)
    .sort(([, a], [, b]) => b.total - a.total).slice(0, 20)
    .map(([name, v]) => ({ name, total: v.total, his: v.his }));

  const topPages = Object.entries(pgMap)
    .sort(([, a], [, b]) => b.total - a.total).slice(0, 20)
    .map(([path, v]) => ({ path, total: v.total, his: v.his }));

  const topReferrers = Object.entries(refMap)
    .sort(([, a], [, b]) => b.total - a.total).slice(0, 20)
    .map(([source, v]) => ({ source, total: v.total, his: v.his }));

  return {
    unique,
    newVisitors,
    returning,
    pageViews,
    matchViews,
    uniqueWatchers,
    matchesWatched,
    liveViews,
    preViews,
    watchersLive,
    byDevice,
    topMatches,
    topPages,
    topReferrers,
  };
}

import { type VisitorsData } from "@/components/partner/VisitorsPanel";

export async function getPartnerVisitorsD1(
  d1: D1Database,
  refCode: string,
  date: string
): Promise<VisitorsData> {
  const split = (t: number, h: number) => ({ total: t, his: h, yours: Math.max(0, t - h) });
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  
  const DAY_MS = 24 * 60 * 60 * 1000;
  const trendStart = new Date(Date.now() - 30 * DAY_MS).toISOString();

  // 1) Lifetime stats (overall users ever joined)
  const lifeRes = await d1.prepare(`
    SELECT 
      COUNT(DISTINCT visitor_id) as total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as his
    FROM d1_page_views
  `).bind(refCode).first<any>();

  const totalVisitors = split(lifeRes?.total || 0, lifeRes?.his || 0);

  // 2) Came Back (visited on more than one calendar date)
  const cbRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM (
      SELECT visitor_id, MAX(ref_code) as ref_code
      FROM d1_page_views
      GROUP BY visitor_id
      HAVING COUNT(DISTINCT strftime('%Y-%m-%d', created_at)) > 1
    )
  `).bind(refCode).first<any>();

  const cameBack = split(cbRes?.total || 0, cbRes?.his || 0);

  // 3) One Time Only
  const oneTime = split(
    Math.max(0, totalVisitors.total - cameBack.total),
    Math.max(0, totalVisitors.his - cameBack.his)
  );

  // 4) Selected Day Details: Page Views
  const pvRes = await d1.prepare(`
    SELECT 
      SUM(page_views) as total,
      SUM(CASE WHEN ref_code = ? THEN page_views ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const pageViews = split(pvRes?.total || 0, pvRes?.his || 0);

  // 5) Selected Day Details: Unique Visitors
  const uRes = await d1.prepare(`
    SELECT 
      SUM(unique_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN unique_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const unique = split(uRes?.total || 0, uRes?.his || 0);

  // 6) Selected Day Details: New Visitors
  const newRes = await d1.prepare(`
    SELECT 
      SUM(new_visitors) as total,
      SUM(CASE WHEN ref_code = ? THEN new_visitors ELSE 0 END) as his
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(refCode, start, end).first<any>();

  const newToday = split(newRes?.total || 0, newRes?.his || 0);

  // 7) Selected Day Details: Returning Visitors
  const returning = split(
    Math.max(0, unique.total - newToday.total),
    Math.max(0, unique.his - newToday.his)
  );

  // 8) Device Breakdowns (Selected Day)
  const devCacheRes = await d1.prepare(`
    SELECT ref_code, devices_json
    FROM d1_ga4_cache
    WHERE date >= date(?) AND date <= date(?)
  `).bind(start, end).all();

  const devMap: Record<string, { total: number; his: number }> = {};
  (devCacheRes.results || []).forEach((row: any) => {
    const isHis = row.ref_code === refCode;
    if (row.devices_json) {
      try {
        const obj = JSON.parse(row.devices_json);
        for (const [k, v] of Object.entries(obj)) {
          if (!devMap[k]) devMap[k] = { total: 0, his: 0 };
          devMap[k].total += (v as number);
          if (isHis) devMap[k].his += (v as number);
        }
      } catch (e) {}
    }
  });

  const byDevice = Object.entries(devMap)
    .sort(([, a], [, b]) => b.total - a.total).slice(0, 20)
    .map(([name, v]) => ({ name, total: v.total, his: v.his }));

  // 9) Trend unique (last 30 days)
  const trendRes = await d1.prepare(`
    SELECT 
      strftime('%Y-%m-%d', created_at) as day_val,
      COUNT(DISTINCT visitor_id) as total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as his
    FROM d1_page_views
    WHERE created_at >= datetime(?)
    GROUP BY day_val
  `).bind(refCode, trendStart).all();

  const trendMap = new Map((trendRes.results || []).map((r: any) => [
    r.day_val, 
    { total: r.total, his: r.his }
  ]));

  const trendUnique: { date: string; total: number; his: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const val = trendMap.get(d) || { total: 0, his: 0 };
    trendUnique.push({
      date: d,
      total: val.total,
      his: val.his,
    });
  }

  // 10) Roster (Referred joined members)
  const rosterRes = await d1.prepare(`
    SELECT 
      visitor_id, 
      first_seen, 
      last_seen, 
      visit_count,
      device_type
    FROM (
      SELECT 
        visitor_id,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen,
        COUNT(*) as visit_count,
        MAX(device_type) as device_type,
        (SELECT ref_code FROM d1_page_views pv WHERE pv.visitor_id = main.visitor_id ORDER BY pv.created_at ASC LIMIT 1) as first_ref
      FROM d1_page_views main
      GROUP BY visitor_id
    )
    WHERE first_ref = ?
    ORDER BY last_seen DESC
    LIMIT 50
  `).bind(refCode).all();

  const hisRoster = (rosterRes.results || []).map((r: any) => ({
    visitor_id: r.visitor_id,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    visit_count: r.visit_count,
    device_type: r.device_type,
  }));

  return {
    unique,
    pageViews,
    newToday,
    returning,
    totalVisitors,
    cameBack,
    oneTime,
    byDevice,
    trendUnique,
    hisRoster,
  };
}
