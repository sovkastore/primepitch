// Deterministic team-name matcher — the free fallback when the AI matcher
// is unavailable (no credit, rate limit, network error).

export interface FixtureTeams {
  home: string;
  away: string;
  kickoff: number; // unix seconds
}

export interface CandidateMatch {
  index: number;
  home: string;
  away: string;
  matchTime: number; // unix seconds
}

// Strip diacritics, club-name decorations, and casing so that
// "FC Astana" ≈ "Astana" and "Atlético" ≈ "Atletico".
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|cd|ac|as|ssc|bk|fk|sk|if|club|deportivo|real)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Containment for partial names ("tobol" vs "tobol kostanay")
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
}

const KICKOFF_TOLERANCE_SECONDS = 30 * 60;

// Returns the matched candidate index, or null when no confident match exists.
// Requires both team names to match (either orientation); when only names of
// one pairing match partially, kickoff-time proximity acts as the tiebreaker.
export function findDeterministicMatch(
  fixture: FixtureTeams,
  candidates: CandidateMatch[]
): number | null {
  const home = normalizeTeamName(fixture.home);
  const away = normalizeTeamName(fixture.away);

  let best: { index: number; score: number } | null = null;
  for (const c of candidates) {
    const cHome = normalizeTeamName(c.home);
    const cAway = normalizeTeamName(c.away);

    const straight = namesMatch(home, cHome) && namesMatch(away, cAway);
    const flipped = namesMatch(home, cAway) && namesMatch(away, cHome);
    if (!straight && !flipped) continue;

    const exact =
      (home === cHome && away === cAway) || (home === cAway && away === cHome);
    const timeDelta = Math.abs(c.matchTime - fixture.kickoff);
    const timeOk = !c.matchTime || timeDelta <= KICKOFF_TOLERANCE_SECONDS;

    // Exact name matches win outright; partial matches need kickoff proximity.
    const score = (exact ? 100 : 50) + (timeOk ? 10 : 0) - Math.min(timeDelta / 3600, 9);
    if (!exact && !timeOk) continue;
    if (!best || score > best.score) best = { index: c.index, score };
  }
  return best ? best.index : null;
}
