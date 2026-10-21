// AI match judge — first-choice matcher. Given a BSD fixture and the list of
// matches in the RapidAPI feed, the model decides which feed entry (if any)
// is the same real-world match. Throws on API failure so the caller can fall
// back to the deterministic matcher.
import { groqJson } from "@/lib/groq";
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
};

export async function findAiMatch(
  fixture: FixtureTeams & { league?: string },
  candidates: CandidateMatch[]
): Promise<AiMatchResult> {
  const kickoffIso = new Date(fixture.kickoff * 1000).toISOString();
  const candidateLines = candidates
    .map((c) => {
      const t = c.matchTime ? new Date(c.matchTime * 1000).toISOString() : "unknown time";
      return `${c.index}: ${c.home} vs ${c.away} (${t})`;
    })
    .join("\n");

  const result = await groqJson<{ matched_index: number | null; confidence: "high" | "medium" | "low" }>({
    schemaName: "match_verdict",
    schema: RESULT_SCHEMA,
    maxTokens: 2000,
    prompt:
      `You are matching football fixtures between two data providers. Team names may be ` +
      `spelled differently, abbreviated, transliterated, or in different languages — but they ` +
      `must refer to the same two clubs. Home/away order may be flipped. Kickoff times should ` +
      `be within about 30 minutes of each other when both are known.\n\n` +
      `Fixture to find:\n${fixture.home} vs ${fixture.away}` +
      `${fixture.league ? ` (${fixture.league})` : ""}, kickoff ${kickoffIso}\n\n` +
      `Candidates:\n${candidateLines}\n\n` +
      `Which candidate is the same match? Answer null if none clearly is — a wrong match is ` +
      `much worse than no match.`,
  });

  const parsed = result.data;
  const index =
    typeof parsed.matched_index === "number" &&
    candidates.some((c) => c.index === parsed.matched_index)
      ? parsed.matched_index
      : null;
  const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low";

  return {
    index,
    confidence,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
