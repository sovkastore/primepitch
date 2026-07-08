import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const d1 = await getD1();

    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    const trendStart = new Date(Date.now() - 30 * DAY_MS).toISOString();

    // 1) Page Views (count) + Unique Visitors (count) for selected day
    const dayStats = await d1.prepare(`
      SELECT 
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_id) as uniques
      FROM d1_page_views 
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const pageviews = dayStats?.pageviews || 0;
    const unique = dayStats?.uniques || 0;

    // 2) New Visitors in that day (whose first ever hit is in the window)
    const newStats = await d1.prepare(`
      SELECT COUNT(*) as new_count
      FROM (
        SELECT MIN(created_at) as first_seen
        FROM d1_page_views
        GROUP BY visitor_id
      )
      WHERE first_seen BETWEEN datetime(?) AND datetime(?)
    `).bind(start, end).first<any>();

    const newVisitors = newStats?.new_count || 0;
    const returning = Math.max(0, unique - newVisitors);

    // 3) Lifetime Stats (overall split)
    const overallStats = await d1.prepare(`
      SELECT 
        (SELECT COUNT(DISTINCT visitor_id) FROM d1_page_views) as total_users,
        (SELECT COUNT(*) FROM (
          SELECT visitor_id 
          FROM d1_page_views 
          GROUP BY visitor_id 
          HAVING COUNT(DISTINCT strftime('%Y-%m-%d', created_at)) > 1
        )) as returning_users
    `).first<any>();

    const totalVisitors = overallStats?.total_users || 0;
    const returningUsers = overallStats?.returning_users || 0;
    const overall = {
      total: totalVisitors,
      returning: returningUsers,
      oneTime: Math.max(0, totalVisitors - returningUsers),
      returningRate: totalVisitors ? Math.round((returningUsers / totalVisitors) * 1000) / 10 : 0,
    };

    // 4) Hourly Breakdown for current day
    const hourlyRes = await d1.prepare(`
      SELECT 
        strftime('%H', created_at) as hour_val,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_id) as visitors
      FROM d1_page_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
      GROUP BY hour_val
    `).bind(start, end).all();

    const byDevice: Record<string, number> = {};
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, visitors: 0 }));

    // Map D1 hourly results
    (hourlyRes.results || []).forEach((r: any) => {
      const h = parseInt(r.hour_val, 10);
      if (h >= 0 && h < 24) {
        byHour[h].views = r.views;
        byHour[h].visitors = r.visitors;
      }
    });

    // 5) Device mapping for that day
    const deviceRes = await d1.prepare(`
      SELECT device_type, COUNT(*) as count
      FROM d1_page_views
      WHERE created_at BETWEEN datetime(?) AND datetime(?)
      GROUP BY device_type
    `).bind(start, end).all();

    (deviceRes.results || []).forEach((r: any) => {
      byDevice[r.device_type || "unknown"] = r.count;
    });

    // 6) Roster: Recently Joined / Seen users (derived from page views)
    const rosterRes = await d1.prepare(`
      SELECT 
        visitor_id, 
        MIN(created_at) as first_seen, 
        MAX(created_at) as last_seen, 
        COUNT(*) as visit_count,
        MAX(device_type) as device_type,
        MAX(referrer) as referrer
      FROM d1_page_views
      GROUP BY visitor_id
      ORDER BY last_seen DESC
      LIMIT 50
    `).all();

    const roster = (rosterRes.results || []).map((r: any) => ({
      visitor_id: r.visitor_id,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      visit_count: r.visit_count,
      device_type: r.device_type,
      referrer: r.referrer,
    }));

    // 7) 30-Day trends (uniques vs new)
    const dailyUniquesRes = await d1.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as day_val,
        COUNT(DISTINCT visitor_id) as uniques
      FROM d1_page_views
      WHERE created_at >= datetime(?)
      GROUP BY day_val
    `).bind(trendStart).all();

    const dailyNewRes = await d1.prepare(`
      SELECT 
        strftime('%Y-%m-%d', first_seen) as day_val,
        COUNT(*) as new_count
      FROM (
        SELECT visitor_id, MIN(created_at) as first_seen
        FROM d1_page_views
        GROUP BY visitor_id
      )
      WHERE first_seen >= datetime(?)
      GROUP BY day_val
    `).bind(trendStart).all();

    const dayUniqueMap: Record<string, number> = {};
    (dailyUniquesRes.results || []).forEach((r: any) => {
      dayUniqueMap[r.day_val] = r.uniques;
    });

    const dayNewMap: Record<string, number> = {};
    (dailyNewRes.results || []).forEach((r: any) => {
      dayNewMap[r.day_val] = r.new_count;
    });

    const trend: { date: string; unique: number; new: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
      trend.push({
        date: d,
        unique: dayUniqueMap[d] || 0,
        new: dayNewMap[d] || 0
      });
    }

    return NextResponse.json({
      date, 
      unique, 
      new: newVisitors, 
      returning, 
      pageviews,
      totalVisitors, 
      byDevice, 
      byHour, 
      trend, 
      roster, 
      overall,
    });

  } catch (e) {
    console.error("Visitors D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
