"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LeagueNav from "@/components/LeagueNav";
import type { Match } from "@/lib/api";
import {
  buildStreamIndex,
  resolveLeagueStream,
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

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CompetitionPage() {
  const params = useParams();
  const leagueId = Number(decodeURIComponent((params.id as string) ?? ""));

  const [data, setData] = useState<CompetitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LeagueTab>("fixtures");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<LeagueMatchRow[]>([]);
  const [streamIdx, setStreamIdx] = useState<Map<string, Match[]> | null>(null);

  // Competition bundle (current-season fixtures/results/dates/standings).
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

  // streamed.pk football feed (the only stream source) for read-time Watch links.
  useEffect(() => {
    let on = true;
    fetch("https://streamed.pk/api/matches/football")
      .then((r) => r.json())
      .then((ms: Match[]) => {
        if (on && Array.isArray(ms)) setStreamIdx(buildStreamIndex(ms));
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

  const watchHref = (row: LeagueMatchRow): string | null =>
    streamIdx ? resolveLeagueStream(row, streamIdx) : null;

  if (!Number.isFinite(leagueId)) {
    return <div className="max-w-[1400px] mx-auto px-4 py-10 text-gray-500">Unknown competition.</div>;
  }

  return (
    <>
      <LeagueNav active={leagueId} />

      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
        {loading && !data ? (
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

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 mb-4">
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

            {tab === "fixtures" && <FixturesTab rows={data.fixtures} watchHref={watchHref} />}
            {tab === "results" && (
              <ResultsTab
                dates={data.resultDates}
                selectedDate={selectedDate}
                onPickDate={pickDate}
                rows={results}
                watchHref={watchHref}
              />
            )}
            {tab === "table" && <TableTab rows={data.standings} />}
          </>
        )}
      </div>
    </>
  );
}

/* ----------------------------- Fixtures ----------------------------- */
function FixturesTab({
  rows,
  watchHref,
}: {
  rows: LeagueMatchRow[];
  watchHref: (r: LeagueMatchRow) => string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 font-semibold">No upcoming fixtures</p>
        <p className="text-[13px] text-gray-400 mt-1">New season starts August.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((m) => {
        const href = watchHref(m);
        return (
          <div
            key={m.match_key}
            className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-gray-900 truncate">
                {m.home_team} <span className="text-gray-300 font-medium">vs</span> {m.away_team}
              </p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">{fmtKickoff(m.event_date)}</p>
            </div>
            {href ? (
              <Link
                href={href}
                className="shrink-0 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold rounded-lg transition-colors"
              >
                Watch
              </Link>
            ) : (
              <span className="shrink-0 text-[11px] text-gray-400 font-medium text-right max-w-[120px]">
                stream available near kick-off
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- Results ----------------------------- */
function ResultsTab({
  dates,
  selectedDate,
  onPickDate,
  rows,
  watchHref,
}: {
  dates: string[];
  selectedDate: string | null;
  onPickDate: (d: string) => void;
  rows: LeagueMatchRow[];
  watchHref: (r: LeagueMatchRow) => string | null;
}) {
  if (dates.length === 0) {
    return <p className="text-gray-500 py-10 text-center">No results yet this season.</p>;
  }
  return (
    <div>
      <div className="mb-4">
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          Match day
        </label>
        <select
          value={selectedDate ?? ""}
          onChange={(e) => onPickDate(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {fmtDateLabel(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {rows.map((m) => {
          const href = watchHref(m);
          return (
            <div
              key={m.match_key}
              className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              <p className="text-[14px] font-bold text-gray-900 min-w-0 truncate">{m.home_team}</p>
              <span className="shrink-0 px-2.5 py-1 bg-gray-900 text-white text-[13px] font-black rounded-lg tabular-nums">
                {m.home_score ?? "-"} : {m.away_score ?? "-"}
              </span>
              <p className="text-[14px] font-bold text-gray-900 min-w-0 truncate text-right">{m.away_team}</p>
              {href && (
                <Link
                  href={href}
                  className="shrink-0 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold rounded-lg transition-colors"
                >
                  Watch
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Table ------------------------------ */
function FormPips({ form }: { form: string }) {
  const items = (form || "").slice(-5).split("");
  const color = (c: string) =>
    c === "W" ? "bg-emerald-500" : c === "L" ? "bg-red-500" : "bg-gray-300";
  return (
    <span className="inline-flex gap-1">
      {items.map((c, i) => (
        <span
          key={i}
          title={c}
          className={`w-4 h-4 rounded-[3px] text-white text-[9px] font-black flex items-center justify-center ${color(c)}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function TableTab({ rows }: { rows: StandingRow[] }) {
  const cols = useMemo(
    () => ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"] as const,
    []
  );
  if (rows.length === 0) {
    return <p className="text-gray-500 py-10 text-center">Table not available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="text-gray-400 text-[11px] uppercase tracking-wider border-b border-gray-200">
            <th className="text-left font-bold py-2 pl-2 w-8">#</th>
            <th className="text-left font-bold py-2">Team</th>
            {cols.map((c) => (
              <th key={c} className="text-center font-bold py-2 px-2">
                {c}
              </th>
            ))}
            <th className="text-left font-bold py-2 px-2">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team_id ?? r.position} className="border-b border-gray-100">
              <td className="py-2.5 pl-2 text-gray-400 font-bold tabular-nums">{r.position}</td>
              <td className="py-2.5 font-bold text-gray-900 whitespace-nowrap">{r.team}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.played}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.won}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.drawn}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.lost}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.gf}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.ga}</td>
              <td className="py-2.5 px-2 text-center tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="py-2.5 px-2 text-center font-black text-gray-900 tabular-nums">{r.pts}</td>
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
