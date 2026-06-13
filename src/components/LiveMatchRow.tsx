"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getWatchHref, SPORT_LABELS, isFinishedStatus, showVersus } from "@/lib/api";
import type { LiveScore } from "@/lib/use-batch-scores";

export default function LiveMatchRow({ match, score = null }: { match: Match; score?: LiveScore | null }) {
  const href = getWatchHref(match);
  const versus = showVersus(match);
  // Only use the two-circle team layout when BOTH sides have a real logo image.
  // Without logos, the circle just shows a letter, which looks like a broken
  // placeholder — so fall back to a clean "Name vs Name" line instead.
  const homeBadge = match.teams?.home?.badge?.trim();
  const awayBadge = match.teams?.away?.badge?.trim();
  const useTeamLayout = versus && Boolean(homeBadge && awayBadge);
  const titleText =
    versus && match.teams?.home?.name && match.teams?.away?.name
      ? `${match.teams.home.name} vs ${match.teams.away.name}`
      : match.title;
  const label = SPORT_LABELS[match.category] || match.category;
  // Ended = admin forced it (manual "End now"), or the score feed reports the
  // match finished (extra-time / penalties safe).
  const ended = match.ended === true || isFinishedStatus(score?.status);
  const hot = match.hot === true && !ended;

  const inner = (
    <div
      className={
        "rounded-2xl card-lift p-4 overflow-hidden " +
        (hot
          ? "bg-white border-2 border-red-300 ring-1 ring-red-200 animate-hot-glow"
          : "bg-white border border-gray-100")
      }
    >
      {/* Thin accent */}
      <div className={`h-1 -mx-4 -mt-4 mb-3 ${ended ? "bg-gray-200" : "accent-live"}`} />
      {/* Top: LIVE / FULL TIME badge + sport */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {ended ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[9px] font-black text-gray-500 tracking-wide">
              FULL TIME
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg text-[9px] font-black text-red-500 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          )}
          {hot && (
            <span className="inline-flex items-center gap-0.5 rounded-lg bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white ring-1 ring-red-300/70 animate-hot-glow">
              <span className="animate-hot-flame">🔥</span> HOT
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-400 truncate max-w-[55%] text-right">{score?.league || label}</span>
      </div>

      {useTeamLayout ? (
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
              {ended ? (
                <span className="text-[8px] font-bold text-gray-400 mt-1">FT</span>
              ) : score.period === "HT" ? (
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
        <div className="text-center">
          <p className="text-[13px] font-bold text-gray-900">{titleText}</p>
          {score && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 rounded-lg">
              <span className="text-sm font-black text-white tabular-nums">{score.home}</span>
              <span className="text-[10px] text-gray-400 font-bold">-</span>
              <span className="text-sm font-black text-white tabular-nums">{score.away}</span>
            </div>
          )}
        </div>
      )}

      {/* WATCH / ENDED button */}
      <div className="mt-3">
        {ended ? (
          <span className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-[11px] font-black text-gray-400 tracking-wide cursor-not-allowed select-none">
            ENDED
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2 w-full py-2.5 btn-gradient rounded-xl text-[11px] font-black text-white tracking-wide">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            WATCH
          </span>
        )}
      </div>
    </div>
  );

  // Ended cards are not clickable — they're an honest "this finished" state.
  if (ended) return <div className="block select-none">{inner}</div>;
  return <Link href={href} className="block group">{inner}</Link>;
}
