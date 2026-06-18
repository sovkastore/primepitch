"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SportsNav from "@/components/SportsNav";
import LeagueNav from "@/components/LeagueNav";
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
  type LeagueMatchRow,
  type LeagueTab,
  type StandingRow,
} from "@/lib/leagues";

const TAB_LABEL: Record<LeagueTab, string> = {
  results: "Results",
  fixtures: "Fixtures",
  table: "Table",
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
    <div className="flex items-stretch bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0 px-3.5 py-2.5 space-y-2">
        {teamLine(row.home_team, hBadge, homeWin, hs)}
        {teamLine(row.away_team, aBadge, awayWin, as)}
      </div>
      <div className="shrink-0 w-[84px] border-l border-gray-100 flex flex-col items-center justify-center gap-1 px-1.5">
        {finished ? (
          <>
            <span className="text-[9px] font-black text-gray-300 tracking-widest">FT</span>
            {href && (
              <Link href={href} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700">
                Watch
              </Link>
            )}
          </>
        ) : (
          <>
            <span className="text-[12px] font-bold text-gray-900 tabular-nums">{kickoffTime(row.event_date)}</span>
            {href ? (
              <Link
                href={href}
                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                Watch
              </Link>
            ) : (
              <span className="text-[8.5px] text-gray-400 text-center leading-tight">near kick-off</span>
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
    <>
      <SportsNav activeSport="football" onSelect={chooseSport} />
      <LeagueNav active={Number.isFinite(leagueId) ? leagueId : "all"} />

      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
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
            <div className="mb-4">
              <h1 className="text-xl font-black text-gray-900">{data.config.label}</h1>
              {data.seasonName && <p className="text-[12px] text-gray-400 font-medium">{data.seasonName}</p>}
            </div>

            <div className="flex gap-1 border-b border-gray-200 mb-4">
              {data.tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-[13px] font-bold -mb-px border-b-2 transition-colors ${
                    tab === t
                      ? "border-emerald-500 text-emerald-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
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
          </>
        )}
      </div>
    </>
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
    <div className="space-y-2">
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
    <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3 w-full sm:max-w-[320px]">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => canPrev && setView(monthKeys[idx - 1])}
          disabled={!canPrev}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[18px] text-gray-500 ${
            canPrev ? "hover:bg-gray-100" : "opacity-30"
          }`}
          aria-label="Previous month"
        >
          &#8249;
        </button>
        <span className="text-[13px] font-bold text-gray-900">
          {CAL_MONTHS[m]} {y}
        </span>
        <button
          onClick={() => canNext && setView(monthKeys[idx + 1])}
          disabled={!canNext}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[18px] text-gray-500 ${
            canNext ? "hover:bg-gray-100" : "opacity-30"
          }`}
          aria-label="Next month"
        >
          &#8250;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {CAL_WD.map((w) => (
          <span key={w} className="text-[9px] font-bold text-gray-300 text-center">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
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
              className={`h-8 rounded-lg text-[12px] font-bold flex items-center justify-center transition-colors ${
                isSel
                  ? "bg-emerald-500 text-white"
                  : has
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
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
  const color = (c: string) => (c === "W" ? "bg-emerald-500" : c === "L" ? "bg-red-500" : "bg-gray-300");
  return (
    <span className="inline-flex gap-1">
      {items.map((c, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-[3px] text-white text-[9px] font-black flex items-center justify-center ${color(c)}`}
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
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="text-gray-400 text-[10px] uppercase tracking-wider border-b border-gray-200">
            <th className="text-left font-bold py-2 pl-1 w-7">#</th>
            <th className="text-left font-bold py-2">Team</th>
            {cols.map(([h]) => (
              <th key={h} className="text-center font-bold py-2 px-1.5">
                {h}
              </th>
            ))}
            <th className="text-left font-bold py-2 px-2">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team_id ?? r.position} className="border-b border-gray-100">
              <td className="py-2.5 pl-1 text-gray-400 font-bold tabular-nums">{r.position}</td>
              <td className="py-2.5 font-bold text-gray-900 whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <Crest crestUrl={crestForName(r.team, crests)} name={r.team} />
                  {shortTeamName(r.team)}
                </span>
              </td>
              {cols.map(([h, key]) => (
                <td
                  key={h}
                  className={`py-2.5 px-1.5 text-center tabular-nums ${h === "Pts" ? "font-black text-gray-900" : "text-gray-600"}`}
                >
                  {h === "GD" ? (r.gd > 0 ? `+${r.gd}` : r.gd) : (r[key] as number)}
                </td>
              ))}
              <td className="py-2.5 px-2">
                <FormPips form={r.form} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
