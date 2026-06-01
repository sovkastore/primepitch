const BASE_URL = "https://streamed.pk/api";

export interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  sources: { source: string; id: string }[];
  popular?: boolean;
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
    if (hrs > 0) return `In ${hrs}h ${mins}m`;
    return `In ${mins}m`;
  }
  if (diffMin > -180) {
    return `${Math.abs(Math.round(diffMin))}' in`;
  }
  return "Ended";
}

export const SPORT_ICONS: Record<string, string> = {
  football: "\u26BD",
  basketball: "\uD83C\uDFC0",
  "american-football": "\uD83C\uDFC8",
  hockey: "\uD83C\uDFD2",
  baseball: "\u26BE",
  "motor-sports": "\uD83C\uDFCE\uFE0F",
  fight: "\uD83E\uDD4A",
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
  tennis: "Tennis",
  rugby: "Rugby",
  golf: "Golf",
  billiards: "Billiards",
  afl: "AFL",
  darts: "Darts",
  cricket: "Cricket",
  other: "Other",
};
