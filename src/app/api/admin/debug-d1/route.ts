import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    if (!d1) {
      return NextResponse.json({ 
        status: "error", 
        message: "D1_BINDING_MISSING",
        hint: "Check wrangler.toml for [[d1_databases]] binding 'DB'"
      });
    }

    const tablesRes = await d1.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();

    const counts = {
      page_views: 0,
      match_views: 0,
      active_viewers: 0,
      match_summaries: 0,
      partner_referrals: 0
    };

    try {
      const p = await d1.prepare("SELECT COUNT(*) as c FROM d1_page_views").first<any>();
      counts.page_views = p.c;
    } catch {}
    try {
      const m = await d1.prepare("SELECT COUNT(*) as c FROM d1_match_views").first<any>();
      counts.match_views = m.c;
    } catch {}
    try {
      const a = await d1.prepare("SELECT COUNT(*) as c FROM d1_active_viewers").first<any>();
      counts.active_viewers = a.c;
    } catch {}
    try {
      const s = await d1.prepare("SELECT COUNT(*) as c FROM d1_match_summaries").first<any>();
      counts.match_summaries = s.c;
    } catch {}
    try {
      const r = await d1.prepare("SELECT COUNT(*) as c FROM d1_partner_referrals").first<any>();
      counts.partner_referrals = r.c;
    } catch {}

    return NextResponse.json({
      status: "ok",
      tables: (tablesRes.results || []).map((r: any) => r.name),
      counts
    });
  } catch (e: any) {
    return NextResponse.json({ 
      status: "error", 
      message: e.message,
      stack: e.stack
    }, { status: 500 });
  }
}
