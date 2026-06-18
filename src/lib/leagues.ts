import { Match, getMatchKey, normTeamKey, normTeamName, getBadgeUrl } from "@/lib/api";

// Read-only frontend layer over the already-built BSD→Supabase cache tables
// (league_config / league_matches / league_standings). The site NEVER calls the
// BSD API directly — these shapes mirror the cache rows. Streams still come from
// streamed.pk, matched to a league fixture at read-time (see resolveLeagueStream).

export type LeagueTab = "results" | "fixtures" | "table";
export type DefaultTab = "auto" | LeagueTab;

export interface LeagueConfig {
  league_id: number;
  label: string;
  enabled: boolean;
  display_order: number;
  has_table: boolean;
  default_tab: DefaultTab;
  logo_url?: string | null;
}

export interface LeagueMatchRow {
  match_key: string;
  league_id: number;
  season_id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  group_name: string | null;
  round_number: number | null;
  round_name: string | null;
  event_date: string; // ISO timestamptz
  status: string; // 'finished' | 'notstarted' | live states
}

export interface StandingRow {
  position: number;
  team: string;
  team_id: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: string; // e.g. "WWDLW"
  xgf?: number;
  xga?: number;
  xgd?: number;
  xg_games?: number;
  live?: boolean;
}

export interface CompetitionData {
  config: LeagueConfig;
  tabs: LeagueTab[];
  defaultTab: LeagueTab;
  seasonId: number | null;
  seasonName: string | null;
  fixtures: LeagueMatchRow[]; // current season, notstarted, soonest-first
  resultDates: string[]; // distinct YYYY-MM-DD with finished matches, most recent first
  defaultDate: string | null;
  selectedDate: string | null;
  results: LeagueMatchRow[]; // finished on selectedDate
  standings: StandingRow[];
  grouped: boolean;
  crests?: Record<string, string>;
}

