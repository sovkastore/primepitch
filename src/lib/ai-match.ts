// AI match judge — first-choice matcher. Given a BSD fixture and the list of
// matches in the RapidAPI feed, Claude decides which feed entry (if any) is
// the same real-world match. Throws on API failure so the caller can fall
// back to the deterministic matcher.
import Anthropic from "@anthropic-ai/sdk";
import type { CandidateMatch, FixtureTeams } from "@/lib/team-match";

export interface AiMatchResult {
  index: number | null;
  confidence: "high" | "medium" | "low";
  inputTokens: number;
  outputTokens: number;
}

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    matched_index: {
      type: ["integer", "null"],
      description: "The index of the candidate that is the same match, or null if none is",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["matched_index", "confidence"],
  additionalProperties: false,
} as const;

export async function findAiMatch(
  fixture: FixtureTeams & { league?: string },
  candidates: CandidateMatch[]
): Promise<AiMatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });

  const kickoffIso = new Date(fixture.kickoff * 1000).toISOString();
  const candidateLines = candidates
    .map((c) => {
      const t = c.matchTime ? new Date(c.matchTime * 1000).toISOString() : "unknown time";
      return `${c.index}: ${c.home} vs ${c.away} (${t})`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: RESULT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content:
          `You are matching football fixtures between two data providers. Team names may be ` +
          `spelled differently, abbreviated, transliterated, or in different languages — but they ` +
          `must refer to the same two clubs. Home/away order may be flipped. Kickoff times should ` +
          `be within about 30 minutes of each other when both are known.\n\n` +
          `Fixture to find:\n${fixture.home} vs ${fixture.away}` +
          `${fixture.league ? ` (${fixture.league})` : ""}, kickoff ${kickoffIso}\n\n` +
          `Candidates:\n${candidateLines}\n\n` +
          `Which candidate is the same match? Answer null if none clearly is — a wrong match is ` +
          `much worse than no match.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AI request was refused");
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("AI returned no text content");
  const parsed = JSON.parse(text) as { matched_index: number | null; confidence: "high" | "medium" | "low" };

  const index =
    typeof parsed.matched_index === "number" &&
    candidates.some((c) => c.index === parsed.matched_index)
      ? parsed.matched_index
      : null;

  return {
    index,
    confidence: parsed.confidence,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
