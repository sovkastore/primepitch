// Reads the visitor's country from the Cloudflare-provided request header.
// Cloudflare attaches `cf-ipcountry` (2-letter ISO code) to every request that
// reaches the Worker, so no IP lookup or extra service is needed.
// Returns the ISO code, or null for unknown / Tor / placeholder values.
export function countryFromRequest(request: Request): string | null {
  const raw = request.headers.get("cf-ipcountry");
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  // XX = unknown, T1/T2 = Tor exit nodes, empty = none — treat all as "unknown".
  if (!c || c === "XX" || c === "T1" || c === "T2") return null;
  return c;
}
