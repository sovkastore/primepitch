"use client";

import { useMemo } from "react";
import { SplitStat } from "@/components/partner/SplitStat";
import { useFeedStatus, matchTitleFromId } from "@/components/partner/useFeedStatus";

interface PulseMatch {
  match_id: string; title: string; total: number; his: number; yours: number;
  peakTotal: number; peakHis: number; peakYours: number;
}
interface PulsePage { path: string; total: number; his: number; yours: number }
interface Split { total: number; his: number; yours: number }
export interface PulseData { onlineNow?: Split; liveNow?: Split; matches?: PulseMatch[]; pages?: PulsePage[] }

export default function PulsePanel({ data, mine }: { data: PulseData | null; mine?: boolean }) {
  const { rowStatus } = useFeedStatus();
  const matches = useMemo(() => data?.matches ?? [], [data]);
  const pages = useMemo(() => data?.pages ?? [], [data]);

  const titleFor = (matchId: string): string =>
    matches.find((m) => m.match_id === matchId)?.title || matchTitleFromId(matchId);

  const sumBy = (want: string, key: "total" | "his"): number =>
    matches.filter((m) => rowStatus(m.match_id, m.title) === want).reduce((acc, m) => acc + (m[key] || 0), 0);

  const upTotal = sumBy("upcoming", "total"), upHis = sumBy("upcoming", "his");
  const endTotal = sumBy("ended", "total"), endHis = sumBy("ended", "his");
  // Watching Live = exactly the sum of the genuinely-live matches below (mirrors
  // the admin Pulse). rowStatus already counts Force-live/PPV via the served set.
  const liveTotal = sumBy("live", "total");
  const liveHis = sumBy("live", "his");
  const liveMatches = matches.filter((m) => rowStatus(m.match_id, m.title) === "live");

  const split = (total: number, his: number): Split => ({ total, his, yours: Math.max(0, total - his) });
  const blue = mine ? "me" : "his";
  const grey = mine ? "others" : "yours";

  function pageLabel(path: string): string {
    if (!path || path === "/") return "Home";
    if (path.startsWith("/watch/")) return titleFor(decodeURIComponent(path.slice(7)));
    const s = path.replace(/^\//, "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SplitStat label="Online Now" data={data?.onlineNow} mine={mine} hint="on the site" />
        <SplitStat label="Watching Live" data={split(liveTotal, liveHis)} mine={mine} hint="on a stream now" />
        <SplitStat label="Waiting" data={split(upTotal, upHis)} mine={mine} hint="pre-kickoff" />
        <SplitStat label="Match Ended" data={split(endTotal, endHis)} mine={mine} hint="on an ended page" />
      </div>

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">🔴 Watching live now</h2>
      {liveMatches.length === 0 ? (
        <p className="text-sm text-gray-400">No one is watching a live match right now.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-red-200 ring-1 ring-red-100 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[520px]">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-3 py-2">Match</th>
                <th className="text-right font-bold px-3 py-2">{`Watching now (total / ${blue} / ${grey})`}</th>
                <th className="text-right font-bold px-3 py-2">{`Peak (total / ${blue} / ${grey})`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liveMatches.map((m) => (
                <tr key={m.match_id}>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{m.title}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{m.total}</span>
                    <span className="text-blue-600 font-semibold ml-2">{m.his}</span>
                    <span className="text-gray-400 ml-1.5">/ {m.yours}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{m.peakTotal}</span>
                    <span className="text-blue-600 font-semibold ml-2">{m.peakHis}</span>
                    <span className="text-gray-400 ml-1.5">/ {m.peakYours}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Live active page</h2>
      {pages.length === 0 ? (
        <p className="text-sm text-gray-400">No one online right now.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[420px]">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-3 py-2">Page</th>
                <th className="text-right font-bold px-3 py-2">{`Total / ${blue} / ${grey}`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map((p) => (
                <tr key={p.path}>
                  <td className="px-3 py-2.5 text-gray-700 truncate max-w-[240px]">{pageLabel(p.path)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{p.total}</span>
                    <span className="text-blue-600 font-semibold ml-2">{p.his}</span>
                    <span className="text-gray-400 ml-1.5">/ {p.yours}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
