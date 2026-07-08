export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null) {
  // Only track heartbeat if the user is on a match page
  if (!match_id) return { ok: true, skipped: true };

  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;

  if (!d1) return { ok: false, error: "D1_BINDING_MISSING" };

  try {
    // High-Speed presence tracking for matches ONLY
    await d1.prepare(`
      INSERT INTO d1_active_viewers (visitor_id, match_id, path, last_seen)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(visitor_id) DO UPDATE SET
        match_id = excluded.match_id,
        path = excluded.path,
        last_seen = CURRENT_TIMESTAMP
    `).bind(visitor_id, match_id, path).run();

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
  // TRACKING DISABLED TO REDUCE DB LOAD
  return { ok: true, message: "Tracking disabled" };
}

export async function trackMatchView(
  visitor_id: string, 
  match_id: string, 
  source: string, 
  match_title?: string | null, 
  sport?: string | null, 
  is_live: boolean = true,
  country?: string | null
) {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;

  if (!d1) return { ok: false, error: "D1_BINDING_MISSING" };

  try {
    // 1) Record the match view event
    await d1.prepare(`
      INSERT INTO d1_match_views (visitor_id, match_id, source, match_title, sport, is_live, country)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      visitor_id, 
      match_id, 
      source, 
      match_title ?? null, 
      sport ?? null, 
      is_live ? 1 : 0,
      country ?? null
    ).run();

    // 2) Update active presence
    await d1.prepare(`
      INSERT INTO d1_active_viewers (visitor_id, match_id, path, last_seen)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(visitor_id) DO UPDATE SET
        match_id = excluded.match_id,
        path = excluded.path,
        last_seen = CURRENT_TIMESTAMP
    `).bind(visitor_id, match_id, `/watch/${match_id}`).run();

    // 3) Update peak summary
    await d1.prepare(`
      INSERT INTO d1_match_summaries (match_id, total_views, peak_viewers)
      VALUES (?, 1, 1)
      ON CONFLICT(match_id) DO UPDATE SET
        total_views = d1_match_summaries.total_views + 1,
        last_updated = CURRENT_TIMESTAMP
    `).bind(match_id).run();

    return { ok: true, source: "d1" };
  } catch (e: any) {
    console.error("D1 MatchView Error:", e);
    return { ok: false, error: e.message };
  }
}
