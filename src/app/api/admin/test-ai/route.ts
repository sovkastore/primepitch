import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { findAiMatch } from "@/lib/ai-match";

// "Prove the AI works" button: runs a small canned matching problem through
// the Groq model and returns the verdict + token usage.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  const started = Date.now();
  try {
    const kickoff = Math.floor(Date.now() / 1000);
    const result = await findAiMatch(
      { home: "Manchester United", away: "FC Barcelona", kickoff, league: "Test Friendly" },
      [
        { index: 0, home: "Real Madrid", away: "Liverpool", matchTime: kickoff },
        { index: 1, home: "Man Utd", away: "Barcelona", matchTime: kickoff },
        { index: 2, home: "Bayern Munich", away: "PSG", matchTime: kickoff },
      ]
    );
    const correct = result.index === 1;
    return NextResponse.json({
      ok: true,
      working: correct,
      verdict: correct
        ? `AI correctly matched "Manchester United vs FC Barcelona" to "Man Utd vs Barcelona"`
        : `AI answered index ${result.index} (expected 1) — check configuration`,
      confidence: result.confidence,
      tokens: { input: result.inputTokens, output: result.outputTokens },
      ms: Date.now() - started,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        working: false,
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - started,
      },
      { status: 500 }
    );
  }
}
