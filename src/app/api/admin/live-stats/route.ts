import { NextResponse } from "next/server";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Get Real-time Presence from Cloudflare ONLY
    const activeRes = await d1.prepare(`
      SELECT visitor_id, match_id, path, last_seen 
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-6 minutes')
    `).all();
    const activeData = activeRes.results || [];

    // 2) Get Recent Activity from Cloudflare ONLY
    const recentRes = await d1.prepare(`
      SELECT path, device_type, created_at 
      FROM d1_page_views 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    const recentData = recentRes.results || [];

    const onlineNow = activeData.length;
    const liveViewers = activeData.filter((r: any) => r.match_id).length;
    
    // Per-match viewer counts
    const matchViewers: Record<string, number> = {};
    const pageViewers: Record<string, number> = {};

    activeData.forEach((r: any) => {
      if (r.match_id) {
        matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
      }
      pageViewers[r.path] = (pageViewers[r.path] || 0) + 1;
    });

    // Per-match traction (Peak from match_summaries in D1)
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

    const activeMatches = Object.entries(matchViewers)
      .sort(([, a], [, b]) => b - a)
      .map(([match_id, viewers]) => ({
        match_id,
        viewers,
        peak: Math.max(viewers, peaks[match_id] || 0)
      }));

    const activePages = Object.entries(pageViewers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([path, viewers]) => ({ path, viewers }));

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
