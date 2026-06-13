"use client";

import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { Match, getMatchStatus, getWatchHref, getPosterUrl, SPORT_LABELS, showVersus } from "@/lib/api";

interface PopularMatchesProps {
  matches: Match[];
  activeSport: string | null;
}

export default function PopularMatches({ matches, activeSport }: PopularMatchesProps) {
  // Only show Popular for football (or "View All" mode showing football popular)
  if (activeSport !== "football" && activeSport !== null) return null;

  const popular = matches
    .filter((m) => m.popular && m.category === "football" && getMatchStatus(m) !== "ended");
  if (popular.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5">
      <div className="mb-4">
        <h2 className="text-[13px] font-extrabold text-white tracking-wider uppercase">Popular</h2>
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {popular.map((match, i) => {
          const isLive = getMatchStatus(match) === "live";
          const href = getWatchHref(match);
          const hasTeams = showVersus(match);
          const poster = match.poster ? getPosterUrl(match.poster) : null;
          const label = SPORT_LABELS[match.category] || match.category;

          return (
            <Link key={`pop-${match.id}-${i}`} href={href} className="shrink-0 group">
              <div className="relative w-[200px] h-[180px] rounded-2xl overflow-hidden border border-white/[0.04] hover:border-emerald-500/25 transition-all">
                {/* Background */}
                {poster ? (
                  <>
                    <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-[#111a2e] to-blue-900/20" />
                )}

                {/* LIVE badge */}
                {isLive && (
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 bg-red-600 rounded-lg text-[8px] font-black text-white tracking-wide">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                )}

                {/* Sport pill */}
                <div className="absolute top-3 right-3">
                  <span className="text-[8px] font-bold text-gray-300 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg">
                    {label}
                  </span>
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3.5">
                  {hasTeams ? (
                    <>
                      <div className="flex items-center justify-center gap-3 mb-2.5">
                        <TeamBadge
                          badge={match.teams!.home!.badge}
                          name={match.teams!.home!.name}
                          size="sm"
                          sport={match.category}
                        />
                        <span className="text-[10px] text-emerald-400 font-black tracking-wider">VS</span>
                        <TeamBadge
                          badge={match.teams!.away!.badge}
                          name={match.teams!.away!.name}
                          size="sm"
                          sport={match.category}
                        />
                      </div>
                      <p className="text-[11px] font-bold text-white text-center truncate">
                        {match.teams!.home!.name}
                      </p>
                      <p className="text-[10px] text-gray-400 text-center mt-0.5">
                        vs {match.teams!.away!.name}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] font-bold text-white text-center truncate">
                      {match.title}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
