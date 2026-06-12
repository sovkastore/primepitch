const BASE_URL = "https://streamed.pk/api";

export interface MatchTeam {
  name: string;
  badge?: string;
}

export interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  sources: { source: string; id: string }[];
  popular?: boolean;
  poster?: string;
  teams?: {
    home?: MatchTeam;
    away?: MatchTeam;
  };
}

export interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
  viewers?: number;
}

export interface Sport {
  id: string;
  name: string;
}

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

async function fetchWithCache<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data as T;
}

export async function getSports(): Promise<Sport[]> {
  return fetchWithCache<Sport[]>(`${BASE_URL}/sports`);
}

export async function getMatches(sport: string): Promise<Match[]> {
  return fetchWithCache<Match[]>(`${BASE_URL}/matches/${sport}`);
}

export async function getAllMatches(): Promise<Match[]> {
  const sports = await getSports();
  const all = await Promise.all(
    sports.map(async (s) => {
      const matches = await getMatches(s.id);
      return matches.map((m) => ({ ...m, category: s.id }));
    })
  );
  return all.flat();
}

export async function getStreams(source: string, id: string): Promise<Stream[]> {
  return fetchWithCache<Stream[]>(`${BASE_URL}/stream/${source}/${id}`);
}

// Live matches that actually have a playable stream (echo source or an admin
// override). Served by our own /api/live-matches route, which does the
// stream-availability filtering server-side. Bypasses the module cache so the
// list stays fresh as streams come and go.
export async function getLiveMatches(): Promise<Match[]> {
  try {
    const res = await fetch(`/api/live-matches`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.matches) ? data.matches : [];
  } catch {
    return [];
  }
}

export function getMatchStatus(match: Match): "live" | "upcoming" | "ended" {
  const diffMin = (match.date - Date.now()) / 1000 / 60;
  if (diffMin > 0) return "upcoming";
  if (diffMin > -180) return "live";
  return "ended";
}

export function getTimeInfo(match: Match): string {
  const diffMin = (match.date - Date.now()) / 1000 / 60;
  if (diffMin > 0) {
    const hrs = Math.floor(diffMin / 60);
    const mins = Math.round(diffMin % 60);
    if (hrs > 24) {
      const days = Math.floor(hrs / 24);
      return `In ${days}d`;
    }
    if (hrs > 0) return `In ${hrs}h ${mins}m`;
    return `In ${mins}m`;
  }
  if (diffMin > -180) {
    return "Live";
  }
  return "Ended";
}

export function getUpcomingTime(match: Match): string {
  const d = new Date(match.date);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const SPORT_ICONS: Record<string, string> = {
  football: "\u26BD",
  basketball: "\uD83C\uDFC0",
  "american-football": "\uD83C\uDFC8",
  hockey: "\uD83C\uDFD2",
  baseball: "\u26BE",
  "motor-sports": "\uD83C\uDFCE\uFE0F",
  fight: "\uD83E\uDD4A",
  ufc: "\uD83E\uDD4A",
  wwe: "\uD83C\uDFAD",
  boxing: "\uD83E\uDD4A",
  tennis: "\uD83C\uDFBE",
  rugby: "\uD83C\uDFC9",
  golf: "\u26F3",
  billiards: "\uD83C\uDFB1",
  afl: "\uD83C\uDFC9",
  darts: "\uD83C\uDFAF",
  cricket: "\uD83C\uDFCF",
  other: "\uD83C\uDFAE",
};

export const SPORT_LABELS: Record<string, string> = {
  football: "Football",
  basketball: "Basketball",
  "american-football": "NFL",
  hockey: "Hockey",
  baseball: "Baseball",
  "motor-sports": "F1 / NASCAR",
  fight: "UFC / Boxing",
  ufc: "UFC",
  wwe: "WWE",
  boxing: "Boxing",
  tennis: "Tennis",
  rugby: "Rugby",
  golf: "Golf",
  billiards: "Billiards",
  afl: "AFL",
  darts: "Darts",
  cricket: "Cricket",
  other: "Other",
};

export function getBadgeUrl(badge: string): string {
  // The `badge` endpoint returns a clean, square (200x200) crest. The `proxy`
  // endpoint returns a 444x250 landscape image with the crest clipped top/bottom.
  return `https://streamed.pk/api/images/badge/${badge}.webp`;
}

export function getPosterUrl(poster: string): string {
  return `https://streamed.pk${poster}`;
}

export function getWatchHref(match: Match): string {
  const s = match.sources?.[0];
  if (!s) return "#";
  return `/watch/${encodeURIComponent(s.source)}--${encodeURIComponent(s.id)}`;
}

// Stable per-match key used by overrides / flags: "<source>--<id>".
export function getMatchKey(match: Match): string {
  const s = match.sources?.[0];
  return s ? `${s.source}--${s.id}` : match.id;
}

// streamed.pk sends two rows for the same fixture (e.g. "South Korea vs Czechia"
// and "…Czech Republic"). A team plays one game per slot, so collapse by
// category + home name + kickoff hour, keeping the entry with the most data
// (both badges > one > teams-only). Title-only entries (ceremonies/PPV) are kept as-is.
export function dedupeMatches(matches: Match[]): Match[] {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const richness = (m: Match) =>
    (m.teams?.home?.badge ? 1 : 0) + (m.teams?.away?.badge ? 1 : 0);
  const best = new Map<string, Match>();
  const order: string[] = [];
  for (const m of matches) {
    const home = m.teams?.home?.name;
    if (!home) {
      const k = `t|${m.id}`;
      if (!best.has(k)) { best.set(k, m); order.push(k); }
      continue;
    }
    const hour = m.date ? Math.round(m.date / 3_600_000) : 0;
    const key = `${m.category}|${norm(home)}|${hour}`;
    const existing = best.get(key);
    if (!existing) { best.set(key, m); order.push(key); }
    else if (richness(m) > richness(existing)) best.set(key, m);
  }
  return order.map((k) => best.get(k)!);
}

// Hidden/featured flags for the public upcoming lists.
export async function getMatchFlags(): Promise<{ hidden: string[]; featured: string[] }> {
  try {
    const res = await fetch(`/api/match-flags`, { cache: "no-store" });
    if (!res.ok) return { hidden: [], featured: [] };
    return await res.json();
  } catch {
    return { hidden: [], featured: [] };
  }
}
