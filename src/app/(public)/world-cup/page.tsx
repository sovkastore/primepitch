"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SportsNav from "@/components/SportsNav";
import { Match, getLiveMatches, getWatchHref } from "@/lib/api";
import { getCountryFlagUrl } from "@/lib/country-flags";
import { visibleInterval } from "@/lib/poll";

interface Team { name: string; country: string; }
interface Fixture {
  id: number; group: string | null; round: number | null; date: number; status: string;
  home: Team; away: Team; home_score: number | null; away_score: number | null;
  minute: number | null; period: string;
}
interface StandingRow {
  position: number; team: string; team_id: number; played: number; won: number;
  drawn: number; lost: number; gf: number; ga: number; gd: number; pts: number;
}
interface WCData { groups: Record<string, StandingRow[]>; fixtures: Fixture[]; }

const LIVE_STATUSES = new Set(["1st_half", "2nd_half", "halftime", "ht", "live", "extra_time", "et", "penalties", "paused", "break"]);
const DONE_STATUSES = new Set(["finished", "ft", "aet", "after_penalties", "ended", "awarded"]);
const isLive = (s: string) => LIVE_STATUSES.has((s || "").toLowerCase());
const isDone = (s: string) => DONE_STATUSES.has((s || "").toLowerCase());
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Flag({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const url = getCountryFlagUrl(name);
  if (!url || failed) return <span className="w-5 h-4 rounded-sm bg-gray-200 inline-block shrink-0" />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="w-5 h-4 rounded-sm object-cover shrink-0 border border-gray-200"
      onError={() => setFailed(true)}
    />
  );
}

const HOUR = 60 * 60 * 1000;

