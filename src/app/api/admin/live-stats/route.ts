import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Total active viewers
    const { data: activeData } = await getSupabaseAdmin()
      .from("active_viewers")
      .select("visitor_id, match_id, path, last_seen")
      .gte("last_seen", fiveMinAgo);

    const totalActive = activeData?.length || 0;

    // Per-match viewer counts
    const matchViewers: Record<string, number> = {};
    const pageViewers: Record<string, number> = {};

    activeData?.forEach((r) => {
      if (r.match_id) {
        matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
      }
      pageViewers[r.path] = (pageViewers[r.path] || 0) + 1;
    });

    const activeMatches = Object.entries(matchViewers)
      .sort(([, a], [, b]) => b - a)
      .map(([match_id, viewers]) => ({ match_id, viewers }));

    const activePages = Object.entries(pageViewers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, viewers]) => ({ path, viewers }));

    // Recent activity (last 20 page views)
    const { data: recentData } = await getSupabaseAdmin()
      .from("page_views")
      .select("path, device_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      totalActive,
      activeMatches,
      activePages,
      recentActivity: recentData || [],
    });
  } catch (e) {
    console.error("Live stats API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
