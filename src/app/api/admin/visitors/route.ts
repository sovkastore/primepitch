import { NextRequest, NextResponse } from "next/server";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    
    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    const trendStartIso = new Date(Date.now() - 30 * DAY).toISOString();

    // 1) Daily Volume & Uniques
    const dailyRes = await d1.prepare(`
      SELECT 
        COUNT(*) as total_views,
        COUNT(DISTINCT visitor_id) as unique_visitors
      FROM d1_page_views
      WHERE created_at >= ? AND created_at <= ?
    `).bind(start, end).first<any>();

    const pageviews = dailyRes?.total_views || 0;
    const unique = dailyRes?.unique_visitors || 0;

    // 2) Hourly & Device Breakdown
    const breakRes = await d1.prepare(`
      SELECT 
        strftime('%H', created_at) as hour,
        device_type,
        visitor_id
      FROM d1_page_views
      WHERE created_at >= ? AND created_at <= ?
    `).bind(start, end).all();

    const byDevice: Record<string, number> = {};
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, visitors: 0 }));
    const hourSets = Array.from({ length: 24 }, () => new Set<string>());

    (breakRes.results || []).forEach((r: any) => {
      const dev = r.device_type || "unknown";
      byDevice[dev] = (byDevice[dev] || 0) + 1;
      const h = parseInt(r.hour);
      if (h >= 0 && h < 24) {
        byHour[h].views++;
        hourSets[h].add(r.visitor_id);
      }
    });
    byHour.forEach((b, h) => { b.visitors = hourSets[h].size; });

    // 3) Trend (30 Days)
    const trendRes = await d1.prepare(`
      SELECT 
        date(created_at) as day,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_id) as uniques
      FROM d1_page_views
      WHERE created_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).bind(trendStartIso).all();

    const trendMap: Record<string, { unique: number }> = {};
    (trendRes.results || []).forEach((r: any) => {
      trendMap[r.day] = { unique: r.uniques };
    });

    const trend: { date: string; unique: number; new: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      trend.push({ 
        date: d, 
        unique: trendMap[d]?.unique || 0,
        new: 0 // New visitors logic requires a long-term roster table
      });
    }

    // 4) Recent Roster (Derived from recent page views)
    const rosterRes = await d1.prepare(`
      SELECT 
        visitor_id, 
        MIN(created_at) as first_seen, 
        MAX(created_at) as last_seen,
        COUNT(*) as visit_count,
        device_type,
        referrer
      FROM (
        SELECT * FROM d1_page_views ORDER BY created_at DESC LIMIT 1000
      )
      GROUP BY visitor_id
      ORDER BY last_seen DESC
      LIMIT 50
    `).all();

    return NextResponse.json({
      date, 
      unique, 
      new: 0, 
      returning: 0, 
      pageviews,
      totalVisitors: unique, 
      byDevice, 
      byHour, 
      trend, 
      roster: rosterRes.results || [], 
      overall: null
    });
  } catch (e: any) {
    console.error("Visitors API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
