"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getWatchHref, SPORT_LABELS } from "@/lib/api";
import { visibleInterval } from "@/lib/poll";

export default function LiveMatchRow({ match }: { match: Match }) {
  const href = getWatchHref(match);
  const hasTeams = match.teams?.home && match.teams?.away;
  const label = SPORT_LABELS[match.category] || match.category;
  const [score, setScore] = useState<{ home: number; away: number; minute: number | null; period: string; league?: string | null } | null>(null);

  useEffect(() => {
    if (!hasTeams) return;
    const home = encodeURIComponent(match.teams!.home!.name);
    const away = encodeURIComponent(match.teams!.away!.name);
    const fetchScore = () => {
      fetch(`/api/live-score?home=${home}&away=${away}`)
        .then((r) => r.json())
        .then((d) => { if (d.score) setScore(d.score); })
        .catch(() => {});
    };
    return visibleInterval(fetchScore, 60_000);
  }, [hasTeams, match.teams?.home?.name, match.teams?.away?.name]);

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-2xl border border-gray-100 card-lift p-4 overflow-hidden">
        {/* Thin live accent */}
        <div className="accent-live h-1 -mx-4 -mt-4 mb-3" />
        {/* Top: LIVE badge + sport */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg text-[9px] font-black text-red-500 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
          <span className="text-[10px] font-semibold text-gray-400 truncate max-w-[55%] text-right">{score?.league || label}</span>
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

            {/* Score or VS */}
            {score ? (
              <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 rounded-lg">
                  <span className="text-sm font-black text-white tabular-nums">{score.home}</span>
                  <span className="text-[10px] text-gray-400 font-bold">-</span>
                  <span className="text-sm font-black text-white tabular-nums">{score.away}</span>
                </div>
                {score.period === "HT" ? (
                  <span className="text-[8px] font-bold text-amber-500 mt-1">HT</span>
                ) : score.minute ? (
                  <span className="text-[8px] font-bold text-emerald-500 mt-1">{score.minute}&apos;</span>
                ) : null}
              </div>
            ) : (
              <span className="text-[11px] text-gray-400 font-extrabold tracking-wider shrink-0">VS</span>
            )}

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
          <span className="flex items-center justify-center gap-2 w-full py-2.5 btn-gradient rounded-xl text-[11px] font-black text-white tracking-wide">
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
