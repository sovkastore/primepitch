import { NextRequest, NextResponse } from "next/server";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerBalances, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });

    const code = sess.code.toLowerCase();
    const { fullStats, earned, hold, paid, balance } = await partnerBalances(sess.code);

    // 1) Real-time Presence (Online Now)
    const activeRes = await d1.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his
      FROM d1_active_viewers v
      LEFT JOIN d1_partner_referrals r ON v.visitor_id = r.visitor_id
      WHERE v.last_seen >= datetime('now', '-6 minutes')
    `).bind(code).first<any>();

    // 2) Today's Volume (Page Views & Match Views)
    const volumeRes = await d1.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM d1_page_views WHERE created_at >= date('now')) as pv_total,
        (SELECT COUNT(*) FROM d1_page_views p LEFT JOIN d1_partner_referrals r ON p.visitor_id = r.visitor_id WHERE p.created_at >= date('now') AND r.partner_code = ?) as pv_his,
        (SELECT COUNT(*) FROM d1_match_views WHERE created_at >= date('now')) as mv_total,
        (SELECT COUNT(*) FROM d1_match_views m LEFT JOIN d1_partner_referrals r ON m.visitor_id = r.visitor_id WHERE m.created_at >= date('now') AND r.partner_code = ?) as mv_his
    `).bind(code, code).first<any>();

    // 3) Today's Uniques
    const uniqueRes = await d1.prepare(`
       SELECT 
        (SELECT COUNT(DISTINCT visitor_id) FROM d1_page_views WHERE created_at >= date('now')) as u_total,
        (SELECT COUNT(DISTINCT p.visitor_id) FROM d1_page_views p LEFT JOIN d1_partner_referrals r ON p.visitor_id = r.visitor_id WHERE p.created_at >= date('now') AND r.partner_code = ?) as u_his
    `).bind(code).first<any>();

    // 4) Active per-match (for the Watching Live list)
    const matchActiveRes = await d1.prepare(`
      SELECT 
        v.match_id,
        COUNT(*) as total,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his
      FROM d1_active_viewers v
      LEFT JOIN d1_partner_referrals r ON v.visitor_id = r.visitor_id
      WHERE v.last_seen >= datetime('now', '-6 minutes') AND v.match_id IS NOT NULL
      GROUP BY v.match_id
    `).bind(code).all();

    const stats = {
      onlineNow: { total: num(activeRes?.total), his: num(activeRes?.his), yours: num(activeRes?.total) - num(activeRes?.his) },
      pageViewsToday: { total: num(volumeRes?.pv_total), his: num(volumeRes?.pv_his), yours: num(volumeRes?.pv_total) - num(volumeRes?.pv_his) },
      matchViewsToday: { total: num(volumeRes?.mv_total), his: num(volumeRes?.mv_his), yours: num(volumeRes?.mv_total) - num(volumeRes?.mv_his) },
      newToday: { total: num(uniqueRes?.u_total), his: num(uniqueRes?.u_his), yours: num(uniqueRes?.u_total) - num(uniqueRes?.u_his) },
      activeMatches: (matchActiveRes.results || []).map((r: any) => ({ 
        match_id: r.match_id, 
        total: num(r.total), 
        his: num(r.his) 
      })),
      totalVisitors: { total: num(uniqueRes?.u_total), his: num(uniqueRes?.u_his), yours: num(uniqueRes?.u_total) - num(uniqueRes?.u_his) } // Placeholder for all-time
    };

    const scoped = fullStats ? stats : scopeToOwn(stats);

    return NextResponse.json({
      partner: sess.code,
      name: sess.name,
      full_stats: fullStats,
      earnings: { earned, hold, paid, balance },
      ...scoped,
    });
  } catch (e: any) {
    console.error("Partner Overview Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
