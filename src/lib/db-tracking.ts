import { getD1 } from "./d1";

const DO_URL = "https://primepitch-live-tracker.daxonicstudios.workers.dev"; // We will verify this URL

export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null, ref_code?: string | null) {
  try {
    const res = await fetch(`${DO_URL}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id, match_id, path, ref_code }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("DO Tracking Failed:", res.status, err);
      return { ok: false, source: "do", error: err, status: res.status };
    }
    return { ok: true, source: "do" };
  } catch (e: any) {
    console.error("DO Tracking Error:", e);
    return { ok: false, source: "none", error: e.message };
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
