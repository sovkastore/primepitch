import Link from "next/link";
import { Match, getMatchStatus, getTimeInfo, SPORT_ICONS } from "@/lib/api";

export default function MatchCard({ match }: { match: Match }) {
  const status = getMatchStatus(match);
  const timeInfo = getTimeInfo(match);
  const icon = SPORT_ICONS[match.category] || "\u26BD";
  const firstSource = match.sources?.[0];
  const href = firstSource
    ? `/watch/${encodeURIComponent(firstSource.source)}--${encodeURIComponent(firstSource.id)}`
    : "#";

  return (
    <Link href={href} className="block group">
      <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-4 hover:border-emerald-500/50 hover:bg-zinc-800/80 transition-all min-w-[220px]">
        {/* Status badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>{icon}</span>
            <span className="capitalize">{match.category.replace("-", " ")}</span>
          </span>
          {status === "live" ? (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600/20 border border-red-500/30 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-red-400">LIVE</span>
            </span>
          ) : (
            <span className="text-xs text-gray-500">{timeInfo}</span>
          )}
        </div>

        {/* Match title */}
        <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors line-clamp-2">
          {match.title}
        </p>

        {/* Time info for live */}
        {status === "live" && (
          <p className="text-xs text-red-400 mt-2">{timeInfo}</p>
        )}
      </div>
    </Link>
  );
}
