import { getD1 } from "@/lib/d1";
import { edgeMemo, edgeMemoForget } from "@/lib/edge-memo";

// The VIP launch switch. Until it is on, /vip is a 404 for the public, the
// menu and footers don't mention it, and checkout refuses. Admins (admin
// cookie) see and can use everything regardless, so it can be tested in
// place before launch.
const KEY = "vip_live";
let cache: { at: number; on: boolean } | null = null;
const TTL = 15_000;

export async function isVipLive(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL) return cache.on;
  let on = cache?.on ?? false;
  try {
    on = await edgeMemo(KEY, TTL, async () => {
      const d1 = await getD1();
      if (!d1) throw new Error("DB unavailable");
      const row = await d1.prepare(`SELECT value FROM d1_site_settings WHERE key = ?`).bind(KEY).first<{ value: string }>();
      return row?.value === "true" || row?.value === "1";
    });
  } catch { /* keep the last known state (default: hidden) */ }
  cache = { at: Date.now(), on };
  return on;
}

export async function setVipLive(on: boolean): Promise<void> {
  const d1 = await getD1();
  if (!d1) throw new Error("DB unavailable");
  await d1.prepare(
    `INSERT INTO d1_site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(KEY, on ? "true" : "false").run();
  cache = { at: Date.now(), on };
  await edgeMemoForget(KEY);
}
