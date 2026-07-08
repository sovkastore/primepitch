import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function GET() {
  try {
    const d1 = await getD1();

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Real-time Presence (Last 6 minutes)
    const activeRes = await d1.prepare(`
      SELECT visitor_id, match_id, path 
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-6 minutes')
    `).all();
    
    const activeNow = activeRes.results || [];
    const onlineNow = activeNow.length;
    const liveViewers = activeNow.filter((r: any) => r.match_id).length;
    const ppvWatchingNow = activeNow.filter((r: any) => r.path === "/ppv").length;

    const matchViewers: Record<string, number> = {};
    activeNow.forEach((r: any) => {
      if (r.match_id) matchViewers[r.match_id as string] = (matchViewers[r.match_id as string] || 0) + 1;
    });
    const activeMatches = Object.entries(matchViewers)
      .sort(([, a], [, b]) => b - a)
      .map(([match_id, viewers]) => ({ match_id, viewers }));

    // 2) Volume Today (Since midnight UTC)
    const volumeToday = await d1.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as today_views,
        (SELECT COUNT(DISTINCT visitor_id) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as unique_today,
        (SELECT COUNT(*) FROM d1_match_views WHERE created_at >= datetime('now', 'start of day')) as match_views_today
    `).first<any>();

    // 3) Week Views
    const weekRes = await d1.prepare(`
      SELECT COUNT(*) as views FROM d1_page_views WHERE created_at >= datetime('now', '-7 days')
    `).first<any>();

    // 4) 30-Day Trend (Page views)
    const dailyPageRes = await d1.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*) as total_views,
        COUNT(DISTINCT visitor_id) as unique_visitors
      FROM d1_page_views 
      WHERE created_at >= datetime('now', '-30 days') 
      GROUP BY date
    `).all();

    // 5) 30-Day Trend (Match views)
    const dailyMatchRes = await d1.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*) as match_views
      FROM d1_match_views 
      WHERE created_at >= datetime('now', '-30 days') 
      GROUP BY date
    `).all();

    // 6) Sport Breakdown (7 Days)
    const sportRes = await d1.prepare(`
      SELECT sport, COUNT(*) as views 
      FROM d1_match_views 
      WHERE created_at >= datetime('now', '-7 days') 
      GROUP BY sport
    `).all();

    const sportBreakdown: Record<string, number> = {};
    (sportRes.results || []).forEach((r: any) => {
      sportBreakdown[r.sport || "other"] = r.views;
    });

    // 7) Top 10 Matches (Today)
    const topMatchesRes = await d1.prepare(`
      SELECT match_id, match_title as title, sport, COUNT(*) as views 
      FROM d1_match_views 
      WHERE created_at >= datetime('now', 'start of day') 
      GROUP BY match_id, match_title, sport 
      ORDER BY views DESC 
      LIMIT 10
    `).all();

    // Merge 30-day trends
    const matchViewsByDate: Record<string, number> = {};
    (dailyMatchRes.results || []).forEach((r: any) => {
      matchViewsByDate[r.date] = r.match_views;
    });

    const dailyStats = (dailyPageRes.results || []).map((r: any) => ({
      date: r.date,
      total_views: r.total_views,
      unique_visitors: r.unique_visitors,
      match_views: matchViewsByDate[r.date] || 0
    })).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      todayViews: volumeToday?.today_views || 0,
      uniqueToday: volumeToday?.unique_today || 0,
      onlineNow,
      liveViewers,
      ppvWatchingNow,
      activeMatches,
      matchViewsToday: volumeToday?.match_views_today || 0,
      weekViews: weekRes?.views || 0,
      dailyStats,
      sportBreakdown,
      topMatches: topMatchesRes.results || [],
    });

  } catch (e) {
    console.error("Overview D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
