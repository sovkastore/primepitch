"use client";

import { useEffect, useRef, useState } from "react";
import { findScore, type ScoreInfo } from "@/lib/score-match";
import Link from "next/link";
import Logo from "@/components/Logo";

export interface ProMatch {
  match_id?: string;
  match_time: string | number;
  match_status: string;
  home_team_short?: string | null;
  away_team_short?: string | null;
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

// Show a live countdown once kickoff is within this window.
const COUNTDOWN_WINDOW_MS = 60 * 60_000;
// No football match can be over sooner than this after kickoff, so a
// "finished" score signal before it is bad data, not a real full time.
const FULL_TIME_EARLIEST_MS = 70 * 60_000;

function countdownLabel(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AltPage() {
  const [matches, setMatches] = useState<ProMatch[]>([]);
  // Latest list for the poll scheduler (no re-render needed to read it).
  const matchesRef = useRef<ProMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalNotice, setGlobalNotice] = useState("");
  const [scores, setScores] = useState<ScoreInfo[]>([]);
  const [now, setNow] = useState(0);

  // Ticks every second so the pre-kickoff countdown stays live.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let stopped = false;
    async function loadScores() {
      if (!stopped) setNow(Date.now());
      try {
        const res = await fetch("/api/alt-scores");
        const data = await res.json();
        if (!stopped) setScores(data.scores || []);
      } catch {
        /* scores are an enhancement — never break the page */
      }
    }
    loadScores();
    const interval = setInterval(loadScores, 60_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  // Matches + admin flags. Loaded on arrival, then re-fetched every 45 s while
  // the tab is visible, so a match that goes live (or gets its servers) shows
  // up without a page refresh — the same way the main site works.
  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [res, flagsRes] = await Promise.all([
          fetch(`/api/pro-matches?t=${Date.now()}`, { cache: "no-store" }),
          fetch(`/api/match-flags?t=${Date.now()}`, { cache: "no-store" })
        ]);
        if (stopped) return;
        
        const data = await res.json();
        const flagsData = await flagsRes.json();
        const visibleIds = new Set(flagsData.altVisible || []);
        const forceEndedIds = new Set(flagsData.forceEnded || []);
        
        if (flagsData.globalNotice) {
          setGlobalNotice(flagsData.globalNotice);
        }

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

        if (!stopped) { matchesRef.current = matchList; setMatches(matchList); }
      } catch (e) {
        console.error("Failed to load pro matches:", e);
      } finally {
        if (!stopped) setLoading(false);
      }
    }
    // Normally every 45 s; every 15 s while any match is within 8 minutes of
    // kickoff and not yet playable, so the moment the cron publishes its
    // stream the card flips without a refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const nearKickoff = () => {
      const now = Date.now();
      return matchesRef.current.some((m) => {
        const ko = Number(m.match_time) * 1000;
        const playable = (m.servers?.length ?? 0) > 0 && m.match_status !== "ended";
        return !playable && Math.abs(ko - now) < 8 * 60_000;
      });
    };
    const run = async () => {
      if (stopped) return;
      if (!document.hidden) await load();
      if (stopped) return;
      timer = setTimeout(run, nearKickoff() ? 15_000 : 45_000);
    };
    const onVisible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); run(); } };
    document.addEventListener("visibilitychange", onVisible);
    run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
            <p className="text-gray-600 text-xs mt-2">Loading alternative matches...</p>
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
      <div className="mb-6 flex items-center">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-semibold">Back</span>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
          Alternative <span className="text-emerald-600">Matches</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Backup streams for selected matches.</p>
      </div>

      {globalNotice && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-800 whitespace-pre-wrap">{globalNotice}</p>
          </div>
        </div>
      )}

      {sortedDates.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No alternative matches available right now.</div>
      ) : (
        <div className="space-y-12">
          {sortedDates.map(date => (
            <div key={date}>
              <h2 className="text-lg font-black text-gray-800 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">{date}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {matchesByDay[date].map((match, i) => {
                  // Reconstruct a stable ID for the watch page instead of relying on array index
                  const matchId = `alt-${match.home_team_name.replace(/\\s+/g, '')}-${match.away_team_name.replace(/\\s+/g, '')}-${match.match_time}`;
                  const score = findScore(scores, matchId, match.home_team_name, match.away_team_name, match.match_id);
                  // Ended = admin force-end, OR the score feed says full-time,
                  // OR the clock says the match must be over (kickoff + 130min)
                  const endedByClock =
                    now > 0 &&
                    Number(match.match_time) > 0 &&
                    now > Number(match.match_time) * 1000 + 130 * 60_000;
                  // A score feed can wrongly report a fixture finished before it
                  // has even kicked off — only trust that flag once the match
                  // could plausibly be over.
                  const couldBeOver =
                    now > 0 &&
                    Number(match.match_time) > 0 &&
                    now > Number(match.match_time) * 1000 + FULL_TIME_EARLIEST_MS;
                  const isEnded =
                    match.match_status === "ended" || (!!score?.ended && couldBeOver) || endedByClock;
                  // Mock matches (from BSD) don't have servers yet, so they are not clickable
                  const isMock = match.servers && match.servers.length === 0;
                  const isPlayable = !isEnded && !isMock;
                  const hasScore = score != null && score.homeScore != null && score.awayScore != null;
                  const CardWrapper = isPlayable ? Link : "div";
                  const wrapperProps = isPlayable ? { href: `/alt/watch?id=${matchId}`, className: "block group" } : { className: "block group opacity-75 cursor-default" };
                  
                  return (
                    <CardWrapper 
                      key={i} 
                      {...wrapperProps as any}
                    >
                      <div className="relative rounded-2xl border border-gray-200 hover:border-emerald-500/30 overflow-hidden transition-all bg-white shadow-sm hover:shadow-md">
                        <div className="relative p-5">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-semibold text-gray-500 truncate max-w-[70%]">{match.league_name}</span>
                            {isEnded ? (
                              <span className="text-[11px] text-gray-600 bg-gray-100 px-3 py-1 rounded-full font-medium border border-gray-200">Ended</span>
                            ) : match.match_status === "live" ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                                LIVE
                                {score?.period === "HT" ? " · HT" : score?.minute ? ` · ${score.minute}'` : ""}
                              </span>
                            ) : now > 0 && Number(match.match_time) * 1000 < now ? (
                              now - Number(match.match_time) * 1000 < 5 * 60_000 ? (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Starting · stream on the way
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Finding stream…
                                </span>
                              )
                            ) : now > 0 && Number(match.match_time) * 1000 - now <= COUNTDOWN_WINDOW_MS ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                                Starts in {countdownLabel(Number(match.match_time) * 1000 - now)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-600 bg-gray-100 px-3 py-1 rounded-full font-medium border border-gray-200">Upcoming</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mb-4">
                            {/* Home Team */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center p-1.5 mb-2 border border-gray-200">
                                {match.home_team_logo && match.home_team_logo.length > 5 ? (
                                  <img src={match.home_team_logo} alt={match.home_team_name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <span className="text-lg">⚽</span>
                                )}
                              </div>
                              <p className="text-[13px] font-bold text-gray-900 text-center leading-tight line-clamp-2 min-h-[32px]">{match.home_team_short || match.home_team_name}</p>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center px-2">
                              {hasScore ? (
                                <p className="text-xl font-black text-gray-900 whitespace-nowrap">
                                  {score.homeScore} <span className="text-gray-300">-</span> {score.awayScore}
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-400 font-bold uppercase">VS</p>
                              )}
                            </div>
                            
                            {/* Away Team */}
                            <div className="flex-1 flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center p-1.5 mb-2 border border-gray-200">
                                {match.away_team_logo && match.away_team_logo.length > 5 ? (
                                  <img src={match.away_team_logo} alt={match.away_team_name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <span className="text-lg">⚽</span>
                                )}
                              </div>
                              <p className="text-[13px] font-bold text-gray-900 text-center leading-tight line-clamp-2 min-h-[32px]">{match.away_team_short || match.away_team_name}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <span className="text-[11px] text-gray-600 flex items-center gap-1.5">
                              {new Date(Number(match.match_time) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              {(match.servers?.length ?? 0) > 0 && (
                                <span className="text-[10px] text-gray-400">
                                  · {match.servers.length} server{match.servers.length === 1 ? "" : "s"}
                                </span>
                              )}
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
