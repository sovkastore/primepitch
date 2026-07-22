import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getMatches, getMatchStatus, type Match } from "@/lib/api";

// Upcoming + live football fixtures for the popunder "selected matches" picker.
// Returns only public schedule data (title + kickoff), so no extra auth needed.

function keyOf(m: Match): string {
  const s = m.sources?.[0];
  return s ? `${s.source}--${s.id}` : m.id;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await getMatches("football");
    const fixtures = matches
      .filter((m) => !m.ended && getMatchStatus(m) !== "ended") // upcoming or live
      .sort((a, b) => a.date - b.date)
      .slice(0, 120)
      .map((m) => ({
        key: keyOf(m),
        title: m.title,
        date: m.date,
        status: getMatchStatus(m),
      }));
    return NextResponse.json({ fixtures });
  } catch {
    return NextResponse.json({ fixtures: [] });
  }
}
