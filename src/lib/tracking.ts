import { getD1 } from "@/lib/d1";
import { edgeMemo } from "@/lib/edge-memo";

/**
 * Global check to see if database-heavy tracking (visits, heartbeats, online status)
 * is currently disabled via the Admin > Maintenance panel.
 * 
 * Uses a 3s timeout to ensure tracker requests never hang the browser during outages.
 */
export async function isTrackingDisabled(): Promise<boolean> {
  // Every page view, match view and heartbeat asks this, so the answer is
  // shared per city for 15 s (edgeMemo) instead of one database read each —
  // this single query was ~46,000 database reads an hour on big-match nights.
  try {
    const value = await edgeMemo("maintenance_row", 15_000, async () => {
      const d1 = await getD1();
      if (!d1) return null;
      const row = await d1.prepare(
        `SELECT value FROM d1_site_settings WHERE key = 'maintenance'`
      ).first<{ value: string }>();
      return row?.value ?? null;
    });
    if (!value) return false;
    try {
      const parsed = JSON.parse(value);
      return parsed?.disable_tracking === true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