export function dayOf(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

// ---- Read-time stream matching (never persisted) ------------------------
// streamed.pk football matches are the only stream source. Index them by the
// same canonical, alias-aware, order-insensitive team-pair key the rest of the
// app uses (normTeamKey), then resolve a league fixture to a playable match.

export function buildStreamIndex(footballMatches: Match[]): Map<string, Match[]> {
  const idx = new Map<string, Match[]>();
  for (const m of footballMatches) {
    if (!m.sources || m.sources.length === 0) continue;
    const key = normTeamKey(m);
    if (!key) continue;
    const arr = idx.get(key);
    if (arr) arr.push(m);
    else idx.set(key, [m]);
  }
  return idx;
}

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

// Returns the watch-page href for a league fixture if streamed.pk currently
// carries it (with a playable source), else null → caller shows kick-off time.
export function resolveLeagueStream(
  row: Pick<LeagueMatchRow, "home_team" | "away_team" | "event_date">,
  idx: Map<string, Match[]>
): string | null {
  const key = normTeamKey({
    teams: { home: { name: row.home_team }, away: { name: row.away_team } },
  });
  const cands = idx.get(key);
  if (!cands || cands.length === 0) return null;
  const target = Date.parse(row.event_date) || 0;
  // Same two teams can meet twice a season (reverse fixture) → normTeamKey
  // collides. Disambiguate by the streamed.pk match closest in time, and only
  // link when it's within ~2 days of this fixture so we never point at an
  // unrelated future meeting.
  let best = cands[0];
  if (cands.length > 1 && target) {
    best = cands.reduce((a, b) =>
      Math.abs((a.date || 0) - target) <= Math.abs((b.date || 0) - target) ? a : b
    );
  }
  if (target && best.date && Math.abs(best.date - target) > TWO_DAYS) return null;
  return `/watch/${encodeURIComponent(getMatchKey(best))}`;
}

// ---- Display helpers (professional club names + crests) -----------------

// Clubs whose feed names are long/awkward; everything else uses a light
// generic cleanup. Keeps rows readable on a phone instead of truncating mid-word.
const SHORT_NAMES: Record<string, string> = {
  "brighton & hove albion": "Brighton",
  "wolverhampton wanderers": "Wolves",
  "tottenham hotspur": "Tottenham",
  "manchester united": "Man United",
  "manchester city": "Man City",
  "newcastle united": "Newcastle",
  "west ham united": "West Ham",
  "nottingham forest": "Nott'm Forest",
  "sheffield united": "Sheffield Utd",
  "leeds united": "Leeds",
  "leicester city": "Leicester",
  "norwich city": "Norwich",
  "cardiff city": "Cardiff",
  "swansea city": "Swansea",
  "stoke city": "Stoke",
  "hull city": "Hull",
  "west bromwich albion": "West Brom",
  "queens park rangers": "QPR",
  "wolverhampton": "Wolves",
  "borussia mönchengladbach": "M'gladbach",
  "borussia monchengladbach": "M'gladbach",
  "borussia dortmund": "Dortmund",
  "bayern munich": "Bayern",
  "bayern münchen": "Bayern",
  "bayer leverkusen": "Leverkusen",
  "eintracht frankfurt": "Frankfurt",
  "rb leipzig": "RB Leipzig",
  "vfb stuttgart": "Stuttgart",
  "vfl wolfsburg": "Wolfsburg",
  "1899 hoffenheim": "Hoffenheim",
  "tsg hoffenheim": "Hoffenheim",
  "fc augsburg": "Augsburg",
  "werder bremen": "Bremen",
  "paris saint-germain": "PSG",
  "paris saint germain": "PSG",
  "olympique marseille": "Marseille",
  "olympique de marseille": "Marseille",
  "olympique lyonnais": "Lyon",
  "as monaco": "Monaco",
  "lille osc": "Lille",
  "stade rennais": "Rennes",
  "atlético madrid": "Atlético",
  "atletico madrid": "Atlético",
  "athletic club": "Athletic",
  "athletic bilbao": "Athletic",
  "real sociedad": "Sociedad",
  "real betis": "Betis",
  "celta vigo": "Celta",
  "rayo vallecano": "Rayo",
  "rcd espanyol": "Espanyol",
  "deportivo alavés": "Alavés",
  "internazionale": "Inter",
  "inter milan": "Inter",
  "ac milan": "Milan",
  "as roma": "Roma",
  "ss lazio": "Lazio",
  "hellas verona": "Verona",
  "us sassuolo": "Sassuolo",
};

export function shortTeamName(name: string): string {
  if (!name) return "";
  const key = name.trim().toLowerCase();
  if (SHORT_NAMES[key]) return SHORT_NAMES[key];
  // Generic: drop bare club-type tokens that add no information on a small screen.
  const cleaned = name
    .replace(/\b(FC|AFC|CF|SC|AC|BK|SK|VfL|VfB|TSG|SV|RC|CD)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || name;
}

// Build name → crest map from the whole streamed.pk football feed, so a club
// gets a real crest even when its specific fixture isn't currently listed
// (most top-flight clubs appear somewhere in a given match-week).
export function buildBadgeMap(footballMatches: Match[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of footballMatches) {
    for (const t of [m.teams?.home, m.teams?.away]) {
      if (t?.name && t.badge) {
        const k = normTeamName(t.name);
        if (k && !map.has(k)) map.set(k, t.badge);
      }
    }
  }
  return map;
}

export function badgeForName(name: string, map: Map<string, string> | null): string | undefined {
  if (!map) return undefined;
  return map.get(normTeamName(name));
}

export function badgeUrl(badge: string): string {
  return getBadgeUrl(badge);
}

// name -> crest URL from the league_teams cache (TheSportsDB), keyed by the same
// normalized name used elsewhere. Full URLs, used directly (not via badgeUrl).
export function crestForName(
  name: string,
  crests?: Record<string, string> | null
): string | undefined {
  if (!crests) return undefined;
  return crests[normTeamName(name)];
}
