"use client";

import LiveMatchRow from "@/components/LiveMatchRow";
import { Match, getMatchKey, isFinishedStatus } from "@/lib/api";
import { useBatchScores } from "@/lib/use-batch-scores";

export default function LiveNow({ matches }: { matches: Match[] }) {
  const visible = matches;
  // ONE request covers scores for every visible card (was one request per card).
  const scores = useBatchScores(visible);

  // Order: HOT live matches first, then the other live matches with the most
  // recent kickoff on top, and finished (FT) matches sink to the bottom.
  const isEnded = (m: Match) => m.ended === true || isFinishedStatus(scores[getMatchKey(m)]?.status);
  const sortedVisible = [...visible].sort((a, b) => {
    const aEnded = isEnded(a), bEnded = isEnded(b);
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    if (!aEnded) {
      const aHot = a.hot === true, bHot = b.hot === true;
      if (aHot !== bHot) return aHot ? -1 : 1;
    }
    return (b.date || 0) - (a.date || 0);
  });

  if (matches.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
      {/* Same kicker as "● UPCOMING" below, with a pulsing red dot instead. */}
      <div className="mb-4">
        <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase kicker-dot kicker-dot-live">Live</h2>
      </div>

      <div className="space-y-2">
        {sortedVisible.map((match) => (
          <LiveMatchRow key={getMatchKey(match)} match={match} score={scores[getMatchKey(match)] || null} />
        ))}
      </div>
    </section>
  );
}
