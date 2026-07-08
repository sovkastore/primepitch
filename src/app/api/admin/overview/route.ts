import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    const sb = getSupabaseAdmin();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let onlineNow = 0;
    let liveViewers = 0;
    let ppvWatchingNow = 0;
    let activeMatches: any[] = [];
    let d1UniqueToday = 0;
    let d1MatchViewsToday = 0;
    let d1PageViewsToday = 0;

    if (d1) {
      // 1) Real-time presence from D1
      try {
        const activeRes = await d1.prepare(`
          SELECT visitor_id, match_id, path 
          FROM d1_active_viewers 
          WHERE last_seen >= datetime('now', '-6 minutes')
        `).all();
        const activeNow = activeRes.results || [];
        onlineNow = activeNow.length;
        liveViewers = activeNow.filter((r: any) => r.match_id).length;
        ppvWatchingNow = activeNow.filter((r: any) => r.path === "/ppv").length;

        const matchViewers: Record<string, number> = {};
        activeNow.forEach((r: any) => {
          if (r.match_id) matchViewers[r.match_id as string] = (matchViewers[r.match_id as string] || 0) + 1;
        });
        activeMatches = Object.entries(matchViewers).map(([match_id, viewers]) => ({ match_id, viewers }));

        // 2) Today's volume from D1 (since migration)
        const volumeRes = await d1.prepare(`
          SELECT 
            (SELECT count(*) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as p_views,
            (SELECT count(DISTINCT visitor_id) FROM d1_page_views WHERE created_at >= datetime('now', 'start of day')) as u_visitors,
            (SELECT count(*) FROM d1_match_views WHERE created_at >= datetime('now', 'start of day')) as m_views
        `).first<any>();
        
        d1PageViewsToday = volumeRes?.p_views || 0;
        d1UniqueToday = volumeRes?.u_visitors || 0;
        d1MatchViewsToday = volumeRes?.m_views || 0;
      } catch (e) {
        console.error("D1 Overview Error:", e);
      }
    }

    // Today's views from Supabase
    const { count: sbTodayViews } = await sb
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    // Today's unique visitors from Supabase
    let sbUniqueToday = 0;
    try {
      const { data } = await sb.rpc("count_distinct_visitors", { p_start: todayStart, p_end: nowIso });
      sbUniqueToday = Number(data) || 0;
    } catch {
      const { data } = await sb.from("page_views").select("visitor_id").gte("created_at", todayStart).limit(1000);
      sbUniqueToday = new Set(data?.map((r) => r.visitor_id)).size;
    }

    // Real-time presence (Supabase Fallback if D1 is empty)
    if (onlineNow === 0) {
      const nowWindow = new Date(now.getTime() - 6 * 60 * 1000).toISOString();
      const { data: activeSupabase } = await sb
        .from("active_viewers")
        .select("match_id, path")
        .gte("last_seen", nowWindow);
      onlineNow = activeSupabase?.length || 0;
      liveViewers = activeSupabase?.filter((r) => r.match_id).length || 0;
      ppvWatchingNow = activeSupabase?.filter((r) => r.path === "/ppv").length || 0;
      
      const matchViewers: Record<string, number> = {};
      activeSupabase?.forEach((r) => {
        if (r.match_id) matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
      });
      activeMatches = Object.entries(matchViewers).map(([match_id, viewers]) => ({ match_id, viewers }));
    }

    const { count: sbMatchViewsToday } = await sb
      .from("match_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    const { count: weekViews } = await sb
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { data: dailyStats } = await sb
      .from("daily_stats")
      .select("date, total_views, unique_visitors, match_views")
      .gte("date", thirtyDaysAgo)
      .order("date", { ascending: true });

    // Sport breakdown (7d)
    const sportBreakdown: Record<string, number> = {};
    try {
      const { data } = await sb.rpc("match_sport_breakdown", { p_start: weekAgo, p_end: nowIso });
      for (const r of (data || []) as { sport: string; views: number }[]) sportBreakdown[r.sport] = Number(r.views);
    } catch {
      const { data } = await sb.from("match_views").select("sport").gte("created_at", weekAgo).limit(50000);
      data?.forEach((r) => { const s = r.sport || "other"; sportBreakdown[s] = (sportBreakdown[s] || 0) + 1; });
    }

    // Top 10 matches today
    let top10: { match_id: string; title: string; sport: string; views: number }[] = [];
    try {
      const { data } = await sb.rpc("top_matches", { p_start: todayStart, p_end: nowIso, p_limit: 10 });
      top10 = ((data || []) as { match_id: string; match_title: string | null; sport: string | null; views: number }[]).map((r) => ({
        match_id: r.match_id, title: r.match_title || r.match_id, sport: r.sport || "", views: Number(r.views),
      }));
    } catch {
      const { data } = await sb.from("match_views").select("match_id, match_title, sport").gte("created_at", todayStart).limit(50000);
      const counts: Record<string, { title: string; sport: string; views: number }> = {};
      data?.forEach((r) => {
        if (!counts[r.match_id]) counts[r.match_id] = { title: r.match_title || r.match_id, sport: r.sport || "", views: 0 };
        counts[r.match_id].views++;
      });
      top10 = Object.entries(counts).sort(([, a], [, b]) => b.views - a.views).slice(0, 10)
        .map(([id, d]) => ({ match_id: id, ...d }));
    }

    return NextResponse.json({
      todayViews: (sbTodayViews || 0) + d1PageViewsToday,
      uniqueToday: Math.max(sbUniqueToday, d1UniqueToday),
      onlineNow,
      liveViewers,
      ppvWatchingNow,
      activeMatches,
      matchViewsToday: (sbMatchViewsToday || 0) + d1MatchViewsToday,
      weekViews: weekViews || 0,
      dailyStats: dailyStats || [],
      sportBreakdown,
      topMatches: top10,
    });
  } catch (e) {
    console.error("Overview API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
