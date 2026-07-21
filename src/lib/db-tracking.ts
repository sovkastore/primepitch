import { getD1 } from "./d1";

const DO_URL = "https://primepitch-live-tracker.daxonicstudios.workers.dev"; // We will verify this URL

export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null, ref_code?: string | null) {
  const { getD1 } = await import("./d1");
  const d1 = await getD1();

  if (d1 && visitor_id && path) {
    try {
      await d1.prepare(`
        INSERT INTO d1_active_viewers (visitor_id, match_id, path, ref_code, last_seen)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(visitor_id) DO UPDATE SET
          match_id = excluded.match_id,
          path = excluded.path,
          ref_code = excluded.ref_code,
          last_seen = CURRENT_TIMESTAMP
      `).bind(visitor_id, match_id ?? null, path, ref_code ?? null).run();
      return { ok: true, source: "d1" };
    } catch (e) {
      console.error("D1 Heartbeat Error:", e);
    }
  }

  // Fallback / secondary ping to Durable Object micro-worker if configured
  try {
    await fetch(`${DO_URL}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id, match_id, path, ref_code }),
    });
  } catch {}

  return { ok: true, source: "fallback" };
}

export async function getRealtimePresence(d1: any) {
  try {
    const onlineRes = await d1.prepare(`
      SELECT COUNT(*) as online_now 
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-3 minutes')
    `).first();

    const liveRes = await d1.prepare(`
      SELECT COUNT(*) as live_viewers 
      FROM d1_active_viewers 
      WHERE match_id IS NOT NULL AND last_seen >= datetime('now', '-3 minutes')
    `).first();

    const matchesRes = await d1.prepare(`
      SELECT match_id, COUNT(*) as viewers 
      FROM d1_active_viewers 
      WHERE match_id IS NOT NULL AND last_seen >= datetime('now', '-3 minutes') 
      GROUP BY match_id 
      ORDER BY viewers DESC
    `).all();

    const pagesRes = await d1.prepare(`
      SELECT path, COUNT(*) as viewers 
      FROM d1_active_viewers 
      WHERE last_seen >= datetime('now', '-3 minutes') 
      GROUP BY path 
      ORDER BY viewers DESC 
      LIMIT 50
    `).all();

    return {
      onlineNow: (onlineRes?.online_now as number) || 0,
      liveViewers: (liveRes?.live_viewers as number) || 0,
      activeMatches: ((matchesRes?.results || []) as any[]).map((r) => ({ match_id: r.match_id, viewers: r.viewers })),
      activePages: ((pagesRes?.results || []) as any[]).map((r) => ({ path: r.path, viewers: r.viewers })),
    };
  } catch (e) {
    console.error("D1 Realtime Error:", e);
    return { onlineNow: 0, liveViewers: 0, activeMatches: [], activePages: [] };
  }
}

export async function trackPageView(
  visitor_id?: string, 
  path?: string, 
  referrer?: string | null, 
  device?: string | null, 
  country?: string | null, 
  p_ref?: string | null
) {
  const { getD1 } = await import("./d1");
  const d1 = await getD1();

  if (d1 && visitor_id && path) {
    // D1 page view tracking has been stripped out to prevent database bloat.
    // We now rely exclusively on GA4 and the background cron job for page view analytics.
    return { ok: true, source: "ga4-only" };
  }

  return { ok: false, source: "none" };
}

export async function trackMatchView(
  visitor_id?: string,
  match_id?: string,
  source?: string,
  match_title?: string | null,
  sport?: string | null,
  is_live?: boolean,
  country?: string | null,
  ref_code?: string | null
) {
  const { getD1 } = await import("./d1");
  const d1 = await getD1();

  if (d1 && visitor_id && match_id && source) {
    try {
      await d1.prepare(`
        INSERT INTO d1_match_views (visitor_id, match_id, source, match_title, sport, is_live, country, ref_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        visitor_id,
        match_id,
        source,
        match_title ?? null,
        sport ?? null,
        is_live ? 1 : 0,
        country ?? null,
        ref_code ?? null
      ).run();
      return { ok: true, source: "d1" };
    } catch (e) {
      console.error("D1 MatchView Error:", e);
    }
  }
  return { ok: false };
}
