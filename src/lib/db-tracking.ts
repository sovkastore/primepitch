import { getD1 } from "./d1";

const DO_URL = "https://primepitch-live-tracker.daxonicstudios.workers.dev"; // We will verify this URL

export async function trackHeartbeat(visitor_id: string, path: string, match_id?: string | null, ref_code?: string | null) {
  try {
    // Send ping directly to Durable Object micro-worker
    await fetch(`${DO_URL}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id, match_id, path, ref_code }),
    });
    return { ok: true, source: "do" };
  } catch (e) {
    console.error("DO Tracking Error:", e);
  }
  return { ok: false, source: "none" };
}

export async function trackPageView() {
  // Tracking removed in favor of GA4
  return { ok: true, source: "ga4" };
}

export async function trackMatchView() {
  // Tracking removed in favor of GA4
  return { ok: true, source: "ga4" };
}
