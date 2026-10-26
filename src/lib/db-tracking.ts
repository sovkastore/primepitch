import { getD1 } from "./d1";

const DO_URL = "https://tracker.xellnetwork.xyz"; // Using custom domain to bypass Cloudflare Worker-to-Worker block

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

// Page views are buffered in this Worker instance and written in one batch
// (at most every few seconds, or every 25 rows) instead of one database
// write per visit — on a 10,000-visitor night that is the difference between
// thousands of separate writes and a handful of batches. A row can be lost if
// an instance is shut down mid-buffer; that's fine for visit counting.
type PvRow = [string, string, string | null, string | null, string | null, string | null];
const pvBuffer: PvRow[] = [];
let pvFlushTimer = false;
const PV_BATCH = 25;
const PV_DELAY_MS = 4_000;

async function flushPageViews() {
  pvFlushTimer = false;
  if (pvBuffer.length === 0) return;
  const rows = pvBuffer.splice(0, pvBuffer.length);
  const { getD1 } = await import("./d1");
  const d1 = await getD1();
  if (!d1) return;
  try {
    await d1.batch(
      rows.map((r) =>
        d1
          .prepare(
            `INSERT INTO d1_page_views (visitor_id, path, referrer, device_type, country, ref_code) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(...r)
      )
    );
  } catch (e) {
    console.error("D1 PageView batch error:", e);
  }
}

async function waitUntil(p: Promise<unknown>) {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = (await getCloudflareContext()) as unknown as { ctx?: { waitUntil(p: Promise<unknown>): void } };
    if (ctx?.waitUntil) {
      ctx.waitUntil(p);
      return;
    }
  } catch {
    /* not in a Worker: just let it run */
  }
  void p;
}

export async function trackPageView(
  visitor_id?: string, 
  path?: string, 
  referrer?: string | null, 
  device?: string | null, 
  country?: string | null, 
  p_ref?: string | null
) {
  if (!visitor_id || !path) return { ok: false, source: "none" };
  pvBuffer.push([visitor_id, path, referrer ?? null, device ?? null, country ?? null, p_ref ?? null]);
  if (pvBuffer.length >= PV_BATCH) {
    await waitUntil(flushPageViews());
  } else if (!pvFlushTimer) {
    pvFlushTimer = true;
    await waitUntil(new Promise((r) => setTimeout(r, PV_DELAY_MS)).then(flushPageViews));
  }
  return { ok: true, source: "d1-batch" };
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
  if (visitor_id && match_id && source) {
    try {
      const res = await fetch(`${DO_URL}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id,
          match_id,
          source,
          match_title: match_title ?? null,
          sport: sport ?? null,
          is_live: is_live ? 1 : 0,
          country: country ?? null,
          ref_code: ref_code ?? null,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // unique row id
        }),
      });
      if (!res.ok) {
        console.error("DO Join Failed:", res.status, await res.text());
        return { ok: false, source: "do" };
      }
      return { ok: true, source: "do" };
    } catch (e) {
      console.error("DO Join Error:", e);
    }
  }
  return { ok: false };
}
