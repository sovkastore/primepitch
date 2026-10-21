import { normTitle } from "./match-merge";
import { getCountryFlagUrl } from "./country-flags";

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
  ended?: boolean; // admin forced this match to FULL TIME (manual "End now")
  hot?: boolean; // admin manually flagged this fixture as HOT (red animated badge)
  forced?: boolean; // admin force-lived this match; exempt from premature-live suppression
  isLive?: boolean; // true if this match is currently in the live feed
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
  const res = await fetch(url, { 
    next: { revalidate: 30 },
    headers: { "User-Agent": "primepitch" }
  });
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
      let matches = await getMatches(s.id);
      matches = matches.filter((m: any) => !m.category || m.category === s.id);
      return matches.map((m) => ({ ...m, category: s.id }));
    })
  );
  return dedupeMatches(all.flat());
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

// Score-feed statuses that mean the match is over (extra-time / penalties safe,
// because the feed only reports these once the real match ends).
const FINISHED_STATUSES = new Set([
  "finished", "ft", "aet", "after_penalties", "ended", "awarded",
  "fulltime", "full_time", "full-time", "match_finished", "complete", "completed",
]);
export function isFinishedStatus(status?: string | null): boolean {
  return !!status && FINISHED_STATUSES.has(status.toLowerCase().replace(/\s+/g, "_"));
}

export function getMatchStatus(match: Match): "live" | "upcoming" | "ended" {
  if (match.ended) return "ended";
  const diffMin = (match.date - Date.now()) / 1000 / 60;
  // If kickoff was more than 210 minutes (3.5h) ago, the match has completed.
  if (match.date && diffMin < -210) return "ended";
  if (match.isLive) return "live";
  // Keep the match in "upcoming" for up to 120 minutes past kickoff 
  // if it hasn't successfully gone live yet
  if (diffMin > -120) return "upcoming";
  
  // If the start time has passed and it is not explicitly marked as isLive, it has ended.
  return "ended";
}

export function getTimeInfo(match: Match): string {
  if (match.ended) return "Ended";
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
  return "Live";
}

export function getUpcomingTime(match: Match): string {
  const d = new Date(match.date);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const SPORT_ICONS: Record<string, string> = {
  football: "⚽",
  basketball: "🏀",
  "american-football": "🏈",
  hockey: "🏒",
  baseball: "⚾",
  "motor-sports": "🏎️",
  fight: "🥊",
  ufc: "🥊",
  wwe: "🎭",
  boxing: "🥊",
  tennis: "🎾",
  rugby: "🏉",
  golf: "⛳",
  billiards: "🎱",
  afl: "🏉",
  darts: "🎯",
  cricket: "🏏",
  other: "🎮",
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
export function getMatchKey(match?: Match | null): string {
  if (!match) return "";
  const s = match.sources?.[0];
  return s ? `${s.source}--${s.id}` : (match.id || "");
}

// streamed.pk returns a match's `sources` in an unstable order and adds/removes
// them as kick-off nears, so getMatchKey (which keys off sources[0]) is NOT a
// reliable identity for admin flags over time: a flag saved as
// "echo--malaga-..." silently stops matching once a different source sorts
// first, and the hidden/hot match pops back into the list. These helpers match a
// flag against EVERY id a match could carry — its bare id and each source (full
// "source--id" and the bare id portion) — so a flag sticks regardless of how the
// feed reshuffles sources.
export function matchFlagKeys(match?: Match | null): string[] {
  if (!match) return [];
  const out = new Set<string>();
  if (match.id) out.add(match.id);
  for (const s of match.sources ?? []) {
    if (s?.source && s?.id) out.add(`${s.source}--${s.id}`);
    if (s?.id) out.add(s.id);
  }
  const tk = normTeamKey(match);
  if (tk && tk.includes("|")) out.add(tk);
  return [...out];
}

// A feed-agnostic identity for a fixture, built from the two team names with
// accents folded (so "Málaga" === "Malaga") and order ignored. The same match
// arrives from different feeds under different ids and even different league
// labels ("Football" vs "Segunda División"), so id matching alone can't hide all
// copies — this team key can. Falls back to the title when team names are absent.
export function normTeamName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // fold accents: á -> a
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
// Same national team shows up under different names across feeds. Map known
// variants to one canonical token so they match (for both dedupe and hiding).
const TEAM_ALIASES: Record<string, string> = {
  ivorycoast: "cotedivoire",
  southkorea: "korearepublic",
  korea: "korearepublic",
  usa: "unitedstates",
  us: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  czechrepublic: "czechia",
  holland: "netherlands",
  turkey: "turkiye",
};
function canonTeam(tok: string): string {
  return TEAM_ALIASES[tok] || tok;
}
export function normTeamKey(match?: { teams?: { home?: { name?: string }; away?: { name?: string } }; title?: string } | null): string {
  if (!match) return "";
  const h = match.teams?.home?.name;
  const a = match.teams?.away?.name;
  if (h && a) return [canonTeam(normTeamName(h)), canonTeam(normTeamName(a))].sort().join("|");
  // Drop "(Dutch & Spanish)" / "(German)" language-or-commentary suffixes so a
  // stream titled that way resolves to the same fixture as the scheduled match.
  const cleaned = (match.title || "").replace(/\([^)]*\)/g, " ");
  const parts = cleaned.split(/\s+(?:vs\.?|v\.?|-|–|—)\s+/i);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [canonTeam(normTeamName(parts[0])), canonTeam(normTeamName(parts[1]))].sort().join("|");
  }
  return canonTeam(normTeamName(cleaned));
}

