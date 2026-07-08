import { NextRequest, NextResponse } from "next/server";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";

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
    const { fullStats } = await partnerFlags(sess.code);

    // 1) Active presence split
    const activeRes = await d1.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his
      FROM d1_active_viewers v
      LEFT JOIN d1_partner_referrals r ON v.visitor_id = r.visitor_id
      WHERE v.last_seen >= datetime('now', '-6 minutes')
    `).bind(code).first<any>();

    // 2) Per-match split
    const matchActiveRes = await d1.prepare(`
      SELECT 
        v.match_id,
        MIN(m.match_title) as match_title,
        COUNT(*) as total,
        SUM(CASE WHEN r.partner_code = ? THEN 1 ELSE 0 END) as his
      FROM d1_active_viewers v
      LEFT JOIN d1_partner_referrals r ON v.visitor_id = r.visitor_id
      LEFT JOIN d1_match_views m ON v.match_id = m.match_id
      WHERE v.last_seen >= datetime('now', '-6 minutes') AND v.match_id IS NOT NULL
      GROUP BY v.match_id
    `).bind(code).all();

    const stats = {
      onlineNow: { total: num(activeRes?.total), his: num(activeRes?.his), yours: num(activeRes?.total) - num(activeRes?.his) },
      activeMatches: (matchActiveRes.results || []).map((r: any) => ({
        match_id: r.match_id,
        match_title: r.match_title || r.match_id,
        total: num(r.total),
        his: num(r.his),
        yours: num(r.total) - num(r.his)
      }))
    };

    const scoped = fullStats ? stats : scopeToOwn(stats);
    return NextResponse.json({ full_stats: fullStats, ...scoped });
  } catch (e: any) {
    console.error("Partner Pulse Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
