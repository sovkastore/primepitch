// AI big-game picker — given today's BSD fixture list and the admin's
// criteria, the model selects every fixture that qualifies (no maximum).
// Throws on API failure so the caller can fall back to keyword rules.
import { groqJson } from "@/lib/groq";

export interface PickFixture {
  id: string | number;
  home: string;
  away: string;
  league: string;
  eventDate: string;
}

export interface AiPickResult {
  picks: { id: string; reason: string }[];
  inputTokens: number;
  outputTokens: number;
}

const PICK_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The fixture id exactly as listed" },
          reason: { type: "string", description: "Why this qualifies, one short sentence" },
        },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
};

export async function pickBigGames(
  criteria: string,
  fixtures: PickFixture[]
): Promise<AiPickResult> {
  const lines = fixtures
    .map((f) => `${f.id}: ${f.home} vs ${f.away} — ${f.league || "unknown league"} — ${f.eventDate}`)
    .join("\n");

  const result = await groqJson<{ picks?: { id: string; reason: string }[] }>({
    schemaName: "big_game_picks",
    schema: PICK_SCHEMA,
    maxTokens: 6000,
    prompt:
      `You select which football fixtures a streaming site should feature today. ` +
      `Select EVERY fixture that matches the criteria below — there is no maximum. ` +
      `Select nothing that doesn't match. League and team names may be abbreviated, ` +
      `transliterated, or in another language; judge what they refer to. Be careful with ` +
      `same-named leagues from other countries (e.g. Brazilian "Serie A" is NOT the Italian one). ` +
      `Only pick fixtures you are CERTAIN qualify — if you are unsure (for example whether a ` +
      `club currently plays in a listed division), leave it out; never pick "just in case". ` +
      `A rule about clubs from a league's first division means the club must currently play in ` +
      `that first division — second-division clubs do not qualify.\n\n` +
      `CRITERIA:\n${criteria}\n\n` +
      `TODAY'S FIXTURES:\n${lines}\n\n` +
      `Return the ids of every qualifying fixture.`,
  });

  const validIds = new Set(fixtures.map((f) => String(f.id)));
  const picks = Array.isArray(result.data.picks) ? result.data.picks : [];
  return {
    picks: picks
      .filter((p) => p && typeof p.id === "string" && validIds.has(String(p.id)))
      .map((p) => ({ id: String(p.id), reason: typeof p.reason === "string" ? p.reason : "" })),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// Keyword fallback when the AI is unavailable. It mirrors the admin's
// allow-list as literally as keywords can: the competition name must match an
// allowed competition AND must not look like one of the many same-named
// competitions from elsewhere (CAF/AFC Champions League, Austrian or second
// Bundesliga, women's and youth editions…). For the selective leagues the
// allowed club must be playing. Coarser than the model, but it no longer
// picks half of world football.
const LEAGUE_EXCLUDE = [
  // other confederations' "champions leagues" and cups
  "caf", "afc", "concacaf", "conmebol", "libertadores", "sudamericana", "ofc", "asian",
  "african", "arab", "gulf", "cosafa", "cecafa", "wafu",
  // second divisions and below, reserves, youth, women
  "2.", "2 ", "ii", "b ", "serie b", "segunda", "championship", "ligue 2", "league two",
  "league one", "national league", "liga 2", "regionalliga", "3.", "reserve", "u19", "u20",
  "u21", "u23", "youth", "primavera", "women", "femin", "feminine", "frauen", "femenina",
  // countries whose leagues share a name with an allowed one
  "austria", "österreich", "osterreich", "brazil", "brasil", "russia", "ukrain", "swiss", "schweiz",
  "belgi", "scot", "ireland", "wales", "india", "china", "japan", "korea", "australia", "egypt",
  "south africa", "nigeria", "ghana", "kenya", "moroc", "tunisia", "algeria", "qualif", "friendly",
];
// Allowed competitions: every match qualifies.
const OPEN_COMPETITIONS = [
  "uefa champions league", "champions league", "uefa europa league", "europa league",
  "uefa conference league", "conference league", "uefa super cup",
  "premier league", "la liga", "laliga", "serie a", "bundesliga", "ligue 1",
];
// Allowed cups: only if a top-5 first-division club is involved — the keyword
// fallback can't verify that, so it leaves cups to the AI and picks none.
// Selective leagues: allowed only with one of these clubs on the pitch.
const SELECTIVE: { competition: string[]; clubs: string[] }[] = [
  { competition: ["primeira liga", "liga portugal", "taca de portugal", "taça de portugal", "taca da liga", "supertaca"], clubs: ["benfica", "porto", "sporting cp", "sporting", "braga"] },
  { competition: ["eredivisie", "knvb", "johan cruyff"], clubs: ["ajax", "psv", "feyenoord"] },
  { competition: ["saudi pro", "saudi professional", "roshn", "king cup", "king's cup", "saudi super"], clubs: ["al nassr", "al-nassr", "al hilal", "al-hilal", "al ittihad", "al-ittihad"] },
  { competition: ["super lig", "süper lig", "turkish cup", "turkiye kupasi", "türkiye kupası", "turkish super"], clubs: ["galatasaray", "fenerbahce", "fenerbahçe", "besiktas", "beşiktaş", "trabzonspor"] },
  { competition: ["mls", "major league soccer", "us open cup", "u.s. open cup", "leagues cup"], clubs: ["inter miami"] },
  { competition: ["brasileiro", "brasileirao", "brasileirão", "brazil", "brasil"], clubs: ["santos"] },
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function pickBigGamesFallback(fixtures: PickFixture[]): { id: string; reason: string }[] {
  const picks: { id: string; reason: string }[] = [];
  for (const f of fixtures) {
    const league = fold(f.league || "");
    const teams = fold(`${f.home} ${f.away}`);
    if (!league) continue;

    // Selective leagues first: their competition names are allowed only with
    // a listed club, and some (Brazilian "Serie A") share a name with an open
    // competition from another country.
    const selective = SELECTIVE.find((s) => s.competition.some((c) => league.includes(fold(c))));
    if (selective) {
      const club = selective.clubs.find((c) => teams.includes(fold(c)));
      if (club) picks.push({ id: String(f.id), reason: `Keyword match: ${club} in ${f.league} (rules fallback)` });
      continue;
    }

    if (LEAGUE_EXCLUDE.some((k) => league.includes(k))) continue;
    const open = OPEN_COMPETITIONS.find((k) => league.includes(k));
    if (open) picks.push({ id: String(f.id), reason: `Keyword match: ${open} (rules fallback)` });
  }
  return picks;
}
