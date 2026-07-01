"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SportsNav from "@/components/SportsNav";
import LeagueNav from "@/components/LeagueNav";
import NotifyMeButton from "@/components/NotifyMeButton";
import { Match, getLiveMatches, getWatchHref } from "@/lib/api";
import { getCountryFlagUrl } from "@/lib/country-flags";
import { visibleInterval } from "@/lib/poll";
import { readPageCache, writePageCache } from "@/lib/page-cache";
import DisclaimerFooter from "@/components/DisclaimerFooter";

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

const LIVE_STATUSES = new Set([
  "1st_half", "2nd_half", "halftime", "ht", "live", "extra_time", "et", "penalties",
  "paused", "break", "inprogress", "in_progress", "1t", "2t", "first_half",
  "second_half", "1h", "2h", "playing", "started", "interval",
]);
const DONE_STATUSES = new Set(["finished", "ft", "aet", "after_penalties", "ended", "awarded", "fulltime", "full_time", "after_extra_time", "after_pens"]);
const isDone = (s: string) => DONE_STATUSES.has((s || "").toLowerCase());
const MATCH_WINDOW_MS = 2.5 * 60 * 60 * 1000; // typical match + buffer

// Bulletproof live check: a recognized live status OR — safety net for status
// words we've never seen — kickoff has passed, the match isn't finished, and
// we're within the realistic match window. This prevents the failure where an
// unknown status left live matches stuck on "SOON" with no WATCH link.
function isLiveFixture(f: { status: string; date: number; home_score: number | null }, now: number): boolean {
  const s = (f.status || "").toLowerCase();
  if (DONE_STATUSES.has(s)) return false;
  if (LIVE_STATUSES.has(s)) return true;
  if (f.date && now >= f.date && now - f.date <= MATCH_WINDOW_MS) return true;
  return false;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Country-name aliases: FIFA data and stream providers often name the same
// team differently. Both directions are checked via canonicalization.
const TEAM_ALIASES: Record<string, string> = {
  southkorea: "korearepublic",
  korea: "korearepublic",
  usa: "unitedstates",
  us: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire",
  czechrepublic: "czechia",
  holland: "netherlands",
  iran: "irniran",
  irislamicrepublicofiran: "irniran",
  saudi: "saudiarabia",
  uae: "unitedarabemirates",
};
function canon(s: string): string {
  const n = norm(s);
  return TEAM_ALIASES[n] || n;
}
function sideHit(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

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
  const [view, setView] = useState<"fixtures" | "results" | "knockout" | "standings">("fixtures");

  // Selecting a category from the World Cup page goes back to home with that
  // category pre-selected (home restores it from sessionStorage on mount).
  function selectSport(s: string | null) {
    if (s) sessionStorage.setItem("pp_sport", s);
    router.push("/");
  }

  // Cache-first: paint instantly from the last visit, refresh in background.
  useEffect(() => {
    const cached = readPageCache<WCData>("pp_wc_data");
    if (cached) { setData(cached); setLoading(false); }
    const cachedLive = readPageCache<Match[]>("pp_live_list");
    if (cachedLive) setLive(cachedLive);
  }, []);

  useEffect(() => {
    const load = () => {
      fetch("/api/world-cup")
        .then((r) => r.json())
        .then((d) => {
          const next = { groups: d.groups || {}, fixtures: d.fixtures || [] };
          setData(next);
          writePageCache("pp_wc_data", next);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    return visibleInterval(load, 90_000);
  }, []);

  useEffect(() => {
    const load = () => {
      getLiveMatches().then((m) => { setLive(m); writePageCache("pp_live_list", m); }).catch(() => {});
    };
    return visibleInterval(load, 90_000);
  }, []);

  const nowTs = Date.now();
  const liveCount = data.fixtures.filter((f) => isLiveFixture(f, nowTs)).length;

  function watchHref(f: Fixture): string | null {
    const h = canon(f.home.name), a = canon(f.away.name);
    const m = live.find((m) => {
      // 1) Structured team fields (with alias canonicalization, either order)
      const mh = canon(m.teams?.home?.name || ""), ma = canon(m.teams?.away?.name || "");
      if (mh && ma) {
        if ((sideHit(mh, h) && sideHit(ma, a)) || (sideHit(mh, a) && sideHit(ma, h))) return true;
      }
      // 2) Fallback: the stream's title contains both team names
      const t = canon(m.title || "");
      return !!t && t.includes(h) && t.includes(a);
    });
    return m ? getWatchHref(m) : null;
  }

  // Group a fixture list by calendar day.
  function groupByDay(list: Fixture[]): { day: string; items: Fixture[] }[] {
    const out: { day: string; items: Fixture[] }[] = [];
    for (const f of list) {
      const day = f.date
        ? new Date(f.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : "TBD";
      let bucket = out.find((b) => b.day === day);
      if (!bucket) { bucket = { day, items: [] }; out.push(bucket); }
      bucket.items.push(f);
    }
    return out;
  }

  // A fixture counts as played if the feed says so OR — safety net for status
  // words we don't recognize / feeds that never flip — kickoff was more than
  // 3h ago and it isn't currently live.
  function isPlayedFixture(f: Fixture): boolean {
    if (isDone(f.status)) return true;
    if (!f.date) return false;
    const s = (f.status || "").toLowerCase();
    return nowTs - f.date > 3 * 60 * 60 * 1000 && !LIVE_STATUSES.has(s);
  }

  // Results = played matches (most recent day first); Fixtures = live + upcoming.
  const playedFixtures = data.fixtures.filter((f) => isPlayedFixture(f));
  const unplayedFixtures = data.fixtures.filter((f) => !isPlayedFixture(f));
  
  const knockoutKeywords = ["round of 32", "round of 16", "quarter", "semi", "final", "3rd place", "play-off"];
  const isKnockout = (f: Fixture) => {
    const g = (f.group || "").toLowerCase();
    return knockoutKeywords.some(k => g.includes(k)) || (f.round && f.round > 3);
  };

  const knockoutFixtures = data.fixtures.filter(isKnockout);

  function groupByRound(list: Fixture[]): { round: string; items: Fixture[] }[] {
    const out: { round: string; items: Fixture[] }[] = [];
    for (const f of list) {
      const round = f.group || (f.round ? `Round ${f.round}` : "Match");
      let bucket = out.find((b) => b.round === round);
      if (!bucket) { bucket = { round, items: [] }; out.push(bucket); }
      bucket.items.push(f);
    }
    // Sort rounds roughly logically (Final at top or bottom? Usually Final at top for current tournament state)
    return out.reverse(); 
  }

  const byDay = view === "results"
    ? groupByDay([...playedFixtures].sort((a, b) => b.date - a.date))
    : view === "knockout"
    ? [] // handled below
    : groupByDay(unplayedFixtures);

  const byRound = view === "knockout" ? groupByRound(knockoutFixtures) : [];

  const groupKeys = Object.keys(data.groups).sort();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Category bar — same as home, with World Cup highlighted; tapping a
          category returns to home with that category active. */}
      <SportsNav activeSport="football" onSelect={selectSport} />
      <LeagueNav active="wc" />

      <div className="flex-1 max-w-[1100px] mx-auto px-4 lg:px-6 py-6 pb-10">
        {/* Slim live indicator only — the bulky badge/title was redundant with the nav. */}
        {liveCount > 0 && (
          <div className="flex items-center gap-1.5 text-red-500 font-bold text-[12px] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveCount} live now
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max mb-5 overflow-auto max-w-full">
          {(["fixtures", "results", "knockout", "standings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`text-[12px] font-bold px-4 py-1.5 rounded-lg transition-colors capitalize whitespace-nowrap ${
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
        ) : view === "knockout" ? (
          <div className="space-y-8">
            {byRound.map(({ round, items }) => (
              <div key={round}>
                <h3 className="text-[13px] font-extrabold text-gray-900 border-l-4 border-emerald-500 pl-3 mb-4">{round}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {items.map((f) => {
                    const done = isDone(f.status);
                    const href = !done ? watchHref(f) : null;
                    const liveNow = isLiveFixture(f, nowTs) || !!href;
                    const time = f.date ? new Date(f.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
                    const showScore = f.home_score !== null || f.away_score !== null;
                    const Row: React.ElementType = href ? Link : "div";
                    
                    return (
                      <Row
                        key={f.id}
                        {...(href ? { href } : {})}
                        className={`flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 rounded-2xl border ${
                          liveNow
                            ? "bg-red-50/40 border-red-100" + (href ? " hover:border-red-200 hover:bg-red-50 cursor-pointer transition-colors" : "")
                            : "bg-white border-gray-100 shadow-sm"
                        }`}
                      >
                        <div className="shrink-0 w-14 sm:w-16 text-center">
                          {liveNow ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-500">
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                              {f.minute ? `${f.minute}'` : "LIVE"}
                            </span>
                          ) : done ? (
                            <span className="text-[11px] font-bold text-gray-400">FT</span>
                          ) : (
                            <KickoffCell date={f.date} time={time} />
                          )}
                        </div>
                        <div className="w-px h-10 bg-gray-100 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Flag name={f.home.name} />
                              <span className="text-[13px] sm:text-[14px] font-extrabold text-gray-900 truncate">{f.home.name}</span>
                            </div>
                            {showScore && <span className="text-[14px] font-black text-gray-900 tabular-nums shrink-0">{f.home_score ?? 0}</span>}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Flag name={f.away.name} />
                              <span className="text-[13px] sm:text-[14px] font-extrabold text-gray-900 truncate">{f.away.name}</span>
                            </div>
                            {showScore && <span className="text-[14px] font-black text-gray-900 tabular-nums shrink-0">{f.away_score ?? 0}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1 w-[72px]">
                          {href && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-emerald-500 px-3 py-1.5 rounded-xl whitespace-nowrap shadow-sm">
                               WATCH
                            </span>
                          )}
                          {!href && liveNow && (
                             <span className="text-[9px] font-bold text-red-400 animate-pulse">LIVE NOW</span>
                          )}
                          {done && (
                             <span className="text-[10px] font-bold text-gray-300">COMPLETED</span>
                          )}
                        </div>
                      </Row>
                    );
                  })}
                </div>
              </div>
            ))}
            {byRound.length === 0 && (
              <div className="text-center py-24 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                 <p className="text-[14px] font-bold text-gray-500 uppercase tracking-widest">Knockout stages pending</p>
                 <p className="text-[12px] text-gray-400 mt-1">Bracket will be generated after group stage completion.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {byDay.map(({ day, items }) => (
              <div key={day}>
                <h3 className="text-[12px] font-extrabold text-gray-500 tracking-wider uppercase mb-2">{day}</h3>
                <div className="space-y-2">
                  {items.map((f) => {
                    const done = isDone(f.status);
                    // A force-lived match sits in the live set (getLiveMatches) even
                    // before kickoff, so a watch link resolves → show it as LIVE.
                    const href = !done ? watchHref(f) : null;
                    const liveNow = isLiveFixture(f, nowTs) || !!href;
                    const time = f.date ? new Date(f.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
                    const showScore = f.home_score !== null || f.away_score !== null;
                    const Row: React.ElementType = href ? Link : "div";
                    return (
                      <Row
                        key={f.id}
                        {...(href ? { href } : {})}
                        className={`flex items-center gap-2 sm:gap-3 py-2.5 px-3 sm:px-4 rounded-2xl border ${
                          liveNow
                            ? "bg-red-50/40 border-red-100" + (href ? " hover:border-red-200 hover:bg-red-50 cursor-pointer transition-colors" : "")
                            : "bg-white border-gray-100"
                        }`}
                      >
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
                        <div className="shrink-0 flex flex-col items-end gap-1 w-[72px]">
                          {f.group && <span className="text-[8px] font-bold text-gray-400 whitespace-nowrap">{f.group}</span>}
                          {href ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-emerald-500 px-2.5 py-1 rounded-lg whitespace-nowrap">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg> WATCH
                            </span>
                          ) : liveNow ? (
                            <span className="text-[8px] font-bold text-red-400 whitespace-nowrap animate-pulse">finding stream…</span>
                          ) : !done ? (
                            <NotifyMeButton home={f.home.name} away={f.away.name} />
                          ) : null}
                        </div>
                      </Row>
                    );
                  })}
                </div>
              </div>
            ))}
            {byDay.length === 0 && (
              <p className="text-center text-gray-400 py-16">
                {view === "results" ? "Played matches and final scores will appear here." : "Fixtures will appear here as they're scheduled."}
              </p>
            )}
          </div>
        )}
      </div>
      <DisclaimerFooter />
    </div>
  );
}
