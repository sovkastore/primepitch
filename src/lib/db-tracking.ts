import { getSupabaseAdmin } from "./supabase/admin";

/**
 * High-Speed DB Helper
 * This intelligently switches between Cloudflare D1 (Fast) and Supabase (Backup)
 */
export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null) {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;
  console.log(`[Track] Heartbeat check. D1 present: ${!!d1}`);

  if (d1) {
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
    } catch (e) {
      console.error("D1 Tracking Error:", e);
    }
  }

  // 2) Fallback to Supabase
  await getSupabaseAdmin().from("active_viewers").upsert(
    {
      visitor_id,
      match_id: match_id || null,
      path,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "visitor_id" }
  );
  
  return { ok: true, source: "supabase" };
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

  console.log(`[Track] PageView check. D1 present: ${!!d1}`);

  if (d1) {
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
      return { ok: true, source: "d1" };
    } catch (e) {
      console.error("D1 PageView Error:", e);
    }
  }

  // Fallback
  await getSupabaseAdmin().rpc("track_visitor", {
    p_vid: visitor_id,
    p_device: device ?? null,
    p_referrer: referrer ?? null,
    p_path: path,
    p_ref: p_ref ?? null
  });
  
  return { ok: true, source: "supabase" };
}
