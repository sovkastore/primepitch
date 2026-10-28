import { countBsdRequest } from "@/lib/bsd-events";

// ---------------------------------------------------------------------------
// Current top-flight clubs of the top 5 leagues, used by the daily picker to
// verify cup matches ("at least one team must be a current top-5 first-
// division club") with plain code instead of the AI's memory, which goes out
// of date every summer (it still thought Girona/Mallorca were La Liga clubs).
//
// The lists are downloaded ONCE per season and saved. They only change in the
// summer, so a download happens only when the saved lists belong to an older
// season (the season rolls over on 1 July), or a league came back incomplete
// (schedule not published yet) — then it retries on the next daily run until
// all five are complete. The rest of the year: zero requests.
//
// Admins can edit any list by hand in admin; an edited list is kept as-is and
// never overwritten by a download (until "Re-download" is pressed).
// ---------------------------------------------------------------------------

const BSD = "https://sports.bzzoiro.com/api/";
const SETTING_KEY = "top_clubs";
const MIN_CLUBS = 18; // smallest top-5 league (Bundesliga, Ligue 1)

export const TOP_LEAGUES = [
  { key: "premier", name: "Premier League", country: "England", bsdId: 1 },
  { key: "laliga", name: "La Liga", country: "Spain", bsdId: 3 },
  { key: "seriea", name: "Serie A", country: "Italy", bsdId: 4 },
  { key: "bundesliga", name: "Bundesliga", country: "Germany", bsdId: 5 },
  { key: "ligue1", name: "Ligue 1", country: "France", bsdId: 6 },
] as const;

export interface LeagueClubs {
  teams: string[];
  teamIds: number[];
  seasonName?: string;
  manual?: boolean; // edited by an admin — never overwritten automatically
}

export interface TopClubs {
  season: number; // season start year, e.g. 2026 for 2026/27
  updatedAt: string;
  leagues: Record<string, LeagueClubs>;
}

/** 2026 for anything from 1 July 2026 to 30 June 2027. */
export function currentSeasonYear(d = new Date()): number {
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export function normClub(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function loadTopClubs(d1: D1Database): Promise<TopClubs | null> {
  try {
    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(SETTING_KEY).first<{ value: string }>();
    return row?.value ? (JSON.parse(row.value) as TopClubs) : null;
  } catch {
    return null;
  }
}

export async function saveTopClubs(d1: D1Database, data: TopClubs): Promise<void> {
  await d1
    .prepare(
      `INSERT INTO d1_site_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(SETTING_KEY, JSON.stringify(data), new Date().toISOString())
    .run();
}

async function bsdGet<T>(path: string, source: string): Promise<T> {
  await countBsdRequest(source);
  const res = await fetch(BSD + path, {
    headers: { Authorization: `Token ${process.env.BSD_API_KEY || ""}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`BSD ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// One league: its current season, then that season's schedule (which lists
// every club from the first matchday, even before a ball is kicked).
async function downloadLeague(bsdId: number): Promise<LeagueClubs> {
  const lg = await bsdGet<{ current_season?: { id: number; name?: string } }>(`leagues/${bsdId}/`, "top clubs");
  const seasonId = lg.current_season?.id;
  if (!seasonId) throw new Error("no current season");
  const ev = await bsdGet<{ results?: { home_team: string; away_team: string; home_team_obj?: { id?: number }; away_team_obj?: { id?: number } }[] }>(
    `events/?season=${seasonId}&limit=200`,
    "top clubs"
  );
  const names = new Map<string, string>();
  const ids = new Set<number>();
  for (const e of ev.results || []) {
    if (e.home_team) names.set(normClub(e.home_team), e.home_team);
    if (e.away_team) names.set(normClub(e.away_team), e.away_team);
    if (e.home_team_obj?.id) ids.add(e.home_team_obj.id);
    if (e.away_team_obj?.id) ids.add(e.away_team_obj.id);
  }
  return { teams: [...names.values()].sort(), teamIds: [...ids], seasonName: lg.current_season?.name };
}

function complete(l?: LeagueClubs): boolean {
  return !!l && l.teams.length >= MIN_CLUBS;
}

/**
 * Returns the saved lists, downloading only what's needed: a new season, or a
 * league that is still missing/incomplete. `force` re-downloads every league
 * that wasn't edited by hand. A failed download keeps the previous list.
 */
export async function ensureTopClubs(d1: D1Database, force = false): Promise<TopClubs> {
  const season = currentSeasonYear();
  const saved = await loadTopClubs(d1);
  const newSeason = !saved || saved.season !== season;
  const out: TopClubs = { season, updatedAt: saved?.updatedAt || "", leagues: { ...(saved?.leagues || {}) } };
  let changed = newSeason;

  for (const L of TOP_LEAGUES) {
    const cur = out.leagues[L.key];
    const keepManual = cur?.manual && !newSeason && !force;
    const needs = force || newSeason || !complete(cur);
    if (keepManual || !needs) continue;
    try {
      const fresh = await downloadLeague(L.bsdId);
      if (complete(fresh)) {
        out.leagues[L.key] = fresh;
        changed = true;
      }
    } catch {
      /* keep whatever we had; retried on the next run */
    }
  }
  if (changed) {
    out.updatedAt = new Date().toISOString();
    await saveTopClubs(d1, out);
  }
  return out;
}

// --- checking a cup match -----------------------------------------------------

// Domestic cups / super cups of the five countries (BSD league names vary a
// little: "DFB Pokal", "Carabao Cup", "EFL Cup", "Copa del Rey", …).
const CUP_RE =
  /fa cup|carabao|efl cup|league cup|community shield|copa del rey|supercopa|coppa italia|supercoppa|dfb|pokal|supercup|super cup|coupe de france|troph[eé]e des champions/i;
const TOP5_COUNTRIES = new Set<string>(TOP_LEAGUES.map((l) => l.country));

export function isTop5DomesticCup(leagueName: string, country?: string): boolean {
  if (!CUP_RE.test(leagueName || "")) return false;
  // Without a country we can still trust clearly national cup names.
  return country ? TOP5_COUNTRIES.has(country) : true;
}

export function makeClubChecker(clubs: TopClubs | null) {
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const l of Object.values(clubs?.leagues || {})) {
    for (const id of l.teamIds || []) ids.add(id);
    for (const n of l.teams || []) names.add(normClub(n));
  }
  const ready = names.size >= MIN_CLUBS * 3; // lists genuinely loaded
  return {
    ready,
    isTopClub(name: string, id?: number): boolean {
      if (id && ids.has(id)) return true;
      return names.has(normClub(name));
    },
  };
}
