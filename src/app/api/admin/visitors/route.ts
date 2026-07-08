import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const emptyResponse = {
      date, 
      unique: 0, 
      new: 0, 
      returning: 0, 
      pageviews: 0,
      totalVisitors: 0, 
      byDevice: {}, 
      byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, visitors: 0 })), 
      trend: [], 
      roster: [], 
      overall: null
    };

    if (!d1) {
      console.warn("D1_BINDING_MISSING - Returning empty visitors data");
      return NextResponse.json({ ...emptyResponse, error: "D1_BINDING_MISSING" });
    }

    try {
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

      // 2) Hourly Breakdown (SQL aggregation)
      const hourlyRes = await d1.prepare(`
        SELECT 
          strftime('%H', created_at) as hour,
          COUNT(*) as views,
          COUNT(DISTINCT visitor_id) as visitors
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY hour
      `).bind(start, end).all();

      const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, visitors: 0 }));
      (hourlyRes.results || []).forEach((r: any) => {
        const h = parseInt(r.hour);
        if (h >= 0 && h < 24) {
          byHour[h].views = r.views;
          byHour[h].visitors = r.visitors;
        }
      });

      // 2.5) Device Breakdown (SQL aggregation)
      const deviceRes = await d1.prepare(`
        SELECT device_type, COUNT(DISTINCT visitor_id) as visitors
        FROM d1_page_views
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY device_type
      `).bind(start, end).all();
      
      const byDevice: Record<string, number> = {};
      (deviceRes.results || []).forEach((r: any) => {
        byDevice[r.device_type || 'unknown'] = r.visitors;
      });

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
          new: 0 
        });
      }

      // 4) Recent Roster
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
    } catch (dbError: any) {
      console.error("D1 Residents API Error:", dbError);
      return NextResponse.json({ ...emptyResponse, error: dbError.message });
    }
  } catch (e: any) {
    console.error("Visitors API error:", e);
    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      unique: 0, roster: [], error: e.message 
    }, { status: 500 });
  }
}
