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

export async function searchSportSRC(
  title: string,
  sport: string
): Promise<FallbackStream[]> {
  try {
    const category = SPORT_MAP_SRC[sport] || sport;
    const res = await fetch(
      `https://api.sportsrc.org/?data=matches&category=${category}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const matches = Array.isArray(data) ? data : data?.matches || [];

    const results: FallbackStream[] = [];
    for (const m of matches) {
      const mTitle = m.title || m.name || m.tag || "";
      const score = matchScore(title, mTitle);
      if (score < 0.4) continue;

      // Fetch detail to get stream URLs
      const matchId = m.id || m.slug || m.slugkey;
      if (!matchId) continue;

      try {
        const detailRes = await fetch(
          `https://api.sportsrc.org/?data=detail&category=${category}&id=${matchId}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const streams = detail?.streams || detail?.iframes || detail?.sources || [];

        if (Array.isArray(streams)) {
          for (const s of streams) {
            const url = s.embedUrl || s.url || s.iframe || s.src;
            if (url) {
              results.push({
                source: "sportsrc",
                title: mTitle,
                embedUrl: url,
                server: s.server || s.name || s.quality || `SportSRC ${results.length + 1}`,
              });
            }
          }
        }

        // Also check for direct embed
        const directEmbed = detail?.embed || detail?.embedUrl || detail?.iframe;
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
    const res = await fetch(
      `https://api.embedsportex.site/api/streams?cache=${Date.now()}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();

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
  const [srcResults, sportexResults] = await Promise.allSettled([
    searchSportSRC(title, sport),
    searchEmbedSportex(title, sport),
  ]);

  const results: FallbackStream[] = [];
  if (srcResults.status === "fulfilled") results.push(...srcResults.value);
  if (sportexResults.status === "fulfilled") results.push(...sportexResults.value);
  return results;
}
