import { Match, getMatchStatus } from "@/lib/api";
import MatchCard from "./MatchCard";

export default function LiveNow({ matches }: { matches: Match[] }) {
  const liveMatches = matches.filter((m) => getMatchStatus(m) === "live");

  if (liveMatches.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <h2 className="text-xl font-bold text-white">LIVE RIGHT NOW</h2>
        </div>
        <span className="text-sm text-gray-500">{liveMatches.length} live</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {liveMatches.map((match) => (
          <div key={`${match.category}-${match.title}`} className="shrink-0">
            <MatchCard match={match} />
          </div>
        ))}
      </div>
    </section>
  );
}
