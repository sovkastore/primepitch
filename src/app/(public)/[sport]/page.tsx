"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import LiveMatchRow from "@/components/LiveMatchRow";
import TeamBadge from "@/components/TeamBadge";
import { Match, getMatchStatus, getWatchHref, SPORT_ICONS, SPORT_LABELS } from "@/lib/api";
import { classifyFight, FIGHT_SUB_LABELS, FIGHT_SUB_ICONS, FightSubcategory } from "@/lib/fight-categories";

const FIGHT_SUB_MAP: Record<string, string> = {
  ufc: "mma",
  wwe: "wrestling",
  boxing: "boxing",
};

function UpcomingRow({ match }: { match: Match }) {
  const d = new Date(match.date);
  const dateStr = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const href = getWatchHref(match);
  const hasTeams = match.teams?.home && match.teams?.away;
  const label = SPORT_LABELS[match.category] || match.category;

  return (
    <Link href={href} className="group block">
      <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
        <div className="shrink-0 w-20 text-center">
          <p className="text-[11px] font-bold text-emerald-500">{timeStr}</p>
          <p className="text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        <div className="w-px h-8 bg-gray-200 shrink-0" />
        {hasTeams ? (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size="sm" sport={match.category} />
            <span className="text-[12px] font-bold text-gray-800 truncate">{match.teams!.home!.name}</span>
            <span className="text-[9px] text-gray-400 font-extrabold shrink-0">VS</span>
            <span className="text-[12px] font-bold text-gray-800 truncate text-right">{match.teams!.away!.name}</span>
            <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size="sm" sport={match.category} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-gray-800 truncate">{match.title}</p>
          </div>
        )}
        <span className="text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">{label}</span>
      </div>
    </Link>
  );
}

export default function SportPage() {
  const params = useParams();
  const sport = params.sport as string;
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const icon = SPORT_ICONS[sport] || "\u26BD";
  const label = SPORT_LABELS[sport] || sport;

  useEffect(() => {
    async function load() {
      try {
        const fightSub = FIGHT_SUB_MAP[sport];
        const apiSport = fightSub ? "fight" : sport;
        const res = await fetch(`https://streamed.pk/api/matches/${apiSport}`);
        let data: Match[] = await res.json();
        data = data.map((m) => ({ ...m, category: apiSport }));
        if (fightSub) {
          data = data.filter((m) => classifyFight(m.title) === fightSub);
        }
        setMatches(data);
      } catch (e) {
        console.error("Failed to load matches:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sport]);

  const live = matches.filter((m) => getMatchStatus(m) === "live");
  const upcoming = matches
    .filter((m) => getMatchStatus(m) === "upcoming")
    .sort((a, b) => a.date - b.date);

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

    for (const m of matches) {
      const sub = classifyFight(m.title);
      const status = getMatchStatus(m);
      if (status === "live") grouped[sub].live.push(m);
      else if (status === "upcoming") grouped[sub].upcoming.push(m);
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
              {live.length > 0 && upcoming.length > 0 ? " \u2022 " : ""}
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
                  {g.live.map((m, i) => (
                    <LiveMatchRow key={`${sub}-live-${m.id}-${i}`} match={m} />
                  ))}
                </div>
              )}
              {g.upcoming.length > 0 && (
                <div className="space-y-2">
                  {g.upcoming.sort((a, b) => a.date - b.date).map((m, i) => (
                    <UpcomingRow key={`${sub}-up-${m.id}-${i}`} match={m} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {matches.length === 0 && (
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
            {live.length > 0 && upcoming.length > 0 ? " \u2022 " : ""}
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
            {live.map((m, i) => (
              <LiveMatchRow key={`live-${m.id}-${i}`} match={m} />
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
            {upcoming.map((m, i) => (
              <UpcomingRow key={`upcoming-${m.id}-${i}`} match={m} />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && (
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
