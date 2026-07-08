import { type OverviewData } from "@/components/partner/OverviewPanel";

export async function getPartnerOverviewD1(d1: D1Database, refCode: string): Promise<OverviewData> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const start = `${dateStr}T00:00:00.000Z`;
  const end = `${dateStr}T23:59:59.999Z`;

  // 1) Active Online (6 min presence)
  const activeRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_active_viewers 
    WHERE last_seen >= datetime('now', '-6 minutes')
  `).bind(refCode).first<any>();

  const onlineTotal = activeRes?.total || 0;
  const onlineHis = activeRes?.his || 0;

  // 2) On a Match Page (6 min presence + match_id not null)
  const liveRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_active_viewers 
    WHERE match_id IS NOT NULL AND last_seen >= datetime('now', '-6 minutes')
  `).bind(refCode).first<any>();

  const liveTotal = liveRes?.total || 0;
  const liveHis = liveRes?.his || 0;

  // 3) New Today
  const newRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM (
      SELECT visitor_id, MAX(ref_code) as ref_code, MIN(created_at) as first_seen
      FROM d1_page_views
      GROUP BY visitor_id
    )
    WHERE first_seen BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, start, end).first<any>();

  const newTotal = newRes?.total || 0;
  const newHis = newRes?.his || 0;

  // 4) Uniques Today (needed to calculate Returns = Uniques - New)
  const uniquesRes = await d1.prepare(`
    SELECT 
      COUNT(DISTINCT visitor_id) as total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as his
    FROM d1_page_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, start, end).first<any>();

  const uTotal = uniquesRes?.total || 0;
  const uHis = uniquesRes?.his || 0;

  const returnsTotal = Math.max(0, uTotal - newTotal);
  const returnsHis = Math.max(0, uHis - newHis);

  // 5) Lifetime Visitors (ever joined)
  const lifetimeRes = await d1.prepare(`
    SELECT 
      COUNT(DISTINCT visitor_id) as total,
      COUNT(DISTINCT CASE WHEN ref_code = ? THEN visitor_id END) as his
    FROM d1_page_views
  `).bind(refCode).first<any>();

  const lifeTotal = lifetimeRes?.total || 0;
  const lifeHis = lifetimeRes?.his || 0;

  // 6) Page Views Today
  const pvRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_page_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, start, end).first<any>();

  const pvTotal = pvRes?.total || 0;
  const pvHis = pvRes?.his || 0;

  // 7) Match Views Today
  const mvRes = await d1.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_match_views
    WHERE created_at BETWEEN datetime(?) AND datetime(?)
  `).bind(refCode, start, end).first<any>();

  const mvTotal = mvRes?.total || 0;
  const mvHis = mvRes?.his || 0;

  // 8) Active Matches
  const activeMatchesRes = await d1.prepare(`
    SELECT 
      match_id,
      COUNT(*) as total,
      SUM(CASE WHEN ref_code = ? THEN 1 ELSE 0 END) as his
    FROM d1_active_viewers
    WHERE match_id IS NOT NULL AND last_seen >= datetime('now', '-6 minutes')
    GROUP BY match_id
  `).bind(refCode).all();

  const activeMatches = (activeMatchesRes.results || []).map((r: any) => ({
    match_id: r.match_id,
    total: r.total,
    his: r.his || 0,
  }));

  const split = (t: number, h: number) => ({ total: t, his: h, yours: Math.max(0, t - h) });

  return {
    onlineNow: split(onlineTotal, onlineHis),
    liveNow: split(liveTotal, liveHis),
    newToday: split(newTotal, newHis),
    returnsToday: split(returnsTotal, returnsHis),
    totalVisitors: split(lifeTotal, lifeHis),
    pageViewsToday: split(pvTotal, pvHis),
    matchViewsToday: split(mvTotal, mvHis),
    activeMatches,
  };
}
