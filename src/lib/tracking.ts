import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Global check to see if database-heavy tracking (visits, heartbeats, online status)
 * is currently disabled via the Admin > Maintenance panel.
 * 
 * Uses a 3s timeout to ensure tracker requests never hang the browser during outages.
 */
export async function isTrackingDisabled(): Promise<boolean> {
  try {
    const promise = getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "maintenance")
      .maybeSingle();

    // 3s hard timeout
    const res = await Promise.race([
      promise,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000))
    ]);

    const value = res?.data?.value as { disable_tracking?: boolean } | null;
    return value?.disable_tracking === true;
  } catch {
    // If DB is down or timing out, we should probably assume "disable tracking" 
    // to protect the DB from further load, but for now we follow safety.
    return false;
  }
}