// True if any stored flag key in `flagSet` refers to this match. Compares full
// keys, and also the bare id portion (after "source--"), since the source prefix
// is the part that drifts.
export function isFlagged(match?: Match | null, flagSet?: Set<string> | null): boolean {
  if (!match || !flagSet || flagSet.size === 0) return false;
  const keys = matchFlagKeys(match);
  for (const k of keys) if (flagSet.has(k)) return true;
  const bare = new Set(keys.filter((k) => !k.includes("--")));
  for (const stored of flagSet) {
    const i = stored.indexOf("--");
    const portion = i === -1 ? stored : stored.slice(i + 2);
    if (bare.has(portion)) return true;
  }
  return false;
}

// A team has a "visual" if it has a real logo image OR a resolvable country
// flag (mirrors TeamBadge's own fallback order). When neither side does, cards
// should show a clean "Name vs Name" line instead of gray letter-in-circle
// placeholders.
export function hasTeamVisual(team?: { name?: string; badge?: string }): boolean {
  if (!team) return false;
  if (team.badge && team.badge.trim()) return true;
  return Boolean(team.name && getCountryFlagUrl(team.name));
}

export function bothTeamsHaveVisuals(match?: Match | null): boolean {
  if (!match) return false;
  return hasTeamVisual(match.teams?.home) && hasTeamVisual(match.teams?.away);
}

// A fixture joins the Live list this many minutes before its official kickoff.
export const LIVE_EARLY_MIN = 10;

// A match goes on the Live shelf from LIVE_EARLY_MIN minutes before its official
// kickoff. If a 3rd-party broadcast server turns on earlier than that for an
// upcoming fixture, keep it in Upcoming (with its scheduled time pill) until the
// window opens. Admin-created live events (source "admin") are always kept.
export function suppressPrematureLive(live: Match[], allMatches: Match[]): Match[] {
  if (!live || !live.length) return [];
  // "Now" shifted forward by the early window: anything kicking off within
  // LIVE_EARLY_MIN minutes counts as live already.
  const now = Date.now() + LIVE_EARLY_MIN * 60_000;

  const futureSchedule = new Map<string, Match>();
  for (const m of allMatches) {
    if (m && m.date && m.date > now) {
      const tk = normTeamKey(m);
      if (tk && tk.includes("|")) futureSchedule.set(tk, m);
      if (m.id) futureSchedule.set(m.id, m);
    }
  }

  return live.filter((m) => {
    if (!m) return false;
    if (m.sources?.some((s) => s.source === "admin") || m.id?.startsWith("admin-") || m.id?.startsWith("ppv-")) {
      return true;
    }

    const tk = normTeamKey(m);
    const scheduled = (tk && tk.includes("|") ? futureSchedule.get(tk) : undefined) || (m.id ? futureSchedule.get(m.id) : undefined);
    if (scheduled && scheduled.date > now) {
      // Official kickoff is still more than the early window away — keep in Upcoming.
      return false;
    }

    // If not in schedule, check if the match's own timestamp is in the future
    if (m.date && m.date > now) {
      return false;
    }

    return true;
  });
}

