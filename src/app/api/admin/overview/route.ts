import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Today's visitors
    const { count: todayViews } = await getSupabaseAdmin()
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    const { data: todayUnique } = await getSupabaseAdmin()
      .from("page_views")
      .select("visitor_id")
      .gte("created_at", todayStart);
    const uniqueToday = new Set(todayUnique?.map((r) => r.visitor_id)).size;

    // Real-time presence (last 2 min). onlineNow = on the site; liveViewers = on a
    // watch page (match_id set, i.e. watching a stream right now).
    const nowWindow = new Date(now.getTime() - 6 * 60 * 1000).toISOString();
    const { data: activeNow } = await getSupabaseAdmin()
      .from("active_viewers")
      .select("match_id")
      .gte("last_seen", nowWindow);
    const onlineNow = activeNow?.length || 0;
    const liveViewers = activeNow?.filter((r) => r.match_id).length || 0;

    // Match views today
    const { count: matchViewsToday } = await getSupabaseAdmin()
      .from("match_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    // Total views (7d)
    const { count: weekViews } = await getSupabaseAdmin()
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    // Daily visitors chart (last 30 days from daily_stats)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const { data: dailyStats } = await getSupabaseAdmin()
      .from("daily_stats")
      .select("date, total_views, unique_visitors, match_views")
      .gte("date", thirtyDaysAgo)
      .order("date", { ascending: true });

    // Sport breakdown (last 7 days)
    const { data: sportData } = await getSupabaseAdmin()
      .from("match_views")
      .select("sport")
      .gte("created_at", weekAgo);
    const sportBreakdown: Record<string, number> = {};
    sportData?.forEach((r) => {
      const s = r.sport || "other";
      sportBreakdown[s] = (sportBreakdown[s] || 0) + 1;
    });

    // Top 10 matches today
    const { data: topMatches } = await getSupabaseAdmin()
      .from("match_views")
      .select("match_id, match_title, sport")
      .gte("created_at", todayStart);
    const matchCounts: Record<string, { title: string; sport: string; views: number }> = {};
    topMatches?.forEach((r) => {
      if (!matchCounts[r.match_id]) {
        matchCounts[r.match_id] = { title: r.match_title || r.match_id, sport: r.sport || "", views: 0 };
      }
      matchCounts[r.match_id].views++;
    });
    const top10 = Object.entries(matchCounts)
      .sort(([, a], [, b]) => b.views - a.views)
      .slice(0, 10)
      .map(([id, data]) => ({ match_id: id, ...data }));

    return NextResponse.json({
      todayViews: todayViews || 0,
      uniqueToday,
      onlineNow,
      liveViewers,
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
