"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SportsNav from "@/components/SportsNav";
import LeagueNav from "@/components/LeagueNav";
import DisclaimerFooter from "@/components/DisclaimerFooter";
import type { Match } from "@/lib/api";
import {
  buildStreamIndex,
  buildBadgeMap,
  badgeForName,
  badgeUrl,
  crestForName,
  resolveLeagueStream,
  shortTeamName,
  type CompetitionData,
  type KnockoutRound,
  type KnockoutTie,
  type LeagueMatchRow,
  type LeagueTab,
  type StandingRow,
} from "@/lib/leagues";

const TAB_LABEL: Record<LeagueTab, string> = {
  results: "Results",
  fixtures: "Fixtures",
  table: "Table",
  ko: "Knockout",
};

function kickoffTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDateLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/* --------- crest: streamed.pk badge, else a clean monogram --------- */
function Crest({ badge, crestUrl, name }: { badge?: string; crestUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = crestUrl ?? (badge ? badgeUrl(badge) : undefined);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-6 h-6 object-contain shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }
  const letter = (name.replace(/[^A-Za-z]/g, "").charAt(0) || "?").toUpperCase();
  return (
    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black flex items-center justify-center shrink-0">
      {letter}
    </span>
  );
}

/* --------- one match row (livescore style) --------- */
function MatchRow({
  row,
  badgeMap,
  crests,
  href,
}: {
  row: LeagueMatchRow;
  badgeMap: Map<string, string> | null;
  crests?: Record<string, string> | null;
  href: string | null;
}) {
  const finished = row.status === "finished";
  const hs = row.home_score;
  const as = row.away_score;
  const homeWin = finished && hs != null && as != null && hs > as;
  const awayWin = finished && hs != null && as != null && as > hs;
  const hBadge = badgeForName(row.home_team, badgeMap);
  const aBadge = badgeForName(row.away_team, badgeMap);

  const teamLine = (name: string, badge: string | undefined, win: boolean, score: number | null) => (
    <div className="flex items-center gap-2.5 min-w-0">
      <Crest badge={badge} crestUrl={crestForName(name, crests)} name={name} />
      <span className={`text-[13.5px] truncate ${win ? "font-extrabold text-gray-900" : "font-semibold text-gray-700"}`}>
        {shortTeamName(name)}
      </span>
      {finished && (
        <span className={`ml-auto pl-2 text-[15px] tabular-nums ${win ? "font-extrabold text-gray-900" : "font-bold text-gray-400"}`}>
          {score ?? "-"}
        </span>
      )}
    </div>
  );

  return (
    <div className="group flex items-stretch bg-white/60 backdrop-blur-xl border border-gray-100 rounded-2xl overflow-hidden hover:bg-white hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex-1 min-w-0 px-4 py-3.5 space-y-2.5">
        {teamLine(row.home_team, hBadge, homeWin, hs)}
        {teamLine(row.away_team, aBadge, awayWin, as)}
      </div>
      <div className="shrink-0 w-[90px] border-l border-gray-100/80 bg-gray-50/30 group-hover:bg-emerald-50/30 flex flex-col items-center justify-center gap-1.5 px-2 transition-colors duration-300">
        {finished ? (
          <>
            <span className="text-[10px] font-black text-gray-400 tracking-widest">FT</span>
            {href && (
              <Link href={href} className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
                Watch
              </Link>
            )}
          </>
        ) : (
          <>
            <span className="text-[13px] font-extrabold text-gray-900 tabular-nums">{kickoffTime(row.event_date)}</span>
            {href ? (
              <Link
                href={href}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-xl shadow-md shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
              >
                Watch
              </Link>
            ) : (
              <span className="text-[9px] font-bold text-gray-400 text-center leading-tight uppercase tracking-wide">Soon</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CompetitionPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = Number(decodeURIComponent((params.id as string) ?? ""));

  const [data, setData] = useState<CompetitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LeagueTab>("fixtures");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<LeagueMatchRow[]>([]);
  const [streamIdx, setStreamIdx] = useState<Map<string, Match[]> | null>(null);
  const [badgeMap, setBadgeMap] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    if (!Number.isFinite(leagueId)) return;
    let on = true;
    fetch(`/api/leagues/${leagueId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CompetitionData) => {
        if (!on || !d || !d.config) return;
        setData(d);
        setTab(d.defaultTab);
        setSelectedDate(d.selectedDate);
        setResults(d.results ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (on) setLoading(false);
      });
    return () => {
      on = false;
    };
  }, [leagueId]);

  // streamed.pk football feed → Watch links + crests-by-name.
  useEffect(() => {
    let on = true;
    fetch("https://streamed.pk/api/matches/football")
      .then((r) => r.json())
      .then((ms: Match[]) => {
        if (!on || !Array.isArray(ms)) return;
        setStreamIdx(buildStreamIndex(ms));
        setBadgeMap(buildBadgeMap(ms));
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  function pickDate(day: string) {
    if (day === selectedDate) return;
    setSelectedDate(day);
    fetch(`/api/leagues/${leagueId}?date=${day}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CompetitionData) => {
        if (d && Array.isArray(d.results)) setResults(d.results);
      })
      .catch(() => {});
  }

  function chooseSport(s: string | null) {
    if (s) sessionStorage.setItem("pp_sport", s);
    router.push("/");
  }

  const watchHref = (row: LeagueMatchRow): string | null =>
    streamIdx ? resolveLeagueStream(row, streamIdx) : null;

  return (
    <div className="flex flex-col min-h-screen">
      <SportsNav activeSport="football" onSelect={chooseSport} />
      <LeagueNav active={Number.isFinite(leagueId) ? leagueId : "all"} />

      <div className="flex-1 max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-10">
        {!Number.isFinite(leagueId) ? (
          <p className="text-gray-500 py-10">Unknown competition.</p>
        ) : loading && !data ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-gray-500 py-10">This competition isn’t available right now.</p>
        ) : (
          <>
            <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 via-white to-white border border-emerald-100/50 p-6 shadow-sm">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">{data.config.label}</h1>
              {data.seasonName && <p className="text-[13px] text-emerald-600 font-bold mt-1 tracking-wide uppercase">{data.seasonName}</p>}
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide p-1 bg-gray-100/50 backdrop-blur-md rounded-2xl w-max">
              {data.tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-[13px] font-bold rounded-xl transition-all duration-300 ${
                    tab === t
                      ? "bg-white text-emerald-600 shadow-sm ring-1 ring-black/5 scale-[1.02]"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                  }`}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>

            {tab === "fixtures" && <FixturesTab rows={data.fixtures} badgeMap={badgeMap} crests={data.crests} watchHref={watchHref} />}
            {tab === "results" && (
              <ResultsTab
                dates={data.resultDates}
                selectedDate={selectedDate}
                onPickDate={pickDate}
                rows={results}
                badgeMap={badgeMap}
                crests={data.crests}
                watchHref={watchHref}
              />
            )}
            {tab === "table" && <TableTab rows={data.standings} crests={data.crests} />}
            {tab === "ko" && <KnockoutTab rounds={data.knockout ?? []} badgeMap={badgeMap} crests={data.crests} />}
          </>
        )}
      </div>
      <DisclaimerFooter />
    </div>
  );
}

function FixturesTab({
  rows,
  badgeMap,
  crests,
  watchHref,
}: {
  rows: LeagueMatchRow[];
  badgeMap: Map<string, string> | null;
  crests?: Record<string, string> | null;
  watchHref: (r: LeagueMatchRow) => string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-14">
        <p className="text-gray-700 font-bold">No upcoming fixtures</p>
        <p className="text-[13px] text-gray-400 mt-1">New season starts August.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {rows.map((m) => (
        <MatchRow key={m.match_key} row={m} badgeMap={badgeMap} crests={crests} href={watchHref(m)} />
      ))}
    </div>
  );
}

const CAL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CAL_WD = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Month calendar for Results: only days with finished matches are clickable.
function ResultsCalendar({
  dates,
  selected,
  onPick,
}: {
  dates: string[];
  selected: string | null;
  onPick: (d: string) => void;
}) {
  const dateSet = new Set(dates);
  const monthKeys = Array.from(new Set(dates.map((d) => d.slice(0, 7)))).sort();
  const anchor =
    (selected ?? dates[0] ?? "").slice(0, 7) || monthKeys[monthKeys.length - 1] || "";
  const [view, setView] = useState(anchor);
  const idx = monthKeys.indexOf(view);
  const [yy, mm] = view.split("-").map(Number);
  const m = (mm || 1) - 1;
  const y = yy || new Date().getFullYear();
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < monthKeys.length - 1;

  return (
    <div className="mb-5 bg-white/70 backdrop-blur-xl border border-gray-100/80 rounded-2xl p-4 w-full sm:max-w-[340px] shadow-lg shadow-gray-200/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => canPrev && setView(monthKeys[idx - 1])}
          disabled={!canPrev}
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-[20px] transition-all ${
            canPrev ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:scale-105 active:scale-95" : "text-gray-300"
          }`}
          aria-label="Previous month"
        >
          &#8249;
        </button>
        <span className="text-[14px] font-black text-gray-900 tracking-wide">
          {CAL_MONTHS[m]} {y}
        </span>
        <button
          onClick={() => canNext && setView(monthKeys[idx + 1])}
          disabled={!canNext}
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-[20px] transition-all ${
            canNext ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:scale-105 active:scale-95" : "text-gray-300"
          }`}
          aria-label="Next month"
        >
          &#8250;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {CAL_WD.map((w) => (
          <span key={w} className="text-[10px] font-extrabold text-gray-400 text-center uppercase tracking-wider">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const key = ymd(y, m, d);
          const has = dateSet.has(key);
          const isSel = key === selected;
          return (
            <button
              key={key}
              onClick={() => has && onPick(key)}
              disabled={!has}
              className={`h-9 rounded-xl text-[13px] font-bold flex items-center justify-center transition-all duration-300 ${
                isSel
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-110"
                  : has
                  ? "bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:scale-105"
                  : "text-gray-300"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultsTab({
  dates,
  selectedDate,
  onPickDate,
  rows,
  badgeMap,
  crests,
  watchHref,
}: {
  dates: string[];
  selectedDate: string | null;
  onPickDate: (d: string) => void;
  rows: LeagueMatchRow[];
  badgeMap: Map<string, string> | null;
  crests?: Record<string, string> | null;
  watchHref: (r: LeagueMatchRow) => string | null;
}) {
  if (dates.length === 0) {
    return <p className="text-gray-500 py-10 text-center">No results yet this season.</p>;
  }
  return (
    <div>
      <ResultsCalendar dates={dates} selected={selectedDate} onPick={onPickDate} />
      {selectedDate && <p className="text-[13px] font-bold text-gray-500 mb-2">{fmtDateLabel(selectedDate)}</p>}
      <div className="space-y-2">
        {rows.map((m) => (
          <MatchRow key={m.match_key} row={m} badgeMap={badgeMap} crests={crests} href={watchHref(m)} />
        ))}
      </div>
    </div>
  );
}

function FormPips({ form }: { form: string }) {
  const items = (form || "").slice(-5).split("");
  const color = (c: string) => (c === "W" ? "bg-emerald-500 shadow-emerald-500/30" : c === "L" ? "bg-red-500 shadow-red-500/30" : "bg-gray-400 shadow-gray-400/30");
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((c, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-md text-white text-[9px] font-black flex items-center justify-center shadow-sm ${color(c)}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function TableTab({ rows, crests }: { rows: StandingRow[]; crests?: Record<string, string> | null }) {
  if (rows.length === 0) {
    return <p className="text-gray-500 py-10 text-center">Table not available.</p>;
  }
  const cols: Array<[string, keyof StandingRow]> = [
    ["P", "played"],
    ["W", "won"],
    ["D", "drawn"],
    ["L", "lost"],
    ["GF", "gf"],
    ["GA", "ga"],
    ["GD", "gd"],
    ["Pts", "pts"],
  ];
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-gray-100 rounded-2xl overflow-hidden shadow-xl shadow-emerald-500/5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[500px]">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100/80">
              <th className="text-left font-black text-gray-400 uppercase tracking-wider py-3 pl-4 w-[40px]">#</th>
              <th className="text-left font-black text-gray-400 uppercase tracking-wider py-3 pl-1">Team</th>
              {cols.map(([h]) => (
                <th key={h} className={`text-center font-black text-gray-400 uppercase tracking-wider py-3 ${h === "Pts" ? "w-[40px] text-gray-900" : h === "GD" ? "w-[36px]" : "w-[30px]"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/60">
            {rows.map((r) => (
              <tr key={r.team_id ?? r.position} className="hover:bg-white/80 transition-colors group">
                <td className="py-2.5 pl-4 text-gray-400 font-bold tabular-nums align-middle">{r.position}</td>
                <td className="py-2.5 pl-1 pr-2 align-middle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="transform transition-transform group-hover:scale-110 duration-300">
                      <Crest crestUrl={crestForName(r.team, crests)} name={r.team} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-gray-900 truncate tracking-tight text-[13px]">{shortTeamName(r.team)}</div>
                      <div className="mt-1">
                        <FormPips form={r.form} />
                      </div>
                    </div>
                  </div>
                </td>
                {cols.map(([h, key]) => {
                  const neg = h === "GD" && r.gd < 0;
                  return (
                    <td
                      key={h}
                      className={`text-center tabular-nums align-middle text-[12.5px] ${h === "Pts" ? "font-black text-emerald-600 text-[14px]" : neg ? "text-red-500 font-bold" : "text-gray-600 font-semibold"}`}
                    >
                      {h === "GD" ? (r.gd > 0 ? `+${r.gd}` : r.gd) : (r[key] as number)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function fmtKO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* --------- one two-legged knockout tie (or single-leg final) --------- */
function TieCard({
  tie,
  badgeMap,
  crests,
}: {
  tie: KnockoutTie;
  badgeMap: Map<string, string> | null;
  crests?: Record<string, string> | null;
}) {
  const { teamA, teamB, legs, aggA, aggB, winner, single } = tie;
  const goalsFor = (team: string, lg: KnockoutTie["legs"][number]) =>
    lg.home_team === team ? lg.home_score : lg.away_score;
  const teamRows: Array<{ team: string; win: boolean; agg: number | null }> = [
    { team: teamA, win: winner === "A", agg: aggA },
    { team: teamB, win: winner === "B", agg: aggB },
  ];
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-gray-100 rounded-2xl p-4 shadow-lg shadow-gray-200/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">
        <span className="flex-1" />
        {legs.map((_, i) => (
          <span key={i} className="w-[32px] text-center">{single ? "FT" : `L${i + 1}`}</span>
        ))}
        {!single && <span className="w-[36px] text-center text-emerald-600">Agg</span>}
      </div>
      <div className="space-y-2.5">
        {teamRows.map(({ team, win, agg }) => (
          <div key={team} className="flex items-center">
            <span className="flex-1 flex items-center gap-3 min-w-0">
              <Crest crestUrl={crestForName(team, crests)} badge={badgeForName(team, badgeMap)} name={team} />
              <span className={`truncate text-[13.5px] ${win ? "font-extrabold text-gray-900" : "font-bold text-gray-500"}`}>
                {shortTeamName(team)}
              </span>
            </span>
            {legs.map((lg, i) => (
              <span
                key={i}
                className={`w-[32px] text-center tabular-nums text-[13.5px] ${win ? "font-bold text-gray-900" : "text-gray-400"}`}
              >
                {goalsFor(team, lg) ?? "-"}
              </span>
            ))}
            {!single && (
              <span
                className={`w-[36px] bg-gray-50 rounded-lg py-1 text-center tabular-nums text-[14px] ${win ? "font-black text-emerald-600" : "font-bold text-gray-400"}`}
              >
                {agg ?? "-"}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] font-semibold text-gray-400 mt-3 pt-2 border-t border-gray-50 truncate text-center">
        {legs.map((lg, i) => `${i > 0 ? " · " : ""}${single ? "" : `L${i + 1} `}${fmtKO(lg.event_date)}`).join("")}
      </div>
    </div>
  );
}

function KnockoutTab({
  rounds,
  badgeMap,
  crests,
}: {
  rounds: KnockoutRound[];
  badgeMap: Map<string, string> | null;
  crests?: Record<string, string> | null;
}) {
  // Open on the latest round that has a played leg (finished season → Final,
  // mid-season → current round), instead of always the qualifying play-off.
  const defaultSel = (() => {
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].ties.some((t) => t.aggA != null || t.legs.some((l) => l.home_score != null))) return i;
    }
    return 0;
  })();
  const [sel, setSel] = useState(defaultSel);
  if (!rounds || rounds.length === 0) {
    return <p className="text-gray-500 py-10 text-center">The knockout stage hasn’t started yet.</p>;
  }
  const idx = Math.min(sel, rounds.length - 1);
  const active = rounds[idx];
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide p-1 bg-gray-100/50 backdrop-blur-md rounded-2xl w-max">
        {rounds.map((r, i) => (
          <button
            key={r.name}
            onClick={() => setSel(i)}
            className={`px-4 py-2.5 rounded-xl text-[13px] font-bold whitespace-nowrap transition-all duration-300 ${
              i === idx ? "bg-white text-emerald-600 shadow-sm ring-1 ring-black/5 scale-[1.02]" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
            }`}
          >
            {r.short}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.ties.map((t, i) => (
          <TieCard key={i} tie={t} badgeMap={badgeMap} crests={crests} />
        ))}
      </div>
    </div>
  );
}