// streamed.pk sends two rows for the same fixture (e.g. "South Korea vs Czechia"
// and "…Czech Republic"). A team plays one game per slot, so collapse by
// category + home name + kickoff hour, keeping the entry with the most data
// (both badges > one > teams-only). Title-only entries (ceremonies/PPV) are kept as-is.
export function dedupeMatches(matches: Match[]): Match[] {
  // Streamed.pk leaks fixtures across sports with missing team objects and varying IDs.
  // Aggressively deduplicate by normalized title to merge these leaks.
  const richness = (m: Match) =>
    (m.teams?.home?.name ? 4 : 0) + (m.teams?.home?.badge ? 1 : 0) + (m.teams?.away?.badge ? 1 : 0);
  const best = new Map<string, Match>();
  const order: string[] = [];
  for (const m of matches) {
    if (!m) continue;
    // Generate a key based on title to catch cross-sport leaks
    let key = m.title ? m.title.toLowerCase().replace(/[^a-z0-9]/g, "") : m.id;

    // Use a secondary key for events that might have generic titles across days
    if (EVENT_SPORTS.has(m.category)) {
      const hour = m.date ? Math.round(m.date / 3_600_000) : 0;
      key = `${key}|${hour}`;
    }

    const existing = best.get(key);
    if (!existing) {
      best.set(key, m);
      order.push(key);
    } else {
      const preferNew = richness(m) > richness(existing);
      const chosen = preferNew ? m : existing;
      const other = preferNew ? existing : m;

      // Union sources so all streams remain available
      const combinedSources = [...(chosen.sources || [])];
      const seenSources = new Set(combinedSources.map((s) => `${s.source}--${s.id}`));
      for (const s of other.sources || []) {
        const sKey = `${s.source}--${s.id}`;
        if (!seenSources.has(sKey)) {
          seenSources.add(sKey);
          combinedSources.push(s);
        }
      }

      best.set(key, {
        ...chosen,
        sources: combinedSources,
        popular: Boolean(chosen.popular || other.popular),
        hot: Boolean(chosen.hot || other.hot),
        isLive: Boolean(chosen.isLive || other.isLive),
        forced: Boolean(chosen.forced || other.forced),
        ended: Boolean(chosen.ended || other.ended),
      });
    }
  }
  return order.map((k) => best.get(k)!);
}

// Hidden/featured/hot/popular flags and custom notices for the public site.
export async function getMatchFlags(): Promise<{ hidden: string[]; featured: string[]; hot: string[]; popular: string[]; hiddenTitles: string[]; notices: Record<string, string> }> {
  try {
    const res = await fetch(`/api/match-flags`, { cache: "no-store" });
    if (!res.ok) return { hidden: [], featured: [], hot: [], popular: [], hiddenTitles: [], notices: {} };
    const j = await res.json();
    return {
      hidden: j.hidden ?? [],
      featured: j.featured ?? [],
      hot: j.hot ?? [],
      popular: j.popular ?? [],
      hiddenTitles: j.hiddenTitles ?? [],
      notices: j.notices ?? {},
    };
  } catch {
    return { hidden: [], featured: [], hot: [], popular: [], hiddenTitles: [], notices: {} };
  }
}

// Field/event sports have no opponent — the feed sometimes splits their event
// name into a bogus "home vs away" (e.g. "Formula 1 2026" / "Spain GP"). For
// these, never show the versus layout; show the single event title instead.
export const EVENT_SPORTS = new Set(["motor-sports", "golf"]);
export function showVersus(
  m?: { teams?: { home?: unknown; away?: unknown } | null; category?: string } | null
): boolean {
  if (!m) return false;
  return !!(m.teams?.home && m.teams?.away) && !EVENT_SPORTS.has(m.category || "");
}
