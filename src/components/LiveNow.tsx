"use client";

import LiveMatchRow from "@/components/LiveMatchRow";
import { Match, getMatchKey } from "@/lib/api";
import { useBatchScores } from "@/lib/use-batch-scores";

export default function LiveNow({ matches }: { matches: Match[] }) {
  const visible = matches;
  // ONE request covers scores for every visible card (was one request per card).
  const scores = useBatchScores(visible);

  const sortedVisible = [...visible].sort((a, b) => {
    const aEnded = a.ended === true || (scores[getMatchKey(a)]?.status && ["Finished", "Match Finished", "FT", "AET", "PEN"].includes(scores[getMatchKey(a)]?.status || ""));
    const bEnded = b.ended === true || (scores[getMatchKey(b)]?.status && ["Finished", "Match Finished", "FT", "AET", "PEN"].includes(scores[getMatchKey(b)]?.status || ""));
    if (aEnded && !bEnded) return 1;
    if (!aEnded && bEnded) return -1;
    return 0;
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
