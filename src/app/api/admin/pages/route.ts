import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Detailed page analytics: per-page total views + unique viewers for a chosen day,
// plus who's on which page right now.

interface PvRow { path: string; visitor_id: string }

export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;

    // Per-path views + distinct uniques for the day (accurate via RPC; fall back to
    // a capped client-side aggregation if the function isn't installed yet).
    let pages: { path: string; views: number; uniques: number }[] = [];
    try {
      const { data, error } = await sb.rpc("page_stats", { p_start: start, p_end: end });
      if (error) throw error;
      pages = (data || []) as { path: string; views: number; uniques: number }[];
    } catch {
      const { data } = await sb
        .from("page_views")
        .select("path, visitor_id")
        .gte("created_at", start)
        .lte("created_at", end)
        .limit(50000);
      const agg: Record<string, { views: number; set: Set<string> }> = {};
      for (const r of (data || []) as PvRow[]) {
        (agg[r.path] ||= { views: 0, set: new Set() });
        agg[r.path].views++;
        agg[r.path].set.add(r.visitor_id);
      }
      pages = Object.entries(agg)
        .map(([path, v]) => ({ path, views: v.views, uniques: v.set.size }))
        .sort((a, b) => b.views - a.views);
    }

    const totalViews = pages.reduce((s, p) => s + p.views, 0);
    const totalUnique = pages.reduce((s, p) => s + p.uniques, 0);

    // Who's on which page right now (last 2 min)
    const nowWindow = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: active } = await sb
      .from("active_viewers")
      .select("path")
      .gte("last_seen", nowWindow);
    const nowCounts: Record<string, number> = {};
    for (const r of (active || []) as { path: string }[]) {
      nowCounts[r.path] = (nowCounts[r.path] || 0) + 1;
    }
    const viewingNow = Object.entries(nowCounts)
      .map(([path, viewers]) => ({ path, viewers }))
      .sort((a, b) => b.viewers - a.viewers);

    return NextResponse.json({
      date,
      pages,
      totalViews,
      totalUnique,
      onlineNow: active?.length || 0,
      viewingNow,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
