import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Detailed visitor analytics for a given UTC day: unique / new / returning,
// all-time total, device + hourly breakdown, 30-day trend, and a roster of joiners.
// Distinct counts come from DB RPCs so they're accurate past the 1000-row client cap.

const DAY = 24 * 60 * 60 * 1000;

interface PvRow { visitor_id: string; device_type: string | null; created_at: string }
interface RosterRow {
  visitor_id: string; first_seen: string; last_seen: string;
  visit_count: number; device_type: string | null; referrer: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    const trendStartIso = new Date(Date.now() - 30 * DAY).toISOString();

    // Page views that day (exact count — accurate regardless of volume)
    const { count: pvCount } = await sb
      .from("page_views")
      .select("visitor_id", { count: "exact", head: true })
      .gte("created_at", start).lte("created_at", end);
    const pageviews = pvCount ?? 0;

    // Sampled rows for device + hourly shape
    const { data: pvRows } = await sb
      .from("page_views")
      .select("visitor_id, device_type, created_at")
      .gte("created_at", start).lte("created_at", end)
      .limit(5000);
    const rows = (pvRows || []) as PvRow[];

    // Unique visitors that day (accurate via RPC; fall back to sampled set)
    let unique = new Set(rows.map((r) => r.visitor_id)).size;
    try {
      const { data: u } = await sb.rpc("unique_visitors_in_range", { p_start: start, p_end: end });
      if (u != null && !Number.isNaN(Number(u))) unique = Number(u);
    } catch { /* RPC not created yet */ }

    // Site-wide lifetime split: visitors who genuinely came back on another day
    // vs those who only ever visited on one day. Exact counts — cap-immune.
    let overall: { total: number; returning: number; oneTime: number; returningRate: number } | null = null;
    try {
      const { count: total } = await sb.from("visitors").select("visitor_id", { count: "exact", head: true });
      const t = total ?? 0;
      let cameBack = 0;
      const { data: rb } = await sb.rpc("returning_visitors_multiday");
      if (rb != null && !Number.isNaN(Number(rb))) cameBack = Number(rb);
      overall = {
        total: t,
        returning: cameBack,
        oneTime: Math.max(0, t - cameBack),
        returningRate: t ? Math.round((cameBack / t) * 1000) / 10 : 0,
      };
    } catch { /* visitors table or RPC not present */ }

    // Device + hourly breakdown
    const byDevice: Record<string, number> = {};
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, visitors: 0 }));
    const hourSets = Array.from({ length: 24 }, () => new Set<string>());
    for (const r of rows) {
      const dev = r.device_type || "unknown";
      byDevice[dev] = (byDevice[dev] || 0) + 1;
      const h = new Date(r.created_at).getUTCHours();
      byHour[h].views++;
      hourSets[h].add(r.visitor_id);
    }
    byHour.forEach((b, h) => { b.visitors = hourSets[h].size; });

    // New / total / roster + new-per-day trend (visitors table)
    let newVisitors: number | null = null;
    let totalVisitors: number | null = null;
    let roster: RosterRow[] = [];
    const trendNew: Record<string, number> = {};
    try {
      const { count: total } = await sb.from("visitors").select("visitor_id", { count: "exact", head: true });
      totalVisitors = total ?? 0;

      const { count: nv } = await sb.from("visitors")
        .select("visitor_id", { count: "exact", head: true })
        .gte("first_seen", start).lte("first_seen", end);
      newVisitors = nv ?? 0;

      const { data: rosterData } = await sb.from("visitors")
        .select("visitor_id, first_seen, last_seen, visit_count, device_type, referrer")
        .order("first_seen", { ascending: false }).limit(50);
      roster = (rosterData || []) as RosterRow[];

      const { data: nvRows } = await sb.from("visitors")
        .select("first_seen").gte("first_seen", trendStartIso).limit(50000);
      for (const r of (nvRows || []) as { first_seen: string }[]) {
        const d = r.first_seen.slice(0, 10);
        trendNew[d] = (trendNew[d] || 0) + 1;
      }
    } catch { /* visitors table not created yet */ }

    // Returning = people active in the window whose first-ever visit was before it
    // (precise, from the DB) rather than "unique minus new", which over-counts when
    // an active visitor has no profile row.
    let returning: number | null = null;
    try {
      const { data: ps } = await sb.rpc("window_people_split", { p_start: start, p_end: end });
      const r0 = (ps || [])[0] as { returning_visitors: number } | undefined;
      if (r0) returning = Number(r0.returning_visitors) || 0;
    } catch { /* RPC missing */ }
    if (returning === null) returning = newVisitors === null ? null : Math.max(0, unique - newVisitors);

    // 30-day unique trend (accurate via RPC; fall back to sampled set)
    const dayUnique: Record<string, number> = {};
    try {
      const { data: du } = await sb.rpc("daily_unique_visitors", { p_start: trendStartIso });
      for (const r of (du || []) as { day: string; uniques: number }[]) dayUnique[r.day] = r.uniques;
    } catch {
      const { data: pvT } = await sb.from("page_views")
        .select("visitor_id, created_at").gte("created_at", trendStartIso).limit(50000);
      const sets: Record<string, Set<string>> = {};
      for (const r of (pvT || []) as PvRow[]) {
        const d = r.created_at.slice(0, 10);
        (sets[d] ||= new Set<string>()).add(r.visitor_id);
      }
      for (const d in sets) dayUnique[d] = sets[d].size;
    }

    const trend: { date: string; unique: number; new: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      trend.push({ date: d, unique: dayUnique[d] || 0, new: trendNew[d] || 0 });
    }

    return NextResponse.json({
      date, unique, new: newVisitors, returning, pageviews,
      totalVisitors, byDevice, byHour, trend, roster, overall,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
