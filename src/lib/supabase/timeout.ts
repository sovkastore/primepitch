import { getSupabaseAdmin } from "./admin";

/**
 * Shared utility for database resilience.
 * Checks the Admin > Maintenance panel to see if 3s timeouts are enabled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  // Direct timeout protection to keep the site fast and responsive
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), ms)),
  ]);
}
