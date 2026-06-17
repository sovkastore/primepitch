"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllMatches, getMatchStatus } from "@/lib/api";
import { normTitle } from "@/lib/match-merge";
import { SplitStat } from "@/components/partner/SplitStat";

interface PulseMatch {
  match_id: string; title: string; total: number; his: number; yours: number;
  peakTotal: number; peakHis: number; peakYours: number;
}
interface PulsePage { path: string; total: number; his: number; yours: number }
interface Split { total: number; his: number; yours: number }
export interface PulseData { onlineNow?: Split; liveNow?: Split; matches?: PulseMatch[]; pages?: PulsePage[] }

type Status = "live" | "upcoming" | "ended";

function getMatchTitle(matchId: string): string {
  return matchId.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || matchId;
}

export default function PulsePanel({ data, mine }: { data: PulseData | null; mine?: boolean }) {
  // Live fixture feed → real status per match (identical to the main admin Pulse).
  const [feedStatus, setFeedStatus] = useState<Record<string, Status> | null>(null);
  const [titleStatus, setTitleStatus] = useState<Record<string, Status> | null>(null);

  useEffect(() => {
    let on = true;
    const load = () =>
      getAllMatches()
        .then((ms) => {
          if (!on) return;
          const map: Record<string, Status> = {};
          const tmap: Record<string, Status> = {};
          const RANK = { live: 0, upcoming: 1, ended: 2 } as const;
          for (const m of ms) {
            const st = getMatchStatus(m);
            map[String(m.id)] = st;
            const tk = normTitle(m.title);
            if (!tmap[tk] || RANK[st] < RANK[tmap[tk]]) tmap[tk] = st;
          }
          setFeedStatus(map);
          setTitleStatus(tmap);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { on = false; clearInterval(t); };
  }, []);

  const matches = useMemo(() => data?.matches ?? [], [data]);
  const pages = useMemo(() => data?.pages ?? [], [data]);

  const titleFor = (matchId: string): string =>
    matches.find((m) => m.match_id === matchId)?.title || getMatchTitle(matchId);

  // Resolve an active match_id to live/upcoming/ended exactly as the admin Pulse does.
  const rowStatus = (matchId: string): Status | null => {
    if (!feedStatus) return null;
    const parts = matchId.split("--");
    const feedId = parts.length > 1 ? parts.slice(1).join("--") : matchId;
    if (feedStatus[feedId]) return feedStatus[feedId];
    const baseTitle = normTitle(titleFor(matchId).replace(/\([^)]*\)/g, " "));
    if (titleStatus?.[baseTitle]) return titleStatus[baseTitle];
    const byTitle = titleStatus?.[normTitle(getMatchTitle(matchId))];
    if (byTitle) return byTitle;
    const isCustom = parts[0] === "admin" || /^(live-)?event/i.test(parts[0]) || parts.length === 1;
    return isCustom ? null : "ended";
  };

  const sumBy = (want: Status, key: "total" | "his"): number =>
    matches.filter((m) => rowStatus(m.match_id) === want).reduce((acc, m) => acc + (m[key] || 0), 0);

  // Same arithmetic as the admin headline: true-live = on-a-match minus
  // (upcoming + ended); custom/unknown matches stay counted as live.
  const onMatchTotal = data?.liveNow?.total ?? 0;
  const onMatchHis = data?.liveNow?.his ?? 0;
  const upTotal = sumBy("upcoming", "total"), upHis = sumBy("upcoming", "his");
  const endTotal = sumBy("ended", "total"), endHis = sumBy("ended", "his");
  const liveTotal = Math.max(0, onMatchTotal - upTotal - endTotal);
  const liveHis = Math.max(0, onMatchHis - upHis - endHis);
  const liveMatches = matches.filter((m) => rowStatus(m.match_id) === "live");

  const split = (total: number, his: number): Split => ({ total, his, yours: Math.max(0, total - his) });

  function pageLabel(path: string): string {
    if (!path || path === "/") return "Home";
    if (path.startsWith("/watch/")) return titleFor(decodeURIComponent(path.slice(7)));
    const s = path.replace(/^\//, "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const blue = mine ? "me" : "his";
  const grey = mine ? "others" : "yours";

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SplitStat label="Online now" data={data?.onlineNow} mine={mine} hint="on the site" />
        <SplitStat label="Watching live" data={split(liveTotal, liveHis)} mine={mine} hint="on a live stream now" />
        <SplitStat label="Waiting" data={split(upTotal, upHis)} mine={mine} hint="pre-kickoff" />
        <SplitStat label="Match ended" data={split(endTotal, endHis)} mine={mine} hint="on an ended page" />
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
