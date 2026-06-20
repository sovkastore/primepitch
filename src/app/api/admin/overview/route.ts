import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Today's views (count is cap-immune with head:true)
    const { count: todayViews } = await sb
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    // Today's unique visitors — counted in Postgres (was capped at 1000 in JS).
    let uniqueToday = 0;
    try {
      const { data, error } = await sb.rpc("count_distinct_visitors", { p_start: todayStart, p_end: nowIso });
      if (error) throw error;
      uniqueToday = Number(data) || 0;
    } catch {
      const { data } = await sb.from("page_views").select("visitor_id").gte("created_at", todayStart).limit(50000);
      uniqueToday = new Set(data?.map((r) => r.visitor_id)).size;
    }

    // Real-time presence (last 6 min).
    const nowWindow = new Date(now.getTime() - 6 * 60 * 1000).toISOString();
    const { data: activeNow } = await sb
      .from("active_viewers")
      .select("match_id, path")
      .gte("last_seen", nowWindow);
    const onlineNow = activeNow?.length || 0;
    const liveViewers = activeNow?.filter((r) => r.match_id).length || 0;
    const ppvWatchingNow = activeNow?.filter((r) => r.path === "/ppv").length || 0;

    // Per-match breakdown so the overview can count genuinely-live viewers
    // client-side (same status logic as Pulse).
    const matchViewers: Record<string, number> = {};
    activeNow?.forEach((r) => {
      if (r.match_id) matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
    });
    const activeMatches = Object.entries(matchViewers).map(([match_id, viewers]) => ({ match_id, viewers }));

    const { count: matchViewsToday } = await sb
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

    // Sport breakdown (7d) — grouped in Postgres (was capped at 1000 in JS).
    const sportBreakdown: Record<string, number> = {};
    try {
      const { data, error } = await sb.rpc("match_sport_breakdown", { p_start: weekAgo, p_end: nowIso });
      if (error) throw error;
      for (const r of (data || []) as { sport: string; views: number }[]) sportBreakdown[r.sport] = Number(r.views);
    } catch {
      const { data } = await sb.from("match_views").select("sport").gte("created_at", weekAgo).limit(50000);
      data?.forEach((r) => { const s = r.sport || "other"; sportBreakdown[s] = (sportBreakdown[s] || 0) + 1; });
    }

    // Top 10 matches today — grouped in Postgres (was capped at 1000 in JS).
    let top10: { match_id: string; title: string; sport: string; views: number }[] = [];
    try {
      const { data, error } = await sb.rpc("top_matches", { p_start: todayStart, p_end: nowIso, p_limit: 10 });
      if (error) throw error;
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
      todayViews: todayViews || 0,
      uniqueToday,
      onlineNow,
      liveViewers,
      ppvWatchingNow,
      activeMatches,
      matchViewsToday: matchViewsToday || 0,
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
