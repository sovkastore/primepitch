// Client-side helpers to attach BSD score entries to alt-page matches.

export interface ScoreInfo {
  bsdId: string;
  altId: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  period: string;
  ended: boolean;
}

function normName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function teamMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
}

// Match priority: exact robot link (altId) → BSD fixture id (mock cards) →
// fuzzy team names (manually-added matches).
export function findScore(
  scores: ScoreInfo[],
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  bsdMatchId?: string
): ScoreInfo | null {
  const byAlt = scores.find((s) => s.altId === matchId);
  if (byAlt) return byAlt;

  if (bsdMatchId?.startsWith("bsd-")) {
    const byBsd = scores.find((s) => s.bsdId === bsdMatchId.slice(4));
    if (byBsd) return byBsd;
  }

  const h = normName(homeTeam);
  const a = normName(awayTeam);
  return (
    scores.find((s) => {
      const sh = normName(s.home);
      const sa = normName(s.away);
      return (teamMatch(h, sh) && teamMatch(a, sa)) || (teamMatch(h, sa) && teamMatch(a, sh));
    }) || null
  );
}
