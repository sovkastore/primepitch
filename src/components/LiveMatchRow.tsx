"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getWatchHref, SPORT_LABELS } from "@/lib/api";

export default function LiveMatchRow({ match }: { match: Match }) {
  const href = getWatchHref(match);
  const hasTeams = match.teams?.home && match.teams?.away;
  const label = SPORT_LABELS[match.category] || match.category;

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4">
        {/* Top: LIVE badge + sport */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg text-[9px] font-black text-red-500 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
          <span className="text-[10px] font-semibold text-gray-400">{label}</span>
        </div>

        {hasTeams ? (
          <div className="flex items-center gap-3">
            {/* Home team */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <TeamBadge
                badge={match.teams!.home!.badge}
                name={match.teams!.home!.name}
                size="lg"
                sport={match.category}
              />
              <p className="text-[12px] font-bold text-gray-900 text-center truncate w-full">
                {match.teams!.home!.name}
              </p>
            </div>

            {/* VS */}
            <span className="text-[11px] text-gray-400 font-extrabold tracking-wider shrink-0">VS</span>

            {/* Away team */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <TeamBadge
                badge={match.teams!.away!.badge}
                name={match.teams!.away!.name}
                size="lg"
                sport={match.category}
              />
              <p className="text-[12px] font-bold text-gray-900 text-center truncate w-full">
                {match.teams!.away!.name}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] font-bold text-gray-900 text-center">{match.title}</p>
        )}

        {/* WATCH button */}
        <div className="mt-3">
          <span className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-500 rounded-xl text-[11px] font-black text-white tracking-wide group-hover:bg-emerald-600 transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            WATCH
          </span>
        </div>
      </div>
    </Link>
  );
}
