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
              <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
                {/* Date + Time */}
                <div className="shrink-0 w-20 text-center">
                  <p className="text-[11px] font-bold text-emerald-500">{timeStr}</p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
                </div>

                {/* Separator */}
                <div className="w-px h-8 bg-gray-200 shrink-0" />

                {/* Match info */}
                {hasTeams ? (
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <TeamBadge
                      badge={match.teams!.home!.badge}
                      name={match.teams!.home!.name}
                      size="sm"
                      sport={match.category}
                    />
                    <span className="text-[12px] font-bold text-gray-800 truncate group-hover:text-gray-900 transition-colors">
                      {match.teams!.home!.name}
                    </span>
                    <span className="text-[9px] text-gray-400 font-extrabold shrink-0">VS</span>
                    <span className="text-[12px] font-bold text-gray-800 truncate text-right group-hover:text-gray-900 transition-colors">
                      {match.teams!.away!.name}
                    </span>
                    <TeamBadge
                      badge={match.teams!.away!.badge}
                      name={match.teams!.away!.name}
                      size="sm"
                      sport={match.category}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-gray-800 truncate group-hover:text-gray-900 transition-colors">
                      {match.title}
                    </p>
                  </div>
                )}

                {/* Sport pill */}
                <span className="text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">
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
