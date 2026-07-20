import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function POST(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const targetDate = body.date || new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Totals via exact counts
    const totalViewsRow = await d1.prepare("SELECT COUNT(*) as count FROM d1_page_views WHERE created_at >= ? AND created_at <= ?").bind(dayStart, dayEnd).first() as { count: number } | null;
    const totalViews = totalViewsRow?.count || 0;
    
    const matchViewCountRow = await d1.prepare("SELECT COUNT(*) as count FROM d1_match_views WHERE created_at >= ? AND created_at <= ?").bind(dayStart, dayEnd).first() as { count: number } | null;
    const matchViewCount = matchViewCountRow?.count || 0;

    // Unique visitors
    let uniqueVisitors = 0;
    try {
      const uvRow = await d1.prepare("SELECT COUNT(DISTINCT visitor_id) as count FROM d1_page_views WHERE created_at >= ? AND created_at <= ?").bind(dayStart, dayEnd).first() as { count: number } | null;
      uniqueVisitors = uvRow?.count || 0;
    } catch {
      uniqueVisitors = 0;
    }

    // Sport breakdown
    const sportBreakdown: Record<string, number> = {};
    try {
      const { results } = await d1.prepare("SELECT sport, COUNT(*) as views FROM d1_match_views WHERE created_at >= ? AND created_at <= ? GROUP BY sport").bind(dayStart, dayEnd).all();
      for (const r of (results || []) as any[]) {
        const s = r.sport || "other";
        sportBreakdown[s] = (sportBreakdown[s] || 0) + Number(r.views);
      }
    } catch {
      // Fallback or ignore
    }
    const topSport = Object.entries(sportBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Top match
    let topMatchId: string | null = null;
    let topMatchTitle: string | null = null;
    try {
      const t = await d1.prepare("SELECT match_id, match_title, COUNT(*) as views FROM d1_match_views WHERE created_at >= ? AND created_at <= ? GROUP BY match_id, match_title ORDER BY views DESC LIMIT 1").bind(dayStart, dayEnd).first() as { match_id: string; match_title: string | null } | null;
      if (t) { topMatchId = t.match_id; topMatchTitle = t.match_title || t.match_id; }
    } catch { /* leave null */ }

    await d1.prepare(`
      INSERT INTO d1_daily_stats (date, total_views, unique_visitors, match_views, top_sport, top_match_id, top_match_title, sport_breakdown)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET 
        total_views = excluded.total_views,
        unique_visitors = excluded.unique_visitors,
        match_views = excluded.match_views,
        top_sport = excluded.top_sport,
        top_match_id = excluded.top_match_id,
        top_match_title = excluded.top_match_title,
        sport_breakdown = excluded.sport_breakdown
    `).bind(
      targetDate, 
      totalViews, 
      uniqueVisitors, 
      matchViewCount, 
      topSport, 
      topMatchId, 
      topMatchTitle, 
      JSON.stringify(sportBreakdown)
    ).run();

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
