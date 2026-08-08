"use client";

import { useEffect, useMemo, useState } from "react";
import SportsNav from "@/components/SportsNav";
import LeagueNav from "@/components/LeagueNav";
import PromoBanner from "@/components/PromoBanner";
import LiveNow from "@/components/LiveNow";
import TodayMatches from "@/components/Upcoming";
import Logo from "@/components/Logo";
import { Match, getLiveMatches, getMatchFlags, getMatchKey, getMatchStatus, dedupeMatches, suppressPrematureLive, isFlagged, normTeamKey } from "@/lib/api";
import { visibleInterval } from "@/lib/poll";
import { readPageCache, writePageCache } from "@/lib/page-cache";
import DisclaimerFooter from "@/components/DisclaimerFooter";

const SPORTS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
];

function filterBySport(matches: Match[], sport: string | null): Match[] {
  if (!sport) return matches;
  return matches.filter((m) => m.category === sport);
}

export default function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hiddenTitles, setHiddenTitles] = useState<Set<string>>(new Set());
  const [hotIds, setHotIds] = useState<Set<string>>(new Set());
  const [popularIds, setPopularIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState<string | null>("football");
  const [showPopular, setShowPopular] = useState(true);

  // Restore the last-selected sport so returning to home keeps the tab the user
  // was on (instead of snapping back to Football). Runs after mount → no hydration
  // mismatch, and the page is still in its loading state so there's no visible flash.
  useEffect(() => {
    const saved = sessionStorage.getItem("pp_sport");
    if (saved) setActiveSport(saved);
  }, []);

  function selectSport(s: string | null) {
    setActiveSport(s);
    if (s) sessionStorage.setItem("pp_sport", s);
  }

  // Cache-first: returning to home (e.g. from World Cup) paints instantly from
  // the last data instead of showing the loading screen, then refreshes quietly.
  useEffect(() => {
    const cachedMatches = readPageCache<Match[]>("pp_home_matches");
    if (cachedMatches && cachedMatches.length > 0) {
      setMatches(cachedMatches);
      setLoading(false);
    }
    const cachedLive = readPageCache<Match[]>("pp_live_list");
    if (cachedLive) setLiveMatches(cachedLive);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const results = await Promise.all(
          SPORTS.map(async (sport) => {
            try {
              const res = await fetch(`/api/matches?sport=${sport}`, { signal: AbortSignal.timeout(12000) });
              const data = await res.json();
              return data;
            } catch {
              return [];
            }
          })
        );
        const merged = dedupeMatches(results.flat());
        setMatches(merged);
        writePageCache("pp_home_matches", merged);
      } catch (e) {
        console.error("Failed to load matches:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Live = matches that actually have a playable stream. Refreshed while visible.
  useEffect(() => {
    const loadLive = () => {
      getLiveMatches().then((m) => { setLiveMatches(m); writePageCache("pp_live_list", m); }).catch(() => {});
    };
    return visibleInterval(loadLive, 90_000);
  }, []);



  // Hidden matches (admin) — keep them out of the upcoming list. Hot fixtures
  // (admin) get the red HOT badge. Popular fixtures (admin) appear in Popular tab.
  useEffect(() => {
    getMatchFlags()
      .then((f) => {
        setHiddenIds(new Set(f.hidden));
        setHiddenTitles(new Set(f.hiddenTitles));
        setHotIds(new Set(f.hot));
        setPopularIds(new Set(f.popular));
      })
      .catch(() => {});
  }, []);

  // Map of full match objects from the upstream feeds to enrich live streams with logos, badges, and true popularity.
  // IMPORTANT: This useMemo MUST be called before any early return to satisfy React's Rules of Hooks.
  const matchLookup = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of matches) {
      if (m.id) map.set(m.id, m);
      for (const s of m.sources ?? []) {
        if (s?.id) map.set(s.id, m);
        if (s?.source && s?.id) map.set(`${s.source}--${s.id}`, m);
      }
      const tk = normTeamKey(m);
      if (tk && tk.includes("|")) map.set(tk, m);
    }
    return map;
  }, [matches]);

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
            <p className="text-gray-400 text-xs mt-2">Loading live matches...</p>
          </div>
        </div>
      </div>
    );
  }

  // Filter out admin-hidden matches.
  const mergedLive = liveMatches.filter((m) => !isFlagged(m, hiddenIds) && !hiddenTitles.has(normTeamKey(m)));

  // Automatically move upcoming matches to the Live section if their kickoff time has arrived (<= 0)
  // and they haven't ended (> -120 mins). This gives them a WATCH button instead of sitting in
  // Upcoming saying "STARTING...", allowing users to go to the watch page and see the "Starting soon" banner.
  const newlyLive = matches.filter((m) => {
    if (isFlagged(m, hiddenIds) || hiddenTitles.has(normTeamKey(m))) return false;
    const diffMin = (m.date - Date.now()) / 1000 / 60;
    return diffMin <= 0 && diffMin > -120;
  });

  const isPopularMatch = (m?: Match | null) => Boolean(m && (m.popular || isFlagged(m, popularIds)));

  const combinedLive = dedupeMatches([...(mergedLive || []), ...(newlyLive || [])]).map((liveM) => {
    if (!liveM) return liveM;
    const tk = normTeamKey(liveM);
    const upstream = (tk && matchLookup.get(tk)) || (liveM.id && matchLookup.get(liveM.id));
    if (upstream) {
      return {
        ...upstream,
        ...liveM,
        teams: (upstream.teams?.home?.name && upstream.teams) ? upstream.teams : (liveM.teams || {}),
        poster: upstream.poster || liveM.poster,
        popular: Boolean(upstream.popular || liveM.popular || isFlagged(upstream, popularIds) || isFlagged(liveM, popularIds)),
        hot: Boolean(upstream.hot || liveM.hot || isFlagged(upstream, hotIds) || isFlagged(liveM, hotIds)),
      };
    }
    return {
      ...liveM,
      popular: isPopularMatch(liveM),
      hot: Boolean(liveM.hot || isFlagged(liveM, hotIds)),
    };
  }).filter(Boolean);

  // The matches actually shown as LIVE (after the premature-live guard). Build a
  // team-identity set from these so the same fixture can't also sit in Upcoming,
  // even when the live stream carries a different id or name. Using the shown
  // (post-suppression) list — not mergedLive — means a fixture whose early stream
  // got suppressed still stays in Upcoming rather than vanishing from both.
  const liveForSportBase = filterBySport(suppressPrematureLive(combinedLive, matches), activeSport);
  const liveForSport = liveForSportBase.filter((m) => {
    if (activeSport === "football" && showPopular && !isPopularMatch(m)) return false;
    return true;
  });
  const liveTeamKeys = new Set(liveForSport.map(normTeamKey).filter((k) => k.includes("|")));

  const filtered = filterBySport(matches, activeSport)
    .filter((m) => {
      if (isFlagged(m, hiddenIds) || hiddenTitles.has(normTeamKey(m))) return false;
      const tk = normTeamKey(m);
      if (tk.includes("|") && liveTeamKeys.has(tk)) return false; // already live
      if (activeSport === "football" && showPopular && !isPopularMatch(m)) return false;
      return true;
    })
    .map((m) => {
      let res = m;
      if (isFlagged(m, hotIds)) res = { ...res, hot: true };
      if (isFlagged(m, popularIds)) res = { ...res, popular: true };
      return res;
    });
  // Don't also list a match under Upcoming if it's already shown as Live.
  const liveKeys = new Set(combinedLive.map(getMatchKey));

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-10">
        <SportsNav activeSport={activeSport} onSelect={selectSport} />
        {activeSport === "football" && <LeagueNav active="all" />}
        {activeSport === "football" && (
          <div className="max-w-[1400px] mx-auto px-4 lg:px-6 mb-4 flex gap-2">
            <a 
              href="#popular"
              onClick={(e) => {
                e.preventDefault();
                setShowPopular(true);
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer select-none inline-block ${showPopular ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
            >
              Popular
            </a>
            <a 
              href="#all-matches"
              onClick={(e) => {
                e.preventDefault();
                setShowPopular(false);
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer select-none inline-block ${!showPopular ? 'bg-emerald-600 text-white shadow-md' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
            >
              All Matches
            </a>
          </div>
        )}
        <PromoBanner />
        <LiveNow matches={liveForSport} />
        <TodayMatches matches={filtered} excludeKeys={liveKeys} />
      </div>
      <DisclaimerFooter />
    </div>
  );
}

