export interface FallbackStream {
  source: "sportsrc" | "embedsportex";
  title: string;
  embedUrl: string;
  server: string;
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (c === q) return 1;
  if (c.includes(q) || q.includes(c)) return 0.8;
  const qWords = query.toLowerCase().split(/\s+/);
  const matches = qWords.filter((w) => c.includes(normalize(w)));
  return matches.length / qWords.length;
}

const SPORT_MAP_SRC: Record<string, string> = {
  football: "football",
  basketball: "basketball",
  "american-football": "american-football",
  tennis: "tennis",
  hockey: "hockey",
  baseball: "baseball",
  cricket: "cricket",
  rugby: "rugby",
  fight: "combat",
  "motor-sports": "motorsport",
};

// Module-level JSON cache keyed by URL. Auto-fallback resolves many live matches
// per request cycle, so caching the providers' raw responses (and SportSRC detail
// lookups) keeps us from hammering them. Serves stale data on transient errors.
const PROVIDER_TTL = 45_000;
const jsonCache = new Map<string, { data: unknown; ts: number }>();

async function cachedJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const now = Date.now();
  const hit = jsonCache.get(url);
  if (hit && now - hit.ts < PROVIDER_TTL) return hit.data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return hit?.data ?? null;
    const data = await res.json();
    jsonCache.set(url, { data, ts: now });
    return data;
  } catch {
    return hit?.data ?? null;
  }
}

export async function searchSportSRC(
  title: string,
  sport: string
): Promise<FallbackStream[]> {
  try {
    const category = SPORT_MAP_SRC[sport] || sport;
    const data = await cachedJson(
      `https://api.sportsrc.org/?data=matches&category=${category}`
    );
    if (!data) return [];
    // SportSRC now wraps responses as { success, data: [...] }. Keep the old
    // shapes as fallbacks so we're resilient if it changes again.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches: any[] = Array.isArray(data)
      ? data
      : (data as any)?.data || (data as any)?.matches || [];

    const results: FallbackStream[] = [];
    for (const m of matches) {
      const mTitle = m.title || m.name || m.tag || "";
      const score = matchScore(title, mTitle);
      if (score < 0.4) continue;

      // Fetch detail to get stream URLs
      const matchId = m.id || m.slug || m.slugkey;
      if (!matchId) continue;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = await cachedJson(
          `https://api.sportsrc.org/?data=detail&category=${category}&id=${matchId}`
        ) as any;
        if (!detail) continue;
        // detail is { success, data: { ..., sources: [{ embedUrl, language, ... }] } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dd: any = detail?.data || detail;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streams: any[] = dd?.sources || dd?.streams || dd?.iframes || [];

        if (Array.isArray(streams)) {
          for (const s of streams) {
            const url = s.embedUrl || s.url || s.iframe || s.src;
            if (url) {
              results.push({
                source: "sportsrc",
                title: mTitle,
                embedUrl: url,
                server: s.language || s.server || s.name || s.quality || `SportSRC ${results.length + 1}`,
              });
            }
          }
        }

        // Also check for direct embed
        const directEmbed = dd?.embed || dd?.embedUrl || dd?.iframe;
        if (directEmbed && !results.find((r) => r.embedUrl === directEmbed)) {
          results.push({
            source: "sportsrc",
            title: mTitle,
            embedUrl: directEmbed,
            server: "SportSRC Main",
          });
        }
      } catch {
        continue;
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchEmbedSportex(
  title: string,
  sport: string
): Promise<FallbackStream[]> {
  try {
    // Stable URL (no cache-buster) so cachedJson can actually cache it.
    const data = await cachedJson("https://api.embedsportex.site/api/streams") as Record<string, unknown> | null;
    if (!data) return [];

    const results: FallbackStream[] = [];

    // Data is organized by sport categories
    const allMatches: { tag: string; iframes: { server: string; url: string }[] }[] = [];
    for (const key of Object.keys(data)) {
      const sportMatches = data[key];
      if (Array.isArray(sportMatches)) {
        allMatches.push(...sportMatches);
      }
    }

    for (const m of allMatches) {
      const mTitle = m.tag || "";
      const score = matchScore(title, mTitle);
      if (score < 0.4) continue;

      if (Array.isArray(m.iframes)) {
        for (const iframe of m.iframes) {
          if (iframe.url) {
            results.push({
              source: "embedsportex",
              title: mTitle,
              embedUrl: iframe.url,
              server: iframe.server || `EmbedSportex ${results.length + 1}`,
            });
          }
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchFallbackStreams(
  title: string,
  sport: string
): Promise<FallbackStream[]> {
  // SportSRC is the only live provider — EmbedSportex's domain is dead (NXDOMAIN),
  // so we no longer call searchEmbedSportex. Add a new provider to this array to
  // restore a second independent fallback.
  const providers = [searchSportSRC(title, sport)];
  const settled = await Promise.allSettled(providers);

  // Dedupe by embedUrl (a provider can list the same match twice).
  const seen = new Set<string>();
  const results: FallbackStream[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const s of r.value) {
      if (s.embedUrl && !seen.has(s.embedUrl)) {
        seen.add(s.embedUrl);
        results.push(s);
      }
    }
  }
  return results;
}
