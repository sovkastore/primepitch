import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Daily stats from aggregated table
    const { data: dailyStats } = await supabaseAdmin
      .from("daily_stats")
      .select("*")
      .gte("date", since.split("T")[0])
      .order("date", { ascending: true });

    // Top pages
    const { data: pageData } = await supabaseAdmin
      .from("page_views")
      .select("path")
      .gte("created_at", since);

    const pageCounts: Record<string, number> = {};
    pageData?.forEach((r) => {
      pageCounts[r.path] = (pageCounts[r.path] || 0) + 1;
    });
    const topPages = Object.entries(pageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([path, views]) => ({ path, views }));

    // Device breakdown
    const { data: deviceData } = await supabaseAdmin
      .from("page_views")
      .select("device_type")
      .gte("created_at", since);

    const deviceBreakdown: Record<string, number> = {};
    deviceData?.forEach((r) => {
      const d = r.device_type || "unknown";
      deviceBreakdown[d] = (deviceBreakdown[d] || 0) + 1;
    });

    // Referrer breakdown
    const { data: refData } = await supabaseAdmin
      .from("page_views")
      .select("referrer")
      .gte("created_at", since)
      .not("referrer", "is", null)
      .neq("referrer", "");

    const refCounts: Record<string, number> = {};
    refData?.forEach((r) => {
      try {
        const host = new URL(r.referrer).hostname;
        refCounts[host] = (refCounts[host] || 0) + 1;
      } catch {
        refCounts[r.referrer] = (refCounts[r.referrer] || 0) + 1;
      }
    });
    const topReferrers = Object.entries(refCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, views]) => ({ source, views }));

    // Hourly heatmap (hour x day-of-week)
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    pageData?.forEach((r) => {
      // We don't have the exact time from just path, but we have created_at from the query
      // Re-query with created_at would be expensive; skip for now
    });

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
