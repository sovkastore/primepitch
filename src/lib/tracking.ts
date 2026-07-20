import { getD1 } from "@/lib/d1";

/**
 * Global check to see if database-heavy tracking (visits, heartbeats, online status)
 * is currently disabled via the Admin > Maintenance panel.
 * 
 * Uses a 3s timeout to ensure tracker requests never hang the browser during outages.
 */
export async function isTrackingDisabled(): Promise<boolean> {
  try {
    const d1 = await getD1();
    if (!d1) return false;

    const promise = d1.prepare(
      `SELECT value FROM d1_site_settings WHERE key = 'maintenance'`
    ).first<{ value: string }>();

    // 3s hard timeout
    const row = await Promise.race([
      promise,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000))
    ]);

    if (!row?.value) return false;
    try {
      const parsed = JSON.parse(row.value);
      return parsed?.disable_tracking === true;
    } catch {
      return false;
    }
  } catch {
    // If DB is down or timing out, we should probably assume "disable tracking" 
    // to protect the DB from further load, but for now we follow safety.
    return false;
  }
}
