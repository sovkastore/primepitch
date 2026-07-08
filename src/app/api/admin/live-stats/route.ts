import { NextResponse } from "next/server";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Get aggregated real-time counts from D1
    const activeStats = await d1.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(match_id) as live_viewers
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-6 minutes')
    `).first<any>();

    const onlineNow = activeStats?.total || 0;
    const liveViewers = activeStats?.live_viewers || 0;

    // 2) Per-match viewer counts (SQL aggregation)
    const matchCounts = await d1.prepare(`
      SELECT match_id, COUNT(*) as viewers
      FROM d1_active_viewers
      WHERE last_seen >= datetime('now', '-6 minutes') AND match_id IS NOT NULL
      GROUP BY match_id
      ORDER BY viewers DESC
    `).all();

    // 3) Per-page viewer counts (SQL aggregation)
    const pageCounts = await d1.prepare(`
      SELECT path, COUNT(*) as viewers
      FROM d1_active_viewers
      WHERE last_seen >= datetime('now', '-6 minutes')
      GROUP BY path
      ORDER BY viewers DESC
      LIMIT 50
    `).all();

    // 4) Get peaks from match_summaries
    const matchViewers: Record<string, number> = {};
    (matchCounts.results || []).forEach((r: any) => {
      matchViewers[r.match_id] = r.viewers;
    });

    const matchIds = Object.keys(matchViewers);
    let peaks: Record<string, number> = {};
    
    if (matchIds.length > 0) {
      try {
        const placeholders = matchIds.map(() => '?').join(',');
        const summaryRes = await d1.prepare(`
          SELECT match_id, peak_viewers 
          FROM d1_match_summaries 
          WHERE match_id IN (${placeholders})
        `).bind(...matchIds).all();
        
        (summaryRes.results || []).forEach((r: any) => {
          peaks[r.match_id] = r.peak_viewers;
        });
      } catch (e) {
        console.error("D1 Summary Fetch Error:", e);
      }
    }

    const activeMatches = (matchCounts.results || []).map((r: any) => ({
      match_id: r.match_id,
      viewers: r.viewers,
      peak: Math.max(r.viewers, peaks[r.match_id] || 0)
    }));

    const activePages = (pageCounts.results || []).map((r: any) => ({
      path: r.path,
      viewers: r.viewers
    }));

    // 5) Get Recent Activity (limited to 20 for memory safety)
    const recentRes = await d1.prepare(`
      SELECT path, device_type, created_at 
      FROM d1_page_views 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    const recentData = recentRes.results || [];

    return NextResponse.json({
      onlineNow,
      liveViewers,
      totalActive: onlineNow,
      activeMatches,
      matchRecords: [], // Historical match records removed (Supabase-dependent)
      activePages,
      recentActivity: recentData || [],
    });
  } catch (e) {
    console.error("Live stats API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
