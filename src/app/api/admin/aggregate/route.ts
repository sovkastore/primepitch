import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const targetDate = body.date || new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Totals via exact counts (cap-immune).
    const { count: totalViews } = await sb
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dayStart).lte("created_at", dayEnd);
    const { count: matchViewCount } = await sb
      .from("match_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dayStart).lte("created_at", dayEnd);

    // Unique visitors — counted in Postgres (was capped at 1000 in JS, which
    // corrupted the daily_stats history that every 30-day chart reads from).
    let uniqueVisitors = 0;
    try {
      const { data, error } = await sb.rpc("count_distinct_visitors", { p_start: dayStart, p_end: dayEnd });
      if (error) throw error;
      uniqueVisitors = Number(data) || 0;
    } catch {
      const { data } = await sb.from("page_views").select("visitor_id")
        .gte("created_at", dayStart).lte("created_at", dayEnd).limit(50000);
      uniqueVisitors = new Set(data?.map((r) => r.visitor_id)).size;
    }

    // Sport breakdown — grouped in Postgres.
    const sportBreakdown: Record<string, number> = {};
    try {
      const { data, error } = await sb.rpc("match_sport_breakdown", { p_start: dayStart, p_end: dayEnd });
      if (error) throw error;
      for (const r of (data || []) as { sport: string; views: number }[]) sportBreakdown[r.sport] = Number(r.views);
    } catch {
      const { data } = await sb.from("match_views").select("sport")
        .gte("created_at", dayStart).lte("created_at", dayEnd).limit(50000);
      data?.forEach((r) => { const s = r.sport || "other"; sportBreakdown[s] = (sportBreakdown[s] || 0) + 1; });
    }
    const topSport = Object.entries(sportBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Top match — grouped in Postgres.
    let topMatchId: string | null = null;
    let topMatchTitle: string | null = null;
    try {
      const { data, error } = await sb.rpc("top_matches", { p_start: dayStart, p_end: dayEnd, p_limit: 1 });
      if (error) throw error;
      const t = ((data || []) as { match_id: string; match_title: string | null }[])[0];
      if (t) { topMatchId = t.match_id; topMatchTitle = t.match_title || t.match_id; }
    } catch { /* leave null */ }

    await sb.from("daily_stats").upsert(
      {
        date: targetDate,
        total_views: totalViews || 0,
        unique_visitors: uniqueVisitors,
        match_views: matchViewCount || 0,
        top_sport: topSport,
        top_match_id: topMatchId,
        top_match_title: topMatchTitle,
        sport_breakdown: sportBreakdown,
      },
      { onConflict: "date" }
    );

    return NextResponse.json({
      ok: true,
      date: targetDate,
      total_views: totalViews || 0,
      unique_visitors: uniqueVisitors,
      match_views: matchViewCount || 0,
    });
  } catch (e) {
    console.error("Aggregate API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
