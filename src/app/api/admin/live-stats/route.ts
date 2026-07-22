import { NextResponse } from "next/server";
import { clusterRows } from "@/lib/match-merge";
import { getD1 } from "@/lib/d1";

export async function GET() {
  try {
    const d1 = await getD1();

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    // 1) Get Real-time Presence from Durable Object (100% RAM)
    let onlineNow = 0;
    let liveViewers = 0;
    let totalActive = 0;
    let activeMatches: any[] = [];
    let activePages: any[] = [];

    try {
      const doUrl = "https://primepitch-live-tracker.daxonicstudios.workers.dev/stats";
      const res = await fetch(doUrl, { next: { revalidate: 15 } });
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
        totalActive = onlineNow;

        if (stats.matches) {
          activeMatches = Object.entries(stats.matches)
            .map(([match_id, data]: any) => ({ match_id, viewers: data.total || 0 }))
            .sort((a, b) => b.viewers - a.viewers);
        }

        if (stats.pages) {
          activePages = Object.entries(stats.pages)
            .map(([path, data]: any) => ({ path, viewers: data.total || 0 }))
            .sort((a, b) => b.viewers - a.viewers)
            .slice(0, 50);
        }
      }
    } catch(e) {}

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

    // Query recent activity for the live feed
    const recentViewsRes = await d1.prepare(`
      SELECT path, device_type, created_at 
      FROM d1_page_views 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();

    return NextResponse.json({
      onlineNow,
      liveViewers,
      totalActive,
      activeMatches: enrichedMatches,
      matchRecords: mergedRecords,
      activePages,
      recentActivity: recentViewsRes.results || [],
    });

  } catch (e) {
    console.error("Live stats D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
