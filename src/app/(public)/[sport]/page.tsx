"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LiveMatchRow from "@/components/LiveMatchRow";
import UpcomingRow from "@/components/UpcomingRow";
import { Match, getMatchStatus, getLiveMatches, getMatchFlags, getMatchKey, dedupeMatches, suppressPrematureLive, isFlagged, normTeamKey, SPORT_ICONS, SPORT_LABELS } from "@/lib/api";
import { classifyFight, FIGHT_SUB_LABELS, FIGHT_SUB_ICONS, FightSubcategory } from "@/lib/fight-categories";
import { visibleInterval } from "@/lib/poll";
import { useBatchScores } from "@/lib/use-batch-scores";

const FIGHT_SUB_MAP: Record<string, string> = {
  ufc: "mma",
  wwe: "wrestling",
  boxing: "boxing",
};

export default function SportPage() {
  const params = useParams();
  const sport = params.sport as string;
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hiddenTitles, setHiddenTitles] = useState<Set<string>>(new Set());
  const [hotIds, setHotIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const icon = SPORT_ICONS[sport] || "⚽";
  const label = SPORT_LABELS[sport] || sport;
  const fightSub = FIGHT_SUB_MAP[sport];
  const apiSport = fightSub ? "fight" : sport;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/matches?sport=${apiSport}`, { signal: AbortSignal.timeout(12000) });
        let data: Match[] = await res.json();
        data = data.map((m) => ({ ...m, category: apiSport }));
        if (fightSub) {
          data = data.filter((m) => classifyFight(m.title) === fightSub);
        }
        setMatches(dedupeMatches(data));
      } catch (e) {
        console.error("Failed to load matches:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sport, apiSport, fightSub]);

  // Live = matches that actually have a playable stream. Refreshed while visible.
  useEffect(() => {
    const loadLive = () => { getLiveMatches().then(setLiveMatches).catch(() => {}); };
    return visibleInterval(loadLive, 90_000);
  }, []);

  // Hidden matches (admin) — keep them out of the upcoming list.
  useEffect(() => {
    getMatchFlags()
      .then((f) => {
        setHiddenIds(new Set(f.hidden));
        setHiddenTitles(new Set(f.hiddenTitles));
        setHotIds(new Set(f.hot));
      })
      .catch(() => {});
  }, []);

  // Combine official streamable matches with scheduled matches that just hit kickoff time
  const mathematicallyLive = matches.filter(m => getMatchStatus(m) === "live");
  const combinedLive = dedupeMatches([...liveMatches, ...mathematicallyLive]);

  // Only the streamable live matches that belong to this page.
  const live = suppressPrematureLive(
    combinedLive.filter((m) => {
      if (m.category !== apiSport) return false;
      if (fightSub) return classifyFight(m.title) === fightSub;
      return true;
    }),
    matches
  ).filter((m) => !isFlagged(m, hiddenIds) && !hiddenTitles.has(normTeamKey(m)));

  // Keys already shown as live — so a curated/forced-live match isn't ALSO listed under Upcoming.
  const liveKeys = new Set(liveMatches.map(getMatchKey));
  // Team-identity set from the matches actually shown live, so the same fixture
  // can't appear in both lists even when the live stream has a different id/name.
  const liveTeamKeys = new Set(live.map(normTeamKey).filter((k) => k.includes("|")));
  // ONE batched score request for every live card on this page.
  const scores = useBatchScores(live);
  const isUpcomingRow = (m: Match) => {
    if (getMatchStatus(m) !== "upcoming") return false;
    if (isFlagged(m, hiddenIds) || hiddenTitles.has(normTeamKey(m))) return false;
    if (liveKeys.has(getMatchKey(m))) return false;
    const tk = normTeamKey(m);
    if (tk.includes("|") && liveTeamKeys.has(tk)) return false; // already live
    return true;
  };
  // Stamp the admin "HOT" flag onto a fixture so UpcomingRow can show the badge.
  const stampHot = (m: Match): Match => (isFlagged(m, hotIds) ? { ...m, hot: true } : m);

  const upcoming = matches.filter(isUpcomingRow).map(stampHot).sort((a, b) => a.date - b.date);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading {label}...</p>
        </div>
      </div>
    );
  }

  // Fight sport split
  if (sport === "fight") {
    const grouped: Record<FightSubcategory, { live: Match[]; upcoming: Match[] }> = {
      wrestling: { live: [], upcoming: [] },
      mma: { live: [], upcoming: [] },
      boxing: { live: [], upcoming: [] },
    };

    for (const m of live) {
      grouped[classifyFight(m.title)].live.push(m);
    }
    for (const m of matches) {
      if (isUpcomingRow(m)) grouped[classifyFight(m.title)].upcoming.push(stampHot(m));
    }

    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8 pb-24 md:pb-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl">
            {icon}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Fight Sports</h1>
            <p className="text-sm text-gray-500">
              {live.length > 0 ? `${live.length} live now` : ""}
              {live.length > 0 && upcoming.length > 0 ? " • " : ""}
              {upcoming.length > 0 ? `${upcoming.length} upcoming` : ""}
              {live.length === 0 && upcoming.length === 0 ? "No matches scheduled" : ""}
            </p>
          </div>
        </div>

        {(["wrestling", "mma", "boxing"] as FightSubcategory[]).map((sub) => {
          const g = grouped[sub];
          if (g.live.length === 0 && g.upcoming.length === 0) return null;

          return (
            <section key={sub} className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{FIGHT_SUB_ICONS[sub]}</span>
                <h2 className="text-lg font-bold text-gray-900">{FIGHT_SUB_LABELS[sub]}</h2>
                {g.live.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500 ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {g.live.length} LIVE
                  </span>
                )}
              </div>
              {g.live.length > 0 && (
                <div className="space-y-3 mb-4">
                  {g.live.map((m) => (
                    <LiveMatchRow key={`${sub}-live-${getMatchKey(m)}`} match={m} score={scores[getMatchKey(m)] || null} />
                  ))}
                </div>
              )}
              {g.upcoming.length > 0 && (
                <div className="space-y-2">
                  {g.upcoming.sort((a, b) => a.date - b.date).map((m) => (
                    <UpcomingRow key={`${sub}-up-${getMatchKey(m)}`} match={m} showSport={false} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {matches.length === 0 && live.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">{icon}</div>
            <p className="text-gray-500 text-lg font-medium">No matches scheduled right now</p>
          </div>
        )}
      </div>
    );
  }

  // Normal sport page
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8 pb-24 md:pb-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{label}</h1>
          <p className="text-sm text-gray-500">
            {live.length > 0 ? `${live.length} live now` : ""}
            {live.length > 0 && upcoming.length > 0 ? " • " : ""}
            {upcoming.length > 0 ? `${upcoming.length} upcoming` : ""}
            {live.length === 0 && upcoming.length === 0 ? "No matches scheduled" : ""}
          </p>
        </div>
      </div>

      {live.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase">Live Now</h2>
            <span className="text-[11px] text-gray-400 font-semibold ml-1">{live.length} streams</span>
          </div>
          <div className="space-y-3">
            {live.map((m) => (
              <LiveMatchRow key={`live-${getMatchKey(m)}`} match={m} score={scores[getMatchKey(m)] || null} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-[13px] font-extrabold text-gray-900 tracking-wider uppercase">Upcoming</h2>
          </div>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <UpcomingRow key={`upcoming-${getMatchKey(m)}`} match={m} showSport={false} />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && live.length === 0 && (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">{icon}</div>
          <p className="text-gray-500 text-lg font-medium">No matches scheduled right now</p>
          <p className="text-gray-400 text-sm mt-2">
            Check back later for live and upcoming {label.toLowerCase()} matches.
          </p>
        </div>
      )}
    </div>
  );
}
