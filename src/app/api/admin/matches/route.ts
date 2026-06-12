import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport");
    const sort = searchParams.get("sort") || "views"; // "views" | "recent"
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = getSupabaseAdmin().from("match_views").select("*", { count: "exact" });

    if (sport) query = query.eq("sport", sport);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Aggregate by match_id
    const allQuery = getSupabaseAdmin()
      .from("match_views")
      .select("match_id, match_title, sport, duration_sec, visitor_id, created_at");
    if (sport) allQuery.eq("sport", sport);
    if (from) allQuery.gte("created_at", from);
    if (to) allQuery.lte("created_at", to);

    const { data: allData } = await allQuery;

    const grouped: Record<string, {
      title: string;
      sport: string;
      views: number;
      uniqueViewers: Set<string>;
      totalDuration: number;
      lastViewed: string;
    }> = {};

    allData?.forEach((r) => {
      if (!grouped[r.match_id]) {
        grouped[r.match_id] = {
          title: r.match_title || r.match_id,
          sport: r.sport || "",
          views: 0,
          uniqueViewers: new Set(),
          totalDuration: 0,
          lastViewed: r.created_at,
        };
      }
      const g = grouped[r.match_id];
      g.views++;
      g.uniqueViewers.add(r.visitor_id);
      g.totalDuration += r.duration_sec || 0;
      if (r.created_at > g.lastViewed) g.lastViewed = r.created_at;
    });

    const matches = Object.entries(grouped)
      .map(([id, g]) => ({
        match_id: id,
        title: g.title,
        sport: g.sport,
        views: g.views,
        unique_viewers: g.uniqueViewers.size,
        avg_duration: g.views > 0 ? Math.round(g.totalDuration / g.views) : 0,
        last_viewed: g.lastViewed,
      }))
      .sort((a, b) =>
        sort === "recent"
          ? (a.last_viewed < b.last_viewed ? 1 : -1)
          : b.views - a.views
      )
      .slice(offset, offset + limit);

    return NextResponse.json({
      matches,
      total: Object.keys(grouped).length,
      page,
      raw: data,
      rawTotal: count,
    });
  } catch (e) {
    console.error("Matches API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
