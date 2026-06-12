// Shared duplicate-listing merge logic for the admin dashboard
// (Matches page + Live Monitor traction). Display-only: raw data untouched.
//
// 1. normTitle(): word-level normalization — handles "vs" vs "-" separators,
//    team-order ("A vs B" === "B vs A"), team-name aliases, stray years,
//    emoji, and ppv prefixes.
// 2. clusterRows(): groups rows with the same normalized title whose first
//    activity falls within a per-sport day window. Football/fight/motorsport
//    use 3 days (no rematches possible that fast); series sports like
//    basketball/baseball/hockey stay strict same-day (teams DO replay
//    back-to-back nights, and those are different games).

// Word-boundary aliases, applied to lowercased, punctuation-stripped,
// SPACE-SEPARATED text (so \b works). Longer phrases first.
const WORD_ALIASES: [RegExp, string][] = [
  [/\bbosnia and herzegovina\b/g, "bosnia"],
  [/\bbosnia herzegovina\b/g, "bosnia"],
  [/\bunited states of america\b/g, "united states"],
  [/\busa\b/g, "united states"],
  [/\bkorea republic\b/g, "south korea"],
  [/\bczech republic\b/g, "czechia"],
  [/\bivory coast\b/g, "cote divoire"],
  [/\bcote d ivoire\b/g, "cote divoire"],
  [/\bholland\b/g, "netherlands"],
  [/\bfifa world cup\b/g, "world cup"],
];

// " vs ", " vs. ", " v ", " - ", " – ", " — " between two sides.
const SIDE_SEP = /\s+(?:vs\.?|v\.?|-|–|—)\s+/i;

function normSide(s: string): string {
  let n = (s || "").toLowerCase();
  n = n.replace(/[^a-z0-9]+/g, " ").trim(); // strip punctuation/emoji, keep word gaps
  n = n.replace(/^ppv\s+/, "");             // admin ppv listings are the same match
  n = n.replace(/\b20\d\d\b/g, " ");        // stray years ("2026 PFL Africa 2")
  for (const [re, sub] of WORD_ALIASES) n = n.replace(re, sub);
  return n.replace(/\s+/g, "");
}

export function normTitle(t: string): string {
  const raw = (t || "").trim();
  const parts = raw.split(SIDE_SEP);
  if (parts.length === 2 && parts[0] && parts[1]) {
    // Two-team title: normalize each side, sort so order never matters.
    return parts.map(normSide).sort().join("|");
  }
  return normSide(raw);
}

// Day window per sport. >1 only where same-title rematches within the window
// are impossible.
const WIDE_WINDOW_SPORTS = new Set([
  "football", "soccer",
  "fight", "mma", "boxing",
  "motor-sports", "motorsports", "motorsport", "racing",
  "american-football", "rugby",
]);
export function mergeWindowDays(sport: string | null | undefined): number {
  return WIDE_WINDOW_SPORTS.has((sport || "").toLowerCase()) ? 3 : 1;
}

const dayMs = 86_400_000;
const dayDiff = (a: string, b: string) =>
  Math.abs((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

// Generic clustering: rows sharing a normalized title are sorted by first-seen
// day, then chained while consecutive rows stay within the sport's window of
// the cluster's first day.
export function clusterRows<T>(
  rows: T[],
  get: { title: (r: T) => string; sport: (r: T) => string; day: (r: T) => string }
): T[][] {
  const byTitle: Record<string, T[]> = {};
  for (const r of rows) {
    const k = normTitle(get.title(r));
    (byTitle[k] ||= []).push(r);
  }
  const out: T[][] = [];
  for (const k of Object.keys(byTitle)) {
    const g = byTitle[k]
      .slice()
      .sort((a, b) => get.day(a).localeCompare(get.day(b)));
    const win = mergeWindowDays(get.sport(g[0]));
    let cluster: T[] = [];
    let start = "";
    for (const r of g) {
      const d = (get.day(r) || "").slice(0, 10);
      if (cluster.length === 0) {
        cluster = [r];
        start = d;
      } else if (dayDiff(start, d) < win) {
        cluster.push(r);
      } else {
        out.push(cluster);
        cluster = [r];
        start = d;
      }
    }
    if (cluster.length) out.push(cluster);
  }
  return out;
}
