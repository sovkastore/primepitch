import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    // IF D1 IS MISSING, RETURN EMPTY DATA INSTEAD OF CRASHING
    if (!d1) {
      console.warn("D1_BINDING_MISSING - Returning empty live stats");
      return NextResponse.json({
        onlineNow: 0,
        liveViewers: 0,
        totalActive: 0,
        activeMatches: [],
        matchRecords: [],
        activePages: [],
        recentActivity: [],
      });
    }

    try {
      // 1) Get aggregated real-time counts from D1
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

      const matchCounts = await d1.prepare(`
        SELECT match_id, COUNT(*) as viewers
        FROM d1_active_viewers
        WHERE last_seen >= datetime('now', '-6 minutes') AND match_id IS NOT NULL
        GROUP BY match_id
        ORDER BY viewers DESC
      `).all();

      const pageCounts = await d1.prepare(`
        SELECT path, COUNT(*) as viewers
        FROM d1_active_viewers
        WHERE last_seen >= datetime('now', '-6 minutes')
        GROUP BY path
        ORDER BY viewers DESC
        LIMIT 50
      `).all();

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

      const recentRes = await d1.prepare(`
        SELECT path, device_type, created_at 
        FROM d1_page_views 
        ORDER BY created_at DESC 
        LIMIT 20
      `).all();

      return NextResponse.json({
        onlineNow,
        liveViewers,
        totalActive: onlineNow,
        activeMatches,
        matchRecords: [],
        activePages,
        recentActivity: recentRes.results || [],
      });
    } catch (dbError: any) {
      console.error("D1 Query Error:", dbError);
      return NextResponse.json({
        onlineNow: 0,
        liveViewers: 0,
        totalActive: 0,
        activeMatches: [],
        matchRecords: [],
        activePages: [],
        recentActivity: [],
        error: "Database query failed"
      });
    }
  } catch (e: any) {
    console.error("Live stats API error:", e);
    return NextResponse.json({
      onlineNow: 0,
      liveViewers: 0,
      totalActive: 0,
      activeMatches: [],
      matchRecords: [],
      activePages: [],
      recentActivity: [],
      error: e.message 
    });
  }
}
