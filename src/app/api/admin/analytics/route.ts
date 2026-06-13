import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Everything that happened in a chosen window: people (unique / new / returning),
// activity (page + match loads, repeats included), and breakdowns. Driven by a
// start/end the client computes from the preset (today, yesterday, 7d, 30d,
// this month, all time, or a specific date). All counts come from Postgres
// RPCs / exact counts, so nothing is capped by the 1000-row client limit.

const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);

export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const start = searchParams.get("start") || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const end = searchParams.get("end") || now.toISOString();

    // --- People -------------------------------------------------------------
    const { count: pageViews } = await sb
      .from("page_views")
      .select("visitor_id", { count: "exact", head: true })
      .gte("created_at", start).lte("created_at", end);

    let active = 0, newVisitors = 0, returningVisitors = 0;
    try {
      const { data, error } = await sb.rpc("window_people_split", { p_start: start, p_end: end });
      if (error) throw error;
      const r = (data || [])[0] as { active: number; new_visitors: number; returning_visitors: number } | undefined;
      if (r) { active = num(r.active); newVisitors = num(r.new_visitors); returningVisitors = Math.max(0, active - newVisitors); }
    } catch { /* RPC missing */ }

    // --- Match activity -----------------------------------------------------
    let matchViews = 0, uniqueWatchers = 0, matchesWatched = 0, liveViews = 0, preViews = 0;
    try {
      const { data, error } = await sb.rpc("match_activity_in_range", { p_start: start, p_end: end });
      if (error) throw error;
      const r = (data || [])[0] as { match_views: number; unique_watchers: number; matches_watched: number; live_views: number; pre_views: number } | undefined;
      if (r) { matchViews = num(r.match_views); uniqueWatchers = num(r.unique_watchers); matchesWatched = num(r.matches_watched); liveViews = num(r.live_views); preViews = num(r.pre_views); }
    } catch { /* RPC missing */ }

    // --- Breakdowns (reuse existing RPCs) -----------------------------------
    const byDevice: Record<string, number> = {};
    try {
      const { data } = await sb.rpc("device_breakdown", { p_start: start, p_end: end });
      for (const r of (data || []) as { device_type: string; views: number }[]) byDevice[r.device_type] = num(r.views);
    } catch { /* ignore */ }

    let topMatches: { match_id: string; title: string; views: number }[] = [];
    try {
      const { data } = await sb.rpc("top_matches", { p_start: start, p_end: end, p_limit: 5 });
      topMatches = ((data || []) as { match_id: string; match_title: string | null; views: number }[])
        .map((r) => ({ match_id: r.match_id, title: r.match_title || r.match_id, views: num(r.views) }));
    } catch { /* ignore */ }

    let topPages: { path: string; views: number }[] = [];
    try {
      const { data } = await sb.rpc("top_pages", { p_start: start, p_end: end, p_limit: 5 });
      topPages = ((data || []) as { path: string; views: number }[]).map((r) => ({ path: r.path, views: num(r.views) }));
    } catch { /* ignore */ }

    const pv = num(pageViews);
    const round1 = (x: number) => Math.round(x * 10) / 10;

    return NextResponse.json({
      start, end,
      people: {
        unique: active,
        newVisitors,
        returning: returningVisitors,
        returningRate: active ? round1((returningVisitors / active) * 100) : 0,
      },
      activity: {
        pageViews: pv,
        matchViews,
        matchesWatched,
        uniqueWatchers,
        liveViews,
        preViews,
        loadsPerPerson: active ? round1(pv / active) : 0,
        matchLoadsPerWatcher: uniqueWatchers ? round1(matchViews / uniqueWatchers) : 0,
      },
      byDevice,
      topMatches,
      topPages,
    });
  } catch (e) {
    console.error("Analytics API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
