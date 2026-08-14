// AI big-game picker — given today's BSD fixture list and the admin's
// criteria, Claude selects every fixture that qualifies (no maximum).
// Throws on API failure so the caller can fall back to keyword rules.
import Anthropic from "@anthropic-ai/sdk";

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
} as const;

export async function pickBigGames(
  criteria: string,
  fixtures: PickFixture[]
): Promise<AiPickResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });

  const lines = fixtures
    .map((f) => `${f.id}: ${f.home} vs ${f.away} — ${f.league || "unknown league"} — ${f.eventDate}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 6000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: PICK_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content:
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
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("AI request was refused");

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("AI returned no text content");
  const parsed = JSON.parse(text) as { picks: { id: string; reason: string }[] };

  const validIds = new Set(fixtures.map((f) => String(f.id)));
  return {
    picks: (parsed.picks || []).filter((p) => validIds.has(String(p.id))),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// Keyword fallback when the AI is unavailable. Coarser than Claude (e.g. it
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
