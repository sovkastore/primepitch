import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d1 = await getD1();

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Real-time Presence (from Durable Object RAM)
    let onlineNow = 0;
    let liveViewers = 0;
    let ppvWatchingNow = 0;
    let activeMatches: any[] = [];
    
    try {
      const doUrl = "https://tracker.xellnetwork.xyz/stats";
      const res = await fetch(doUrl, { cache: "no-store" });
      if (res.ok) {
        const stats = await res.json() as any;
        onlineNow = stats.total_online || stats.total || 0;
        
        let matchWatchers = 0;
        if (stats.matches) {
          for (const mData of Object.values<any>(stats.matches)) {
            matchWatchers += mData.total || 0;
          }
        }
        liveViewers = typeof stats.watchers_total === "number" ? stats.watchers_total : matchWatchers;
        
        if (stats.pages && stats.pages["/ppv"]) {
           let ppvCount = 0;
           for (const count of Object.values<number>(stats.pages["/ppv"].refs || {})) ppvCount += count;
           ppvWatchingNow = ppvCount;
        }

        if (stats.matches) {
           activeMatches = Object.entries(stats.matches)
             .map(([match_id, data]: any) => ({
                match_id,
                viewers: data.total || 0
             }))
             .sort((a, b) => b.viewers - a.viewers);
        }
      }
    } catch(e) {}

    // 2) Volume Today (Since midnight UTC)
    const volumeToday = await d1.prepare(`
      SELECT 
        (SELECT SUM(page_views) FROM d1_ga4_cache WHERE date = date('now')) as today_views,
        (SELECT SUM(unique_visitors) FROM d1_ga4_cache WHERE date = date('now')) as unique_today,
        (SELECT COUNT(*) FROM d1_match_views WHERE created_at >= datetime('now', 'start of day')) as match_views_today
    `).first<any>();

    // 3) Week Views
    const weekRes = await d1.prepare(`
      SELECT SUM(page_views) as views FROM d1_ga4_cache WHERE date >= date('now', '-7 days')
    `).first<any>();

    // 4) 30-Day Trend (Page views)
    const dailyPageRes = await d1.prepare(`
      SELECT 
        date,
        SUM(page_views) as total_views,
        SUM(unique_visitors) as unique_visitors
      FROM d1_ga4_cache 
      WHERE date >= date('now', '-30 days') 
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
