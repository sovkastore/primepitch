import { getD1 } from "@/lib/d1";

// Small D1-backed rate limiter. Worker memory is per-instance, so a counter
// there would reset constantly; D1 is the one place every instance shares.
//
// throttle("login:ip:1.2.3.4", 10, 15 * 60_000) -> allowed until the 11th hit
// inside any 15-minute window from the first hit. Fails OPEN if D1 is down so
// a database hiccup never locks real customers out.

export async function throttle(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }> {
  const d1 = await getD1();
  if (!d1) return { ok: true, retryAfterSec: 0 };
  try {
    await d1.prepare(
      `CREATE TABLE IF NOT EXISTS d1_throttle (key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`
    ).run();
    const now = Date.now();
    const row = await d1.prepare(`SELECT n, reset_at FROM d1_throttle WHERE key = ?`).bind(key).first<{ n: number; reset_at: number }>();
    if (!row || row.reset_at <= now) {
      await d1.prepare(`INSERT OR REPLACE INTO d1_throttle (key, n, reset_at) VALUES (?, 1, ?)`).bind(key, now + windowMs).run();
      return { ok: true, retryAfterSec: 0 };
    }
    if (row.n >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
    await d1.prepare(`UPDATE d1_throttle SET n = n + 1 WHERE key = ?`).bind(key).run();
    return { ok: true, retryAfterSec: 0 };
  } catch {
    return { ok: true, retryAfterSec: 0 };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}
