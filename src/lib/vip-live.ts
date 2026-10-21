import { getD1 } from "@/lib/d1";

// The VIP launch switch. Until it is on, /vip is a 404 for the public, the
// menu and footers don't mention it, and checkout refuses. Admins (admin
// cookie) see and can use everything regardless, so it can be tested in
// place before launch.
const KEY = "vip_live";
let cache: { at: number; on: boolean } | null = null;
const TTL = 15_000;

export async function isVipLive(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL) return cache.on;
  let on = false;
  try {
    const d1 = await getD1();
    const row = await d1?.prepare(`SELECT value FROM d1_site_settings WHERE key = ?`).bind(KEY).first<{ value: string }>();
    on = row?.value === "true" || row?.value === "1";
  } catch { /* default: hidden */ }
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
}
