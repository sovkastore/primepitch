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

// 0..1 similarity between two normalized names: the best of word overlap and
// character-bigram overlap, so "bayern munchen" ≈ "bayern munich" (0.5 words,
// ~0.7 bigrams) while "arsenal" vs "aston villa" stays low.
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (namesMatch(a, b)) return 0.9;
  const wa = new Set(a.split(" ").filter((w) => w.length > 1));
  const wb = new Set(b.split(" ").filter((w) => w.length > 1));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const wordScore = wa.size && wb.size ? shared / Math.max(wa.size, wb.size) : 0;
  const grams = (s: string) => { const g = new Map<string, number>(); const t = s.replace(/ /g, ""); for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
  const ga = grams(a), gb = grams(b);
  let inter = 0, total = 0;
  for (const [k, n] of ga) { total += n; inter += Math.min(n, gb.get(k) || 0); }
  for (const [, n] of gb) total += n;
  const bigramScore = total ? (2 * inter) / total : 0;
  return Math.max(wordScore, bigramScore);
}

// Are these two feed entries the same real match? Same kickoff window and the
// team pairs are clearly the same, allowing one spelling to differ
// ("FC Bayern München" vs "FC Bayern Munich") as long as the other team is a
// solid match.
export function sameFixture(
  x: { home: string; away: string; time: number },
  y: { home: string; away: string; time: number },
  windowSec = 3 * 3600,
): boolean {
  if (x.time && y.time && Math.abs(x.time - y.time) > windowSec) return false;
  const pair = (h1: string, a1: string, h2: string, a2: string) => {
    const s1 = nameSimilarity(h1, h2), s2 = nameSimilarity(a1, a2);
    // 0.72 keeps "bayern munchen"/"bayern munich" (≈0.78) together and
    // "manchester united"/"manchester city" (≈0.64) apart.
    return (s1 >= 0.85 && s2 >= 0.72) || (s2 >= 0.85 && s1 >= 0.72);
  };
  return pair(x.home, x.away, y.home, y.away) || pair(x.home, x.away, y.away, y.home);
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
