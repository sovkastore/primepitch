/**
 * High-Speed DB Helper
 * This EXCLUSIVELY uses Cloudflare D1 for ultra-fast tracking.
 * No Supabase fallbacks. If it's broken, it stays broken so we can fix it.
 */
export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null) {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;

  if (!d1) return { ok: false, error: "D1_BINDING_MISSING" };

  try {
    // 1) High-Speed Write to Cloudflare
    await d1.prepare(`
      INSERT INTO d1_active_viewers (visitor_id, match_id, path, last_seen)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(visitor_id) DO UPDATE SET
        match_id = excluded.match_id,
        path = excluded.path,
        last_seen = CURRENT_TIMESTAMP
    `).bind(visitor_id, match_id || null, path).run();

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
  } catch (e: any) {
    console.error("D1 Tracking Error:", e);
    return { ok: false, error: e.message };
  }
}

export async function trackPageView(
  visitor_id: string, 
  path: string, 
  referrer?: string | null, 
  device?: string | null, 
  country?: string | null, 
  p_ref?: string | null
) {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;

  if (!d1) return { ok: false, error: "D1_BINDING_MISSING" };

  try {
    await d1.prepare(`
      INSERT INTO d1_page_views (visitor_id, path, referrer, device_type, country)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      visitor_id, 
      path, 
      referrer ?? null, 
      device ?? null, 
      country ?? null
    ).run();
    
    // Note: If you need to track partner referrals in D1, 
    // we would add a d1_partner_referrals table later.
    
    return { ok: true, source: "d1" };
  } catch (e: any) {
    console.error("D1 PageView Error:", e);
    return { ok: false, error: e.message };
  }
}
