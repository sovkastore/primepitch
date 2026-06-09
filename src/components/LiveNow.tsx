"use client";

import { useState } from "react";
import LiveMatchRow from "@/components/LiveMatchRow";
import { Match } from "@/lib/api";

export default function LiveNow({ matches }: { matches: Match[] }) {
  const [showAll, setShowAll] = useState(false);

  if (matches.length === 0) return null;

  const visible = showAll ? matches : matches.slice(0, 6);

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
        {visible.map((match, i) => (
          <LiveMatchRow key={`live-${match.id}-${i}`} match={match} />
        ))}
      </div>
    </section>
  );
}
