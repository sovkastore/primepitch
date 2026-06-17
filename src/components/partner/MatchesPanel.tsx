"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyCompare, type CompareMode } from "@/components/partner/compare";
import DayPicker from "@/components/partner/DayPicker";

export interface PanelMatch {
  match_id: string; title: string; sport?: string | null; status?: string;
  viewsTotal: number; viewsHis: number; viewsYours: number; viewsOwn?: number;
  liveViews: number; preViews: number;
  uniqueTotal: number; uniqueHis: number; uniqueYours: number; uniqueOwn?: number;
  liveTotal: number; liveHis: number; liveYours: number; liveOwn?: number;
  preTotal: number; preHis: number; preYours: number; preOwn?: number;
  peakTotal: number; peakHis: number; peakYours: number; peakOwn?: number;
  avgDuration: number; lastViewed?: string; kickoff?: number | null;
}

function fmtDur(s: number): string {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUSES = [
  { k: "all", l: "All" },
  { k: "live", l: "Live" },
  { k: "played", l: "Played" },
  { k: "upcoming", l: "Upcoming" },
];
const SPORTS = ["football", "basketball", "american-football", "fight", "motor-sports", "tennis", "hockey", "baseball", "cricket", "rugby", "golf", "other"];

// src = the matches endpoint (already includes ?stat/&code for admin). The panel
// owns the day filter and refetches server-side, plus client-side status/sort/sport.
export default function MatchesPanel({ src, mine, compare = "all" }: { src: string; mine?: boolean; compare?: CompareMode }) {
  const [day, setDay] = useState(""); // "" = all time
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"recent" | "views">("recent");
  const [sport, setSport] = useState("");
  const [matches, setMatches] = useState<PanelMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const url = useMemo(() => src + (src.includes("?") ? "&" : "?") + (day ? `day=${day}` : ""), [src, day]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      setMatches(j.matches ?? []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);

  const withStatus = useMemo(
    () => applyCompare(matches, compare).map((m) => ({ ...m, st: m.status || "played" })),
    [matches, compare],
  );
  const sportOptions = useMemo(() => {
    const present = new Set(matches.map((m) => (m.sport || "").toLowerCase()).filter(Boolean));
    return SPORTS.filter((s) => present.has(s));
  }, [matches]);
  const rows = useMemo(() => {
    let r = withStatus.slice();
    if (status !== "all") r = r.filter((m) => m.st === status);
    if (sport) r = r.filter((m) => (m.sport || "").toLowerCase() === sport);
    r.sort((a, b) => (sort === "views" ? b.viewsTotal - a.viewsTotal : (b.kickoff ?? 0) - (a.kickoff ?? 0)));
    return r;
  }, [withStatus, status, sport, sort]);

  const blue = mine ? "me" : "his";
  const grey = mine ? "others" : "yours";
  const tab = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${active ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`;

  return (
    <>
      <DayPicker date={day} onChange={setDay} allowAll />
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {STATUSES.map((s) => (
          <button key={s.k} onClick={() => setStatus(s.k)} className={tab(status === s.k)}>{s.l}</button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <button onClick={() => setSort("views")} className={tab(sort === "views")}>Most watched</button>
        <button onClick={() => setSort("recent")} className={tab(sort === "recent")}>Recent</button>
        {sportOptions.length > 0 && (
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold">
            <option value="">All sports</option>
            {sportOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No matches for this filter.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[820px]">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-3 py-2">Match</th>
                <th className="text-left font-bold px-3 py-2">Status</th>
                <th className="text-right font-bold px-3 py-2">Views ({`total / ${blue} / ${grey}`})</th>
                <th className="text-right font-bold px-3 py-2">Unique ({`total / ${blue} / ${grey}`})</th>
                <th className="text-right font-bold px-3 py-2">Peak ({`total / ${blue} / ${grey}`})</th>
                <th className="text-right font-bold px-3 py-2 hidden md:table-cell">Avg watch</th>
                <th className="text-right font-bold px-3 py-2 hidden lg:table-cell">Last viewed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((m) => (
                <tr key={m.match_id}>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-gray-800">{m.title}</span>
                    {m.sport && <span className="text-[10px] text-gray-400 ml-2 uppercase">{m.sport}</span>}
                    {(m.liveTotal + m.preTotal) > 0 && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {m.liveTotal} watched live · {m.preTotal} before kickoff
                        {(m.liveHis + m.preHis) > 0 && (
                          <span className="text-blue-600 ml-1">· {m.liveHis}/{m.preHis} {blue}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      m.st === "live" ? "bg-red-50 text-red-600"
                      : m.st === "upcoming" ? "bg-amber-50 text-amber-600"
                      : "bg-gray-100 text-gray-500"}`}>{m.st}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div>
                      <span className="font-bold text-gray-900">{m.viewsTotal}</span>
                      <span className="text-blue-600 font-semibold ml-2">{m.viewsHis}</span>
                      <span className="text-gray-400 ml-1.5">/ {m.viewsYours}</span>
                    </div>
                    <div className="text-[9px] text-gray-400 mt-0.5">{m.liveViews} live · {m.preViews} pre</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{m.uniqueTotal}</span>
                    <span className="text-blue-600 font-semibold ml-2">{m.uniqueHis}</span>
                    <span className="text-gray-400 ml-1.5">/ {m.uniqueYours}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {m.st === "upcoming" ? (
                      <span className="font-bold text-gray-300">—</span>
                    ) : (
                      <>
                        <span className="font-bold text-gray-900">{m.peakTotal}</span>
                        <span className="text-blue-600 font-semibold ml-2">{m.peakHis}</span>
                        <span className="text-gray-400 ml-1.5">/ {m.peakYours}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums hidden md:table-cell">{fmtDur(m.avgDuration)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] text-gray-400 hidden lg:table-cell">{fmtDate(m.lastViewed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
