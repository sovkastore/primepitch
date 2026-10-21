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

// Keyword fallback when the AI is unavailable. Coarser than the model (e.g. it
// can't reliably tell apart same-named foreign leagues) but keeps the daily
// pick running.
const LEAGUE_KEYWORDS = [
  "champions league", "europa league", "uefa super cup",
  "premier league", "la liga", "laliga", "serie a", "bundesliga", "ligue 1",
  "fa cup", "carabao", "efl cup", "community shield",
  "copa del rey", "supercopa", "coppa italia", "supercoppa",
  "dfb", "pokal", "coupe de france", "trophee des champions",
];
const LEAGUE_EXCLUDE = ["brazil", "brasil", "women", "femin", "u19", "u21", "u23", "youth"];
const CLUB_KEYWORDS = [
  "galatasaray", "fenerbahce", "besiktas", "trabzonspor",
  "al nassr", "al-nassr", "al hilal", "al-hilal", "al ittihad", "al-ittihad",
  "inter miami",
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function pickBigGamesFallback(fixtures: PickFixture[]): { id: string; reason: string }[] {
  const picks: { id: string; reason: string }[] = [];
  for (const f of fixtures) {
    const league = fold(f.league || "");
    const teams = fold(`${f.home} ${f.away}`);
    if (LEAGUE_EXCLUDE.some((k) => league.includes(k))) continue;
    const leagueHit = LEAGUE_KEYWORDS.find((k) => league.includes(k));
    const clubHit = CLUB_KEYWORDS.find((k) => teams.includes(k));
    if (leagueHit || clubHit) {
      picks.push({
        id: String(f.id),
        reason: `Keyword match: ${leagueHit || clubHit} (rules fallback)`,
      });
    }
  }
  return picks;
}
