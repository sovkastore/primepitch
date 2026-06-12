"use client";

import { useEffect, useState } from "react";
import SportsNav from "@/components/SportsNav";
import LiveNow from "@/components/LiveNow";
import TodayMatches from "@/components/Upcoming";
import Logo from "@/components/Logo";
import { Match, getLiveMatches, getMatchFlags, getMatchKey, dedupeMatches } from "@/lib/api";
import { classifyFight } from "@/lib/fight-categories";
import { visibleInterval } from "@/lib/poll";

const SPORTS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
];

const FIGHT_SUB_MAP: Record<string, string> = {
  ufc: "mma",
  wwe: "wrestling",
  boxing: "boxing",
};

function filterBySport(matches: Match[], sport: string | null): Match[] {
  if (!sport) return matches;
  const fightSub = FIGHT_SUB_MAP[sport];
  if (fightSub) {
    return matches.filter(
      (m) => m.category === "fight" && classifyFight(m.title) === fightSub
    );
  }
  return matches.filter((m) => m.category === sport);
}

export default function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState<string | null>("football");

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

  useEffect(() => {
    async function load() {
      try {
        const results = await Promise.all(
          SPORTS.map(async (sport) => {
            try {
              const res = await fetch(`https://streamed.pk/api/matches/${sport}`);
              const data = await res.json();
              return data.map((m: Match) => ({ ...m, category: sport }));
            } catch {
              return [];
            }
          })
        );
        setMatches(dedupeMatches(results.flat()));
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
    const loadLive = () => { getLiveMatches().then(setLiveMatches).catch(() => {}); };
    return visibleInterval(loadLive, 90_000);
  }, []);

  // Hidden matches (admin) — keep them out of the upcoming list.
  useEffect(() => {
    getMatchFlags().then((f) => setHiddenIds(new Set(f.hidden))).catch(() => {});
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
            <p className="text-gray-400 text-xs mt-2">Loading live matches...</p>
          </div>
        </div>
      </div>
    );
  }

  const filtered = filterBySport(matches, activeSport).filter((m) => !hiddenIds.has(getMatchKey(m)));
  const liveForSport = filterBySport(liveMatches, activeSport);
  // Don't also list a match under Upcoming if it's already shown as Live.
  const liveKeys = new Set(liveMatches.map(getMatchKey));

  return (
    <div className="pb-20 md:pb-0">
      <SportsNav activeSport={activeSport} onSelect={selectSport} />
      <LiveNow matches={liveForSport} />
      <TodayMatches matches={filtered} excludeKeys={liveKeys} />
    </div>
  );
}
