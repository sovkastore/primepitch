"use client";

import { useEffect, useState } from "react";
import SportsNav from "@/components/SportsNav";
import LiveNow from "@/components/LiveNow";
import TodayMatches from "@/components/Upcoming";
import Logo from "@/components/Logo";
import PreRollGate from "@/components/PreRollGate";
import { Match, getLiveMatches, getMatchFlags, getMatchKey, getMatchStatus, dedupeMatches, suppressPrematureLive } from "@/lib/api";
import { classifyFight } from "@/lib/fight-categories";
import { visibleInterval } from "@/lib/poll";
import { readPageCache, writePageCache } from "@/lib/page-cache";

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
  // Just-kicked-off matches that resolve to a stream but aren't in streamed.pk's
  // curated live list yet — bridged in so they appear LIVE instantly (no gap).
  const [bridged, setBridged] = useState<Match[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hotIds, setHotIds] = useState<Set<string>>(new Set());
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
              const res = await fetch(`https://streamed.pk/api/matches/${sport}`);
              const data = await res.json();
              return data.map((m: Match) => ({ ...m, category: sport }));
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

  // Seamless countdown→live: as soon as a match kicks off, resolve its stream
  // directly and show it LIVE — instead of waiting for streamed.pk's live feed
  // to catch up (which left a gap where the match vanished). Fires immediately
  // at kickoff and re-checks every 20s while any match is in the gap. Costs
  // nothing when there are no just-kicked-off matches.
  useEffect(() => {
    if (matches.length === 0) return;
    let cancelled = false;
    const liveKeySet = new Set(liveMatches.map(getMatchKey));
    const candidatesNow = () =>
      matches.filter(
        (m) =>
          getMatchStatus(m) === "live" &&
          !liveKeySet.has(getMatchKey(m)) &&
          !hiddenIds.has(getMatchKey(m))
      );
    const run = () => {
      const cands = candidatesNow();
      if (cands.length === 0) {
        if (!cancelled) setBridged((prev) => (prev.length ? [] : prev));
        return;
      }
      fetch("/api/live-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: cands }),
      })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && Array.isArray(d.matches)) setBridged(d.matches); })
        .catch(() => {});
    };
    run(); // immediate
    const iv = setInterval(run, 20_000);
    // Fire exactly at the next kickoff so the transition feels instant.
    const now = Date.now();
    const nextKick = matches.map((m) => m.date).filter((d) => d > now).sort((a, b) => a - b)[0];
    let to: ReturnType<typeof setTimeout> | undefined;
    if (nextKick && nextKick - now < 15 * 60_000) to = setTimeout(run, nextKick - now + 2000);
    return () => { cancelled = true; clearInterval(iv); if (to) clearTimeout(to); };
  }, [matches, liveMatches, hiddenIds]);

  // Hidden matches (admin) — keep them out of the upcoming list. Hot fixtures
  // (admin) get the red HOT badge.
  useEffect(() => {
    getMatchFlags()
      .then((f) => {
        setHiddenIds(new Set(f.hidden));
        setHotIds(new Set(f.hot));
      })
      .catch(() => {});
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

  // Curated live ∪ bridged (just-kicked-off, stream resolved), deduped.
  const mergedLiveMap = new Map<string, Match>();
  for (const m of liveMatches) mergedLiveMap.set(getMatchKey(m), m);
  for (const m of bridged) if (!mergedLiveMap.has(getMatchKey(m))) mergedLiveMap.set(getMatchKey(m), m);
  const mergedLive = Array.from(mergedLiveMap.values());

  const filtered = filterBySport(matches, activeSport)
    .filter((m) => !hiddenIds.has(getMatchKey(m)))
    .map((m) => (hotIds.has(getMatchKey(m)) ? { ...m, hot: true } : m));
  const liveForSport = filterBySport(suppressPrematureLive(mergedLive, matches), activeSport);
  // Don't also list a match under Upcoming if it's already shown as Live.
  const liveKeys = new Set(mergedLive.map(getMatchKey));

  return (
    <div className="pb-20 md:pb-0">
      <PreRollGate page="home" />
      <SportsNav activeSport={activeSport} onSelect={selectSport} />
      <LiveNow matches={liveForSport} />
      <TodayMatches matches={filtered} excludeKeys={liveKeys} />
    </div>
  );
}
