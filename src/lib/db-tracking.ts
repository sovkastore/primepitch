import { getD1 } from "./d1";

/**
 * High-Speed DB Helper for Cloudflare D1
 */
export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null, ref_code?: string | null) {
  const d1 = await getD1();

  if (d1) {
    try {
      // 1) High-Speed Write to Cloudflare
      await d1.prepare(`
        INSERT INTO d1_active_viewers (visitor_id, match_id, path, ref_code, last_seen)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(visitor_id) DO UPDATE SET
          match_id = excluded.match_id,
          path = excluded.path,
          ref_code = excluded.ref_code,
          last_seen = CURRENT_TIMESTAMP
      `).bind(visitor_id, match_id || null, path, ref_code || null).run();

      if (match_id) {
        // Track match-specific duration + local peaks
        await d1.prepare(`
          INSERT INTO d1_match_summaries (match_id, total_views, peak_viewers)
          VALUES (?, 1, 1)
          ON CONFLICT(match_id) DO UPDATE SET
            last_updated = CURRENT_TIMESTAMP
        `).bind(match_id).run();
      }
      return { ok: true, source: "d1" };
    } catch (e) {
      console.error("D1 Tracking Error:", e);
    }
  }

  return { ok: false, source: "none" };
}

export async function trackPageView(
  visitor_id: string, 
  path: string, 
  referrer?: string | null, 
  device?: string | null, 
  country?: string | null, 
  p_ref?: string | null
) {
  const d1 = await getD1();

  if (d1) {
    try {
      await d1.prepare(`
        INSERT INTO d1_page_views (visitor_id, path, referrer, device_type, country, ref_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        visitor_id, 
        path, 
        referrer ?? null, 
        device ?? null, 
        country ?? null,
        p_ref ?? null
      ).run();
      return { ok: true, source: "d1" };
    } catch (e) {
      console.error("D1 PageView Error:", e);
    }
  }

  return { ok: false, source: "none" };
}

export async function trackMatchView(
  visitor_id: string,
  match_id: string,
  source: string,
  match_title?: string | null,
  sport?: string | null,
  is_live?: boolean,
  country?: string | null,
  ref_code?: string | null
) {
  const d1 = await getD1();

  if (d1) {
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
