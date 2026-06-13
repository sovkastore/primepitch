"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getMatchStatus, getUpcomingTime, getWatchHref, getPosterUrl, SPORT_ICONS, SPORT_LABELS, showVersus } from "@/lib/api";

export default function MatchCard({ match, compact }: { match: Match; compact?: boolean }) {
  const status = getMatchStatus(match);
  const icon = SPORT_ICONS[match.category] || "\u26BD";
  const label = SPORT_LABELS[match.category] || match.category;
  const href = getWatchHref(match);
  const isLive = status === "live";
  const hasTeams = showVersus(match);
  const poster = match.poster ? getPosterUrl(match.poster) : null;

  if (compact) {
    return (
      <Link href={href} className="block group">
        <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
          isLive
            ? "bg-red-500/[0.03] border-red-500/10 hover:border-red-500/25"
            : "bg-white/[0.02] border-blue-300/[0.04] hover:border-white/[0.1]"
        }`}>
          {hasTeams ? (
            <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size="sm" sport={match.category} />
          ) : (
            <span className="text-xl shrink-0">{icon}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">{match.title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
          </div>
          {hasTeams && (
            <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size="sm" sport={match.category} />
          )}
          {isLive ? (
            <span className="badge-live shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-[11px] text-gray-500 shrink-0">{getUpcomingTime(match)}</span>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="block group">
      <div className={`relative rounded-2xl border overflow-hidden transition-all ${
        isLive
          ? "border-red-500/15 hover:border-red-500/30"
          : "border-blue-300/[0.05] hover:border-white/[0.12]"
      }`}>
        {/* Background */}
        {poster ? (
          <>
            <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
          </>
        ) : (
          <div className={`absolute inset-0 ${
            isLive
              ? "bg-gradient-to-br from-red-900/20 via-[#111a2e] to-[#111a2e]"
              : "bg-gradient-to-br from-white/[0.03] via-[#111a2e] to-[#111a2e]"
          }`} />
        )}

        <div className="relative p-5">
          {/* Top: sport + badge */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-white/[0.05] border border-blue-300/[0.04] flex items-center justify-center text-base">{icon}</span>
              <span className="text-xs font-semibold text-gray-400">{label}</span>
            </div>
            {isLive ? (
              <span className="badge-live">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 bg-white/[0.04] px-3 py-1 rounded-full font-medium">{getUpcomingTime(match)}</span>
            )}
          </div>

          {/* Teams with badges */}
          {hasTeams ? (
            <div className="flex items-center gap-3 mb-4">
              <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size="md" sport={match.category} />
              <div className="flex-1 min-w-0 text-center">
                <p className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                  {match.teams!.home!.name}
                </p>
                <p className="text-[10px] text-emerald-400 font-bold my-0.5">VS</p>
                <p className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                  {match.teams!.away!.name}
                </p>
              </div>
              <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size="md" sport={match.category} />
            </div>
          ) : (
            <h3 className="text-base font-bold text-white leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors mb-4">
              {match.title}
            </h3>
          )}

          {/* Bottom */}
          <div className="flex items-center justify-between pt-3 border-t border-blue-300/[0.04]">
            <span className="text-[11px] text-gray-600">
              {isLive ? "Streaming now" : new Date(match.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="text-[11px] text-emerald-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {isLive ? "Watch" : "Set reminder"}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
