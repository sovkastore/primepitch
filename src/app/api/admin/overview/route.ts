import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Today's visitors
    const { count: todayViews } = await supabaseAdmin
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    const { data: todayUnique } = await supabaseAdmin
      .from("page_views")
      .select("visitor_id")
      .gte("created_at", todayStart);
    const uniqueToday = new Set(todayUnique?.map((r) => r.visitor_id)).size;

    // Live viewers (active in last 5 min)
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { count: liveViewers } = await supabaseAdmin
      .from("active_viewers")
      .select("*", { count: "exact", head: true })
      .gte("last_seen", fiveMinAgo);

    // Match views today
    const { count: matchViewsToday } = await supabaseAdmin
      .from("match_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);

    // Total views (7d)
    const { count: weekViews } = await supabaseAdmin
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    // Daily visitors chart (last 30 days from daily_stats)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const { data: dailyStats } = await supabaseAdmin
      .from("daily_stats")
      .select("date, total_views, unique_visitors, match_views")
      .gte("date", thirtyDaysAgo)
      .order("date", { ascending: true });

    // Sport breakdown (last 7 days)
    const { data: sportData } = await supabaseAdmin
      .from("match_views")
      .select("sport")
      .gte("created_at", weekAgo);
    const sportBreakdown: Record<string, number> = {};
    sportData?.forEach((r) => {
      const s = r.sport || "other";
      sportBreakdown[s] = (sportBreakdown[s] || 0) + 1;
    });

    // Top 10 matches today
    const { data: topMatches } = await supabaseAdmin
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
      liveViewers: liveViewers || 0,
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
