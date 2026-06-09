"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getMatchStatus, getWatchHref, getPosterUrl, SPORT_LABELS } from "@/lib/api";

export default function HeroCard({ match }: { match: Match | null }) {
  if (!match) return null;

  const isLive = getMatchStatus(match) === "live";
  const href = getWatchHref(match);
  const label = SPORT_LABELS[match.category] || match.category;
  const hasTeams = match.teams?.home && match.teams?.away;
  const poster = match.poster ? getPosterUrl(match.poster) : null;

  return (
    <section className="relative mx-4 lg:mx-auto max-w-[1400px] lg:px-6 mt-4">
      <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: 260 }}>
        {/* Background */}
        {poster ? (
          <>
            <img
              src={poster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" />
            <div className="absolute inset-0 bg-[#0a0f1e]/30" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-[#0d1328] to-blue-900/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            {/* Decorative circles for no-poster hero */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl" />
          </>
        )}

        <div className="relative px-5 py-6 flex flex-col justify-end" style={{ minHeight: 260 }}>
          {/* Top badges */}
          <div className="flex items-center gap-2 mb-4">
            {isLive && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 rounded-lg w-fit">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-black text-white tracking-wider">LIVE</span>
              </div>
            )}
            <span className="text-[10px] font-bold text-gray-300 tracking-widest uppercase bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
              {label}
            </span>
          </div>

          {/* Teams */}
          {hasTeams ? (
            <div className="flex items-center gap-3 mb-5">
              <TeamBadge
                badge={match.teams!.home!.badge}
                name={match.teams!.home!.name}
                size="lg"
                sport={match.category}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] md:text-xl font-black text-white leading-tight truncate">
                  {match.teams!.home!.name.toUpperCase()}
                </p>
                <div className="flex items-center gap-2 my-1.5">
                  <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent" />
                  <span className="text-emerald-400 text-[11px] font-black tracking-widest">VS</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/50 to-transparent" />
                </div>
                <p className="text-[15px] md:text-xl font-black text-white leading-tight truncate">
                  {match.teams!.away!.name.toUpperCase()}
                </p>
              </div>
              <TeamBadge
                badge={match.teams!.away!.badge}
                name={match.teams!.away!.name}
                size="lg"
                sport={match.category}
              />
            </div>
          ) : (
            <h2 className="text-xl md:text-3xl font-black text-white leading-tight mb-5">
              {match.title}
            </h2>
          )}

          {/* CTA */}
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl transition-all text-[13px] w-full sm:w-auto shadow-lg shadow-emerald-500/25 tracking-wide"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            {isLive ? "WATCH NOW" : "VIEW SCHEDULE"}
          </Link>
        </div>
      </div>
    </section>
  );
}
