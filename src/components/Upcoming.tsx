"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getMatchStatus, getWatchHref, SPORT_LABELS } from "@/lib/api";

export default function TodayMatches({ matches }: { matches: Match[] }) {
  const upcoming = matches
    .filter((m) => getMatchStatus(m) === "upcoming")
    .sort((a, b) => a.date - b.date)
    .slice(0, 15);

  if (upcoming.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
      <div className="mb-4">
        <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase">Upcoming</h2>
      </div>

      <div className="space-y-2">
        {upcoming.map((match, i) => {
          const d = new Date(match.date);
          const dateStr = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
          const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          const href = getWatchHref(match);
          const hasTeams = match.teams?.home && match.teams?.away;
          const label = SPORT_LABELS[match.category] || match.category;

          return (
            <Link key={`today-${match.id}-${i}`} href={href} className="group block">
              <div className="flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
                {/* Date + Time */}
                <div className="shrink-0 w-14 sm:w-20 text-center">
                  <p className="text-[10px] sm:text-[11px] font-bold text-emerald-500">{timeStr}</p>
                  <p className="text-[8px] sm:text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
                </div>

                {/* Separator */}
                <div className="w-px h-8 bg-gray-200 shrink-0" />

                {/* Match info */}
                {hasTeams ? (
                  <div className="flex-1 min-w-0 flex items-center gap-1 sm:gap-2">
                    <img
                      src={`https://streamed.pk/api/images/proxy/${match.teams!.home!.badge}.webp`}
                      alt=""
                      className="w-5 h-5 sm:w-7 sm:h-7 object-contain shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-[11px] sm:text-[12px] font-bold text-gray-800 truncate">
                      {match.teams!.home!.name}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-gray-400 font-extrabold shrink-0">VS</span>
                    <span className="text-[11px] sm:text-[12px] font-bold text-gray-800 truncate text-right">
                      {match.teams!.away!.name}
                    </span>
                    <img
                      src={`https://streamed.pk/api/images/proxy/${match.teams!.away!.badge}.webp`}
                      alt=""
                      className="w-5 h-5 sm:w-7 sm:h-7 object-contain shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] sm:text-[12px] font-bold text-gray-800 truncate">
                      {match.title}
                    </p>
                  </div>
                )}

                {/* Sport pill — hidden on small mobile */}
                <span className="hidden sm:inline text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">
                  {label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
