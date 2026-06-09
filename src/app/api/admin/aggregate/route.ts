import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetDate = body.date || new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Page views for that day
    const { data: pvData } = await getSupabaseAdmin()
      .from("page_views")
      .select("visitor_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const totalViews = pvData?.length || 0;
    const uniqueVisitors = new Set(pvData?.map((r) => r.visitor_id)).size;

    // Match views
    const { data: mvData } = await getSupabaseAdmin()
      .from("match_views")
      .select("match_id, match_title, sport")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const matchViewCount = mvData?.length || 0;

    // Sport breakdown
    const sportBreakdown: Record<string, number> = {};
    const matchCountMap: Record<string, { title: string; count: number }> = {};

    mvData?.forEach((r) => {
      const s = r.sport || "other";
      sportBreakdown[s] = (sportBreakdown[s] || 0) + 1;
      if (!matchCountMap[r.match_id]) {
        matchCountMap[r.match_id] = { title: r.match_title || r.match_id, count: 0 };
      }
      matchCountMap[r.match_id].count++;
    });

    // Top sport
    const topSport = Object.entries(sportBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Top match
    const topMatch = Object.entries(matchCountMap).sort(([, a], [, b]) => b.count - a.count)[0];

    // Upsert into daily_stats
    await getSupabaseAdmin().from("daily_stats").upsert(
      {
        date: targetDate,
        total_views: totalViews,
        unique_visitors: uniqueVisitors,
        match_views: matchViewCount,
        top_sport: topSport,
        top_match_id: topMatch?.[0] || null,
        top_match_title: topMatch?.[1]?.title || null,
        sport_breakdown: sportBreakdown,
      },
      { onConflict: "date" }
    );

    return NextResponse.json({
      ok: true,
      date: targetDate,
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      match_views: matchViewCount,
    });
  } catch (e) {
    console.error("Aggregate API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
