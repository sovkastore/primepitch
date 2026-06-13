import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // Daily stats from aggregated table (one row per day — not capped).
    const { data: dailyStats } = await sb
      .from("daily_stats")
      .select("*")
      .gte("date", since.split("T")[0])
      .order("date", { ascending: true });

    // Top pages — grouped in Postgres (was capped at 1000 in JS).
    let topPages: { path: string; views: number }[] = [];
    try {
      const { data, error } = await sb.rpc("top_pages", { p_start: since, p_end: nowIso, p_limit: 20 });
      if (error) throw error;
      topPages = ((data || []) as { path: string; views: number }[]).map((r) => ({ path: r.path, views: Number(r.views) }));
    } catch {
      const { data } = await sb.from("page_views").select("path").gte("created_at", since).limit(50000);
      const counts: Record<string, number> = {};
      data?.forEach((r) => { counts[r.path] = (counts[r.path] || 0) + 1; });
      topPages = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 20).map(([path, views]) => ({ path, views }));
    }

    // Device breakdown — grouped in Postgres.
    const deviceBreakdown: Record<string, number> = {};
    try {
      const { data, error } = await sb.rpc("device_breakdown", { p_start: since, p_end: nowIso });
      if (error) throw error;
      for (const r of (data || []) as { device_type: string; views: number }[]) deviceBreakdown[r.device_type] = Number(r.views);
    } catch {
      const { data } = await sb.from("page_views").select("device_type").gte("created_at", since).limit(50000);
      data?.forEach((r) => { const d = r.device_type || "unknown"; deviceBreakdown[d] = (deviceBreakdown[d] || 0) + 1; });
    }

    // Referrer breakdown — grouped in Postgres, hostnames rolled up in JS.
    const refCounts: Record<string, number> = {};
    const addRef = (referrer: string, n: number) => {
      try { const host = new URL(referrer).hostname; refCounts[host] = (refCounts[host] || 0) + n; }
      catch { refCounts[referrer] = (refCounts[referrer] || 0) + n; }
    };
    try {
      const { data, error } = await sb.rpc("referrer_breakdown", { p_start: since, p_end: nowIso });
      if (error) throw error;
      for (const r of (data || []) as { referrer: string; views: number }[]) addRef(r.referrer, Number(r.views));
    } catch {
      const { data } = await sb.from("page_views").select("referrer").gte("created_at", since)
        .not("referrer", "is", null).neq("referrer", "").limit(50000);
      data?.forEach((r) => addRef(r.referrer, 1));
    }
    const topReferrers = Object.entries(refCounts).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([source, views]) => ({ source, views }));

    return NextResponse.json({
      dailyStats: dailyStats || [],
      topPages,
      deviceBreakdown,
      topReferrers,
    });
  } catch (e) {
    console.error("Traffic API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
