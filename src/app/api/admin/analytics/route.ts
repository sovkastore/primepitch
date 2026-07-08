import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function GET(request: NextRequest) {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const start = searchParams.get("start") || defaultStart;
    const end = searchParams.get("end") || now.toISOString();

    const emptyResponse = {
      start, end,
      people: { unique: 0, newVisitors: 0, returning: 0, returningRate: 0 },
      activity: {
        pageViews: 0, matchViews: 0, matchesWatched: 0, uniqueWatchers: 0,
        liveViews: 0, preViews: 0, watchersLive: 0, watchersPreOnly: 0,
        loadsPerPerson: 0, matchLoadsPerWatcher: 0,
      },
      byDevice: {},
      topMatches: [],
      topPages: [],
      topReferrers: [],
    };

    if (!d1) {
      console.warn("D1_BINDING_MISSING - Returning empty analytics");
      return NextResponse.json({ ...emptyResponse, error: "D1_BINDING_MISSING" });
    }

    try {
      // 1) People & Page Views
      const peopleRes = await d1.prepare(`
        SELECT 
          COUNT(*) as total_views,
          COUNT(DISTINCT visitor_id) as unique_visitors
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ?
      `).bind(start, end).first<any>();

      const active = num(peopleRes?.unique_visitors);
      const pageViews = num(peopleRes?.total_views);

      // 2) Match Activity
      const matchRes = await d1.prepare(`
        SELECT 
          COUNT(*) as match_views,
          COUNT(DISTINCT visitor_id) as unique_watchers,
          COUNT(DISTINCT match_id) as matches_watched,
          SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END) as live_views
        FROM d1_match_views
        WHERE created_at >= ? AND created_at <= ?
      `).bind(start, end).first<any>();

      const matchViews = num(matchRes?.match_views);
      const uniqueWatchers = num(matchRes?.unique_watchers);
      const matchesWatched = num(matchRes?.matches_watched);
      const liveViews = num(matchRes?.live_views);

      // 3) Breakdowns
      const deviceRes = await d1.prepare(`
        SELECT device_type, COUNT(*) as views
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY device_type
      `).bind(start, end).all();
      
      const byDevice: Record<string, number> = {};
      (deviceRes.results || []).forEach((r: any) => {
        byDevice[r.device_type || 'unknown'] = num(r.views);
      });

      const topMatchesRes = await d1.prepare(`
        SELECT match_id, MIN(match_title) as title, COUNT(*) as views
        FROM d1_match_views
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY match_id
        ORDER BY views DESC
        LIMIT 5
      `).bind(start, end).all();

      const topPagesRes = await d1.prepare(`
        SELECT path, COUNT(*) as views
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY path
        ORDER BY views DESC
        LIMIT 5
      `).bind(start, end).all();

      const referrerRes = await d1.prepare(`
        SELECT referrer, COUNT(*) as views
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ? AND referrer IS NOT NULL
        GROUP BY referrer
        ORDER BY views DESC
        LIMIT 20
      `).bind(start, end).all();

      const refCounts: Record<string, number> = {};
      (referrerRes.results || []).forEach((r: any) => {
        let host = r.referrer;
        try { host = new URL(r.referrer).hostname.replace(/^www\./, ""); } catch { }
        refCounts[host] = (refCounts[host] || 0) + num(r.views);
      });
      const topReferrers = Object.entries(refCounts)
        .sort(([, a], [, b]) => b - a).slice(0, 8).map(([source, views]) => ({ source, views }));

      return NextResponse.json({
        start, end,
        people: {
          unique: active,
          newVisitors: active,
          returning: 0,
          returningRate: 0,
        },
        activity: {
          pageViews,
          matchViews,
          matchesWatched,
          uniqueWatchers,
          liveViews,
          preViews: matchViews - liveViews,
          watchersLive: uniqueWatchers,
          watchersPreOnly: 0,
          loadsPerPerson: active ? round1(pageViews / active) : 0,
          matchLoadsPerWatcher: uniqueWatchers ? round1(matchViews / uniqueWatchers) : 0,
        },
        byDevice,
        topMatches: (topMatchesRes.results || []).map((r: any) => ({ match_id: r.match_id, title: r.title || r.match_id, views: num(r.views) })),
        topPages: (topPagesRes.results || []).map((r: any) => ({ path: r.path, views: num(r.views) })),
        topReferrers,
      });
    } catch (dbError: any) {
      console.error("D1 Analytics API Error:", dbError);
      return NextResponse.json({ ...emptyResponse, error: dbError.message });
    }
  } catch (e: any) {
    console.error("Analytics API error:", e);
    return NextResponse.json({ ...emptyResponse, error: e.message }, { status: 500 });
  }
}
