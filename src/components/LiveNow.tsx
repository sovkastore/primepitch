"use client";

import { useState } from "react";
import LiveMatchRow from "@/components/LiveMatchRow";
import { Match, getMatchKey } from "@/lib/api";
import { useBatchScores } from "@/lib/use-batch-scores";

export default function LiveNow({ matches }: { matches: Match[] }) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? matches : matches.slice(0, 6);
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase">Live Now</h2>
          <span className="text-[11px] text-gray-400 font-semibold ml-1">{matches.length} streams</span>
        </div>
        {matches.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] text-emerald-500 hover:text-emerald-600 transition-colors font-semibold"
          >
            {showAll ? "Show Less" : "View All"} &rsaquo;
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sortedVisible.map((match) => (
          <LiveMatchRow key={getMatchKey(match)} match={match} score={scores[getMatchKey(match)] || null} />
        ))}
      </div>
    </section>
  );
}
