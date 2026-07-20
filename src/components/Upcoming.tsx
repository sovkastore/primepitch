"use client";

import UpcomingRow from "@/components/UpcomingRow";
import { Match, getMatchStatus, getMatchKey } from "@/lib/api";

export default function TodayMatches({
  matches,
  excludeKeys,
}: {
  matches: Match[];
  excludeKeys?: Set<string>;
}) {
  const upcoming = matches
    .filter((m) => getMatchStatus(m) === "upcoming" && !excludeKeys?.has(getMatchKey(m)))
    .sort((a, b) => a.date - b.date);

  if (upcoming.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
      <div className="mb-4">
        <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase kicker-dot">Upcoming</h2>
      </div>

      <div className="space-y-2">
        {upcoming.map((match) => (
          <UpcomingRow key={getMatchKey(match)} match={match} />
        ))}
      </div>
    </section>
  );
}
