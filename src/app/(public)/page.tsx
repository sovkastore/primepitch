"use client";

import { useEffect, useState } from "react";
import SportsNav from "@/components/SportsNav";
import LiveNow from "@/components/LiveNow";
import TodayMatches from "@/components/Upcoming";
import { Match, getMatchStatus } from "@/lib/api";
import { classifyFight } from "@/lib/fight-categories";

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
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState<string | null>("football");

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
        setMatches(results.flat());
      } catch (e) {
        console.error("Failed to load matches:", e);
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
            <p className="text-gray-900 text-sm font-bold">PRIME<span className="text-gradient">PITCH</span></p>
            <p className="text-gray-400 text-xs mt-1">Loading live matches...</p>
          </div>
        </div>
      </div>
    );
  }

  const filtered = filterBySport(matches, activeSport);
  const liveMatches = filtered.filter((m) => getMatchStatus(m) === "live");

  return (
    <div className="pb-20 md:pb-0">
      <SportsNav activeSport={activeSport} onSelect={setActiveSport} />
      <LiveNow matches={liveMatches} />
      <TodayMatches matches={filtered} />
    </div>
  );
}
