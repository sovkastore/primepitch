import { NextResponse } from "next/server";
import { clusterRows } from "@/lib/match-merge";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Get Real-time Presence from Cloudflare D1
    const activeRes = await d1.prepare(`
      SELECT visitor_id, match_id, path, last_seen 
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-6 minutes')
    `).all();
    const activeData = activeRes.results || [];

    // 2) Get Recent Activity from Cloudflare D1
    const recentRes = await d1.prepare(`
      SELECT path, device_type, created_at 
      FROM d1_page_views 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    const recentData = recentRes.results || [];

    // Online Now / Live Viewers calculations
    const onlineNow = activeData.length;
    const liveViewers = activeData.filter((r: any) => r.match_id).length;
    const totalActive = onlineNow;

    const matchViewers: Record<string, number> = {};
    const pageViewers: Record<string, number> = {};

    activeData.forEach((r: any) => {
      if (r.match_id) {
        matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
      }
      pageViewers[r.path] = (pageViewers[r.path] || 0) + 1;
    });

    const activeMatches = Object.entries(matchViewers)
      .sort(([, a], [, b]) => b - a)
      .map(([match_id, viewers]) => ({ match_id, viewers }));

    // 3) Get Peaks & Uniques (For active matches enrichment + Bottom Table)
    const statsRes = await d1.prepare(`
      SELECT 
        mv.match_id, 
        MAX(mv.match_title) as match_title, 
        MAX(mv.sport) as sport, 
        MAX(mv.created_at) as updated_at, 
        MIN(mv.created_at) as first_viewed,
        COUNT(DISTINCT mv.visitor_id) as unique_viewers,
        COALESCE(s.peak_viewers, COUNT(DISTINCT mv.visitor_id)) as peak_viewers
      FROM d1_match_views mv
      LEFT JOIN d1_match_summaries s ON mv.match_id = s.match_id
      GROUP BY mv.match_id
      ORDER BY updated_at DESC
      LIMIT 25
    `).all();
    
    const statsData = (statsRes.results || []) as any[];

    const statsById: Record<string, { peak: number; unique: number }> = {};
    statsData.forEach((s) => {
      statsById[s.match_id] = { peak: s.peak_viewers, unique: s.unique_viewers };
    });

    const enrichedMatches = activeMatches.map((m) => ({
      ...m,
      peak: statsById[m.match_id]?.peak ?? m.viewers,
      unique: statsById[m.match_id]?.unique ?? null,
    }));

    const activePages = Object.entries(pageViewers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([path, viewers]) => ({ path, viewers }));

    // Merging / Clustering Logic (to handle duplicate listings in feed)
    const groups = clusterRows(statsData, {
      title: (r) => r.match_title,
      sport: (r) => r.sport,
      day: (r) => r.first_viewed || r.updated_at || "",
    });

    const mergedRecords = groups.map((rows: any[]) => {
      if (rows.length === 1) return rows[0];
      const top = rows.reduce((a, b) => (b.unique_viewers > a.unique_viewers ? b : a));
      return {
        ...top,
        peak_viewers: Math.max(...rows.map((r) => r.peak_viewers)),
        // recount uniques since we don't have list overlap details, top is safe proxy
        unique_viewers: Math.max(...rows.map((r) => r.unique_viewers)), 
      };
    });

    mergedRecords.sort((a: any, b: any) => (b.updated_at || "").localeCompare(a.updated_at || ""));

    return NextResponse.json({
      onlineNow,
      liveViewers,
      totalActive,
      activeMatches: enrichedMatches,
      matchRecords: mergedRecords,
      activePages,
      recentActivity: recentData || [],
    });

  } catch (e) {
    console.error("Live stats D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
