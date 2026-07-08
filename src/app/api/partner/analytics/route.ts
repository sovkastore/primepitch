import { NextRequest, NextResponse } from "next/server";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const start = searchParams.get("start") || defaultStart;
    const end = searchParams.get("end") || now.toISOString();
    const code = sess.code.toLowerCase();

    const { fullStats } = await partnerFlags(sess.code);

    // 1) People & Page Views (Split: Platform vs Partner)
    const peopleRes = await d1.prepare(`
      SELECT 
        COUNT(*) as total_views,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his_views,
        COUNT(DISTINCT p.visitor_id) as total_unique,
        COUNT(DISTINCT CASE WHEN r.partner_code = ? THEN p.visitor_id ELSE NULL END) as his_unique
      FROM d1_page_views p
      LEFT JOIN d1_partner_referrals r ON p.visitor_id = r.visitor_id
      WHERE p.created_at >= ? AND p.created_at <= ?
    `).bind(code, code, start, end).first<any>();

    const active = num(peopleRes?.total_unique);
    const hisActive = num(peopleRes?.his_unique);
    const pageViews = num(peopleRes?.total_views);
    const hisPageViews = num(peopleRes?.his_views);

    // 2) Match Activity (Split)
    const matchRes = await d1.prepare(`
      SELECT 
        COUNT(*) as total_m_views,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his_m_views,
        COUNT(DISTINCT m.visitor_id) as total_watchers,
        COUNT(DISTINCT CASE WHEN r.partner_code = ? THEN m.visitor_id ELSE NULL END) as his_watchers
      FROM d1_match_views m
      LEFT JOIN d1_partner_referrals r ON m.visitor_id = r.visitor_id
      WHERE m.created_at >= ? AND m.created_at <= ?
    `).bind(code, code, start, end).first<any>();

    const totalMV = num(matchRes?.total_m_views);
    const hisMV = num(matchRes?.his_m_views);
    const totalW = num(matchRes?.total_watchers);
    const hisW = num(matchRes?.his_watchers);

    // 3) Breakdowns (Simplified to Partner's only for brevity/speed)
    const deviceRes = await d1.prepare(`
      SELECT device_type, COUNT(*) as views
      FROM d1_page_views p
      LEFT JOIN d1_partner_referrals r ON p.visitor_id = r.visitor_id
      WHERE p.created_at >= ? AND p.created_at <= ? AND r.partner_code = ?
      GROUP BY device_type
    `).bind(start, end, code).all();
    
    const byDevice: Record<string, number> = {};
    (deviceRes.results || []).forEach((r: any) => {
      byDevice[r.device_type || 'unknown'] = num(r.views);
    });

    const stats = {
      people: {
        total: active,
        his: hisActive,
        yours: active - hisActive,
        returning: { total: 0, his: 0, yours: 0 },
      },
      activity: {
        pageViewsTotal: pageViews,
        pageViewsHis: hisPageViews,
        matchViewsTotal: totalMV,
        matchViewsHis: hisMV,
        watchersTotal: totalW,
        watchersHis: hisW,
        loadsPerPersonTotal: active ? round1(pageViews / active) : 0,
        loadsPerPersonHis: hisActive ? round1(hisPageViews / hisActive) : 0,
      },
      byDevice: { total: {}, his: byDevice }, // Simplified
      topMatches: [], // Partner match analytics usually uses the /matches route
    };

    const scoped = fullStats ? stats : scopeToOwn(stats);

    return NextResponse.json({
      start, end,
      full_stats: fullStats,
      ...scoped
    });
  } catch (e: any) {
    console.error("Partner Analytics Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
