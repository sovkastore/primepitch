"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export interface ProMatch {
  match_time: string | number;
  match_status: string;
  home_team_name: string;
  home_team_logo: string;
  homeTeamScore: string | number;
  away_team_name: string;
  away_team_logo: string;
  awayTeamScore: string | number;
  league_name: string;
  league_logo: string;
  servers: any[];
}

export default function AltPage() {
  const [matches, setMatches] = useState<ProMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [res, flagsRes] = await Promise.all([
          fetch("/api/pro-matches"),
          fetch(`/api/match-flags?t=${Date.now()}`)
        ]);
        
        const data = await res.json();
        const flagsData = await flagsRes.json();
        const visibleIds = new Set(flagsData.altVisible || []);
        const forceEndedIds = new Set(flagsData.forceEnded || []);

        let matchList: ProMatch[] = [];
        if (Array.isArray(data)) matchList = data;
        else if (data && Array.isArray(data.matches)) matchList = data.matches;
        else if (data && Array.isArray(data.data)) matchList = data.data;
        else if (data && Array.isArray(data.results)) matchList = data.results;
        
        // Filter ONLY matches that are whitelisted
        matchList = matchList.filter((match) => {
          const matchId = `alt-${match.home_team_name.replace(/\s+/g, '')}-${match.away_team_name.replace(/\s+/g, '')}-${match.match_time}`;
          if (forceEndedIds.has(matchId)) {
            match.match_status = "ended";
          }
          return visibleIds.has(matchId);
        });

        // Add mock fixtures from BSD API
        if (Array.isArray(flagsData.mockFixtures)) {
          for (const mock of flagsData.mockFixtures) {
            matchList.push({
              ...mock,
              match_status: "upcoming",
              homeTeamScore: "",
              awayTeamScore: "",
              servers: []
            });
          }
        }

        // Sort all matches chronologically by match_time
        matchList.sort((a, b) => Number(a.match_time) - Number(b.match_time));

        // Group matches by day
        const matchesByDay = matchList.reduce((acc, match) => {
          const date = new Date(Number(match.match_time) * 1000).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
          if (!acc[date]) acc[date] = [];
          acc[date].push(match);
          return acc;
        }, {} as Record<string, ProMatch[]>);

        setMatches(matchList);
      } catch (e) {
        console.error("Failed to load pro matches:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <Logo size="sm" />
            <p className="text-gray-400 text-xs mt-2">Loading alternative matches...</p>
          </div>
        </div>
      </div>
    );
  }

  // Group matches by day again just in case (already did in useEffect but we need state or just compute here)
  const matchesByDay = matches.reduce((acc, match) => {
    const date = new Date(Number(match.match_time) * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(match);
    return acc;
  }, {} as Record<string, ProMatch[]>);

  const sortedDates = Object.keys(matchesByDay).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          Alternative <span className="text-emerald-500">Matches</span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">Backup streams for selected matches.</p>
      </div>

      {sortedDates.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No alternative matches available right now.</div>
      ) : (
        <div className="space-y-12">
          {sortedDates.map(date => (
            <div key={date}>
              <h2 className="text-lg font-black text-gray-300 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">{date}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {matchesByDay[date].map((match, i) => {
                  // Reconstruct index based on original matches array for the watch page routing
                  const originalIndex = matches.findIndex(m => m === match);
                  const isEnded = match.match_status === "ended";
                  // Mock matches (from BSD) don't have servers yet, so they are not clickable
                  const isMock = match.servers && match.servers.length === 0;
                  const isPlayable = !isEnded && !isMock;
                  const CardWrapper = isPlayable ? Link : "div";
                  const wrapperProps = isPlayable ? { href: `/alt/watch?idx=${originalIndex}`, className: "block group" } : { className: "block group opacity-75 cursor-default" };
                  
                  return (
                    <CardWrapper 
                      key={i} 
                      {...wrapperProps as any}
                    >
                      <div className="relative rounded-2xl border border-blue-300/[0.05] hover:border-emerald-500/30 overflow-hidden transition-all bg-gradient-to-br from-white/[0.03] via-[#111a2e] to-[#111a2e]">
                        <div className="relative p-5">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-semibold text-gray-400 truncate max-w-[70%]">{match.league_name}</span>
                            {match.match_status === "live" ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE
                              </span>
                            ) : match.match_status === "ended" ? (
                              <span className="text-[11px] text-gray-400 bg-white/[0.04] px-3 py-1 rounded-full font-medium">Ended</span>
                            ) : (
                              <span className="text-[11px] text-gray-500 bg-white/[0.04] px-3 py-1 rounded-full font-medium">Upcoming</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mb-4">
                            {/* Home Team */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center p-1.5 mb-2 border border-white/5">
                                {match.home_team_logo && match.home_team_logo.length > 5 ? (
                                  <img src={match.home_team_logo} alt={match.home_team_name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <span className="text-lg">⚽</span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-white text-center line-clamp-1">{match.home_team_name}</p>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center px-2">
                              {match.match_status === "live" ? (
                                <p className="text-lg font-black text-emerald-400">{match.homeTeamScore} - {match.awayTeamScore}</p>
                              ) : (
                                <p className="text-[10px] text-emerald-400 font-bold">VS</p>
                              )}
                            </div>
                            
                            {/* Away Team */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center p-1.5 mb-2 border border-white/5">
                                {match.away_team_logo && match.away_team_logo.length > 5 ? (
                                  <img src={match.away_team_logo} alt={match.away_team_name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <span className="text-lg">⚽</span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-white text-center line-clamp-1">{match.away_team_name}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-blue-300/[0.04]">
                            <span className="text-[11px] text-gray-600">
                              {new Date(Number(match.match_time) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            {isPlayable && (
                              <span className="text-[11px] text-emerald-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Watch Stream
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardWrapper>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