// Kickoff cell: shows the time, but ticks down MM:SS in the final hour before kickoff.
function KickoffCell({ date, time }: { date: number; time: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (date - Date.now() > HOUR) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [date]);
  const diff = now === null ? Infinity : date - now;
  if (diff > 0 && diff <= HOUR) {
    const total = Math.floor(diff / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return (
      <>
        <p className="text-[12px] font-extrabold text-emerald-500 tabular-nums leading-none">{mm}:{ss}</p>
        <p className="text-[6px] font-bold text-emerald-500/80 tracking-widest mt-0.5">STARTS IN</p>
      </>
    );
  }
  if (diff <= 0) return <p className="text-[10px] font-extrabold text-emerald-500">SOON</p>;
  return <p className="text-[11px] font-bold text-emerald-500">{time}</p>;
}

export default function WorldCupPage() {
  const router = useRouter();
  const [data, setData] = useState<WCData>({ groups: {}, fixtures: [] });
  const [live, setLive] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"fixtures" | "standings">("fixtures");

  // Selecting a category from the World Cup page goes back to home with that
  // category pre-selected (home restores it from sessionStorage on mount).
  function selectSport(s: string | null) {
    if (s) sessionStorage.setItem("pp_sport", s);
    router.push("/");
  }

  useEffect(() => {
    const load = () => {
      fetch("/api/world-cup")
        .then((r) => r.json())
        .then((d) => { setData({ groups: d.groups || {}, fixtures: d.fixtures || [] }); setLoading(false); })
        .catch(() => setLoading(false));
    };
    return visibleInterval(load, 90_000);
  }, []);

  useEffect(() => {
    const load = () => { getLiveMatches().then(setLive).catch(() => {}); };
    return visibleInterval(load, 90_000);
  }, []);

  const liveCount = data.fixtures.filter((f) => isLive(f.status)).length;

  function watchHref(f: Fixture): string | null {
    const h = norm(f.home.name), a = norm(f.away.name);
    const m = live.find((m) => {
      const mh = norm(m.teams?.home?.name || ""), ma = norm(m.teams?.away?.name || "");
      return mh && ma && (mh.includes(h) || h.includes(mh)) && (ma.includes(a) || a.includes(ma));
    });
    return m ? getWatchHref(m) : null;
  }

  // Group fixtures by calendar day.
  const byDay: { day: string; items: Fixture[] }[] = [];
  for (const f of data.fixtures) {
    const day = f.date
      ? new Date(f.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : "TBD";
    let bucket = byDay.find((b) => b.day === day);
    if (!bucket) { bucket = { day, items: [] }; byDay.push(bucket); }
    bucket.items.push(f);
  }

  const groupKeys = Object.keys(data.groups).sort();

  return (
    <>
      {/* Category bar — same as home, with World Cup highlighted; tapping a
          category returns to home with that category active. */}
      <SportsNav activeSport={null} onSelect={selectSport} worldCupActive />

      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0">
          <img src="/icons/brands/fifa.svg" alt="" className="w-7 h-7 invert" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">FIFA World Cup 2026</h1>
          <p className="text-sm text-gray-500">
            {liveCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-red-500 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveCount} live now
              </span>
            ) : (
              "48 teams · 12 groups"
            )}
          </p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max mb-5">
        {(["fixtures", "standings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`text-[12px] font-bold px-4 py-1.5 rounded-lg transition-colors capitalize ${
              view === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-9 h-9 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "standings" ? (
        groupKeys.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Group standings will appear once the draw data is available.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {groupKeys.map((g) => (
              <div key={g} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-[13px] font-extrabold text-gray-900">{g}</h3>
                </div>
                <table className="w-full text-[11px] sm:text-[12px]">
                  <thead>
                    <tr className="text-gray-400 font-bold">
                      <th className="text-left px-3 py-2 w-5">#</th>
                      <th className="text-left py-2">Team</th>
                      <th className="text-center px-1 py-2">P</th>
                      <th className="text-center px-1 py-2 hidden sm:table-cell">W</th>
                      <th className="text-center px-1 py-2 hidden sm:table-cell">D</th>
                      <th className="text-center px-1 py-2 hidden sm:table-cell">L</th>
                      <th className="text-center px-1 py-2">GD</th>
                      <th className="text-center px-3 py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups[g].map((r) => (
                      <tr key={r.team_id} className={`border-t border-gray-50 ${r.position <= 2 ? "bg-emerald-50/60" : ""}`}>
                        <td className="px-3 py-2 font-bold text-gray-400">{r.position}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Flag name={r.team} />
                            <span className="font-bold text-gray-800 truncate">{r.team}</span>
                          </div>
                        </td>
                        <td className="text-center px-1 py-2 text-gray-600">{r.played}</td>
                        <td className="text-center px-1 py-2 text-gray-600 hidden sm:table-cell">{r.won}</td>
                        <td className="text-center px-1 py-2 text-gray-600 hidden sm:table-cell">{r.drawn}</td>
                        <td className="text-center px-1 py-2 text-gray-600 hidden sm:table-cell">{r.lost}</td>
                        <td className="text-center px-1 py-2 text-gray-600 tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="text-center px-3 py-2 font-black text-gray-900">{r.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6">
          {byDay.map(({ day, items }) => (
            <div key={day}>
              <h3 className="text-[12px] font-extrabold text-gray-500 tracking-wider uppercase mb-2">{day}</h3>
              <div className="space-y-2">
                {items.map((f) => {
                  const liveNow = isLive(f.status);
                  const done = isDone(f.status);
                  const href = liveNow ? watchHref(f) : null;
                  const time = f.date ? new Date(f.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
                  const showScore = f.home_score !== null || f.away_score !== null;
                  return (
                    <div key={f.id} className="flex items-center gap-2 sm:gap-3 py-2.5 px-3 sm:px-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <div className="shrink-0 w-14 sm:w-16 text-center">
                        {liveNow ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            {f.minute ? `${f.minute}'` : "LIVE"}
                          </span>
                        ) : done ? (
                          <span className="text-[10px] font-bold text-gray-400">FT</span>
                        ) : (
                          <KickoffCell date={f.date} time={time} />
                        )}
                      </div>
                      <div className="w-px h-9 bg-gray-200 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Flag name={f.home.name} />
                            <span className="text-[12px] sm:text-[13px] font-bold text-gray-800 truncate">{f.home.name}</span>
                          </div>
                          {showScore && <span className="text-[13px] font-black text-gray-900 tabular-nums shrink-0">{f.home_score ?? 0}</span>}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Flag name={f.away.name} />
                            <span className="text-[12px] sm:text-[13px] font-bold text-gray-800 truncate">{f.away.name}</span>
                          </div>
                          {showScore && <span className="text-[13px] font-black text-gray-900 tabular-nums shrink-0">{f.away_score ?? 0}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1 w-16">
                        {f.group && <span className="text-[8px] font-bold text-gray-400 whitespace-nowrap">{f.group}</span>}
                        {href && (
                          <Link href={href} className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1 rounded-lg transition-colors">
                            ▶ WATCH
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {data.fixtures.length === 0 && (
            <p className="text-center text-gray-400 py-16">Fixtures will appear here as they're scheduled.</p>
          )}
        </div>
      )}
    </div>
    </>
  );
}
