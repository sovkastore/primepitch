import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    // "Right now" = last 2 minutes (heartbeat is 60s, so this tolerates one miss).
    const nowWindow = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data: activeData } = await getSupabaseAdmin()
      .from("active_viewers")
      .select("visitor_id, match_id, path, last_seen")
      .gte("last_seen", nowWindow);

    // onlineNow = anyone on the site; liveViewers = anyone on a watch page (match_id set).
    const onlineNow = activeData?.length || 0;
    const liveViewers = activeData?.filter((r) => r.match_id).length || 0;
    const totalActive = onlineNow; // kept for backward compatibility

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
      onlineNow,
      liveViewers,
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
