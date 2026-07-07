import { getSupabaseAdmin } from "./admin";

/**
 * Shared utility for database resilience.
 * Checks the Admin > Maintenance panel to see if 3s timeouts are enabled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  try {
    // 1) Check if timeouts are enabled in site_settings
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "maintenance")
      .maybeSingle();
      
    const settings = data?.value as { timeouts_enabled?: boolean } | null;
    
    // 2) If disabled, just return the raw promise (wait forever)
    if (settings?.timeouts_enabled === false) {
      return promise;
    }
  } catch {
    // If we can't even reach the settings, default to safety (enable timeout)
  }

  // 3) Standard 3s timeout protection
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), ms)),
  ]);
}
