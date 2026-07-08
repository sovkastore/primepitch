import { NextResponse } from "next/server";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    
    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Real-time presence from D1 only (SQL aggregation)
    const activeStats = await d1.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(match_id) as live_viewers,
        SUM(CASE WHEN path = '/ppv' THEN 1 ELSE 0 END) as ppv_viewers
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-6 minutes')
    `).first<any>();
    
    const onlineNow = activeStats?.total || 0;
    const liveViewers = activeStats?.live_viewers || 0;
    const ppvWatchingNow = activeStats?.ppv_viewers || 0;

    const matchCounts = await d1.prepare(`
      SELECT match_id, COUNT(*) as viewers
      FROM d1_active_viewers
      WHERE last_seen >= datetime('now', '-6 minutes') AND match_id IS NOT NULL
      GROUP BY match_id
    `).all();
    const activeMatches = (matchCounts.results || []).map((r: any) => ({ 
      match_id: r.match_id, 
      viewers: r.viewers 
    }));

    // 2) Volume stats from D1 only (Today/Week)
    // Note: Historical data before D1 migration will NOT show up here.
    const volumeRes = await d1.prepare(`
      SELECT 
        (SELECT count(*) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as today_views,
        (SELECT count(DISTINCT visitor_id) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as unique_today,
        (SELECT count(*) FROM d1_match_views WHERE created_at >= datetime('now', 'start of day')) as match_today,
        (SELECT count(*) FROM d1_page_views WHERE created_at >= datetime('now', '-7 days')) as week_views
    `).first<any>();

    // 3) Top matches from D1 only (Today)
    const topMatchesRes = await d1.prepare(`
      SELECT match_id, MIN(match_title) as title, MIN(sport) as sport, COUNT(*) as views
      FROM d1_match_views
      WHERE created_at >= datetime('now', 'start of day')
      GROUP BY match_id
      ORDER BY views DESC
      LIMIT 10
    `).all();

    // 4) Sport breakdown from D1 only (7d)
    const sportRes = await d1.prepare(`
      SELECT sport, COUNT(*) as views
      FROM d1_match_views
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY sport
    `).all();
    
    const sportBreakdown: Record<string, number> = {};
    (sportRes.results || []).forEach((r: any) => {
      if (r.sport) sportBreakdown[r.sport] = r.views;
    });

    return NextResponse.json({
      todayViews: volumeRes?.today_views || 0,
      uniqueToday: volumeRes?.unique_today || 0,
      onlineNow,
      liveViewers,
      ppvWatchingNow,
      activeMatches,
      matchViewsToday: volumeRes?.match_today || 0,
      weekViews: volumeRes?.week_views || 0,
      dailyStats: [], // Daily history needs a separate worker to aggregate
      sportBreakdown,
      topMatches: topMatchesRes.results || [],
    });
  } catch (e) {
    console.error("Overview API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
