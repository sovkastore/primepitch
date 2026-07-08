import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);

export async function GET(request: NextRequest) {
  try {
    const d1 = await getD1();

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const start = searchParams.get("start") || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const end = searchParams.get("end") || now.toISOString();

    // 1) Total Page Views & Unique Visitors in window
    const pvRes = await d1.prepare(`
      SELECT 
        COUNT(*) as page_views,
        COUNT(DISTINCT visitor_id) as unique_people
      FROM d1_page_views 
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const pageViews = pvRes?.page_views || 0;
    const uniquePeople = pvRes?.unique_people || 0;

    // 2) New Visitors in window (Users whose MIN seen timestamp is in the window)
    const newRes = await d1.prepare(`
      SELECT COUNT(*) as new_visitors
      FROM (
        SELECT min(created_at) as first_seen
        FROM d1_page_views
        GROUP BY visitor_id
      )
      WHERE first_seen BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const newVisitors = newRes?.new_visitors || 0;
    const returningVisitors = Math.max(0, uniquePeople - newVisitors);

    // 3) Match Watch Activity
    const matchActivityRes = await d1.prepare(`
      SELECT 
        COUNT(*) as views,
        COUNT(DISTINCT visitor_id) as unique_watchers,
        COUNT(DISTINCT match_id) as matches_watched,
        COALESCE(SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END), 0) as live_views,
        COALESCE(SUM(CASE WHEN is_live = 0 THEN 1 ELSE 0 END), 0) as pre_views
      FROM d1_match_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const matchViews = matchActivityRes?.views || 0;
    const uniqueWatchers = matchActivityRes?.unique_watchers || 0;
    const matchesWatched = matchActivityRes?.matches_watched || 0;
    const liveViews = matchActivityRes?.live_views || 0;
    const preViews = matchActivityRes?.pre_views || 0;

    // 4) Watchers split (Live vs Pre-only)
    const watchersLiveRes = await d1.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as watchers_live
      FROM d1_match_views
      WHERE is_live = 1 AND created_at BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const watchersLive = watchersLiveRes?.watchers_live || 0;

    const watchersPreOnlyRes = await d1.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as watchers_pre_only
      FROM d1_match_views
      WHERE is_live = 0 AND created_at BETWEEN datetime(?) AND datetime(?)
        AND visitor_id NOT IN (
          SELECT DISTINCT visitor_id 
          FROM d1_match_views 
          WHERE is_live = 1 AND created_at BETWEEN datetime(?) AND datetime(?)
        )
    `).bind(start, end, start, end).first<any>();

    const watchersPreOnly = watchersPreOnlyRes?.watchers_pre_only || 0;

    // 5) Device Breakdown
    const deviceRes = await d1.prepare(`
      SELECT device_type, COUNT(*) as views
      FROM d1_page_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
      GROUP BY device_type
    `).bind(start, end).all();

    const byDevice: Record<string, number> = {};
    (deviceRes.results || []).forEach((r: any) => {
      byDevice[r.device_type || "unknown"] = r.views;
    });

    // 6) Top Matches (Limit 5)
    const topMatchesRes = await d1.prepare(`
      SELECT match_id, match_title as title, sport, COUNT(*) as views
      FROM d1_match_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
      GROUP BY match_id, match_title, sport
      ORDER BY views DESC
      LIMIT 5
    `).bind(start, end).all();

    const topMatches = (topMatchesRes.results || []).map((r: any) => ({
      match_id: r.match_id,
      title: r.title || r.match_id,
      views: r.views,
    }));

    // 7) Top Pages (Limit 5)
    const topPagesRes = await d1.prepare(`
      SELECT path, COUNT(*) as views
      FROM d1_page_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
      GROUP BY path
      ORDER BY views DESC
      LIMIT 5
    `).bind(start, end).all();

    const topPages = (topPagesRes.results || []).map((r: any) => ({
      path: r.path,
      views: r.views,
    }));

    // 8) Referrer Breakdown
    const referrerRes = await d1.prepare(`
      SELECT referrer as source, COUNT(*) as views
      FROM d1_page_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?) AND referrer IS NOT NULL AND referrer != ''
      GROUP BY referrer
    `).bind(start, end).all();

    const refCounts: Record<string, number> = {};
    (referrerRes.results || []).forEach((r: any) => {
      let host = r.source;
      try {
        host = new URL(r.source).hostname.replace(/^www\./, "");
      } catch {
        // Keep raw if invalid URL
      }
      refCounts[host] = (refCounts[host] || 0) + r.views;
    });

    const topReferrers = Object.entries(refCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([source, views]) => ({ source, views }));

    // Calculations
    const round1 = (x: number) => Math.round(x * 10) / 10;

    return NextResponse.json({
      start,
      end,
      people: {
        unique: uniquePeople,
        newVisitors,
        returning: returningVisitors,
        returningRate: uniquePeople ? round1((returningVisitors / uniquePeople) * 100) : 0,
      },
      activity: {
        pageViews,
        matchViews,
        matchesWatched,
        uniqueWatchers,
        liveViews,
        preViews,
        watchersLive,
        watchersPreOnly,
        loadsPerPerson: uniquePeople ? round1(pageViews / uniquePeople) : 0,
        matchLoadsPerWatcher: uniqueWatchers ? round1(matchViews / uniqueWatchers) : 0,
      },
      byDevice,
      topMatches,
      topPages,
      topReferrers,
    });

  } catch (e) {
    console.error("Analytics D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
