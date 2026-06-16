"use client";

import { useEffect, useState, useCallback } from "react";
import ChartWrapper from "@/components/admin/ChartWrapper";
import StreamOverrideModal from "@/components/admin/StreamOverrideModal";
import { getAllMatches, getMatchStatus } from "@/lib/api";
import { normTitle } from "@/lib/match-merge";
import { visibleInterval } from "@/lib/poll";

// PULSE — real-time only. What is happening on the site this minute. Historical
// numbers live on Matches (per-match history) and Analytics (windowed); stream
// control lives on Streams. Nothing here is historical or a leaderboard.

interface LiveData {
  onlineNow: number;
  liveViewers: number;
  totalActive: number;
  activeMatches: { match_id: string; viewers: number; peak: number; unique: number | null }[];
  matchRecords: { match_id: string; match_title: string | null; sport: string | null; peak_viewers: number; peak_at: string | null; unique_viewers: number; updated_at: string }[];
  activePages: { path: string; viewers: number }[];
  recentActivity: { path: string; device_type: string; created_at: string }[];
}

interface OverrideRow { id: number; match_id: string; enabled: boolean }

export default function PulsePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [feedStatus, setFeedStatus] = useState<Record<string, "live" | "upcoming" | "ended"> | null>(null);
  const [titleStatus, setTitleStatus] = useState<Record<string, "live" | "upcoming" | "ended"> | null>(null);
  const [overrideModal, setOverrideModal] = useState<{ matchId: string; append: boolean; title: string } | null>(null);

  useEffect(() => {
    let on = true;
    const load = () =>
      getAllMatches()
        .then((ms) => {
          if (!on) return;
          const map: Record<string, "live" | "upcoming" | "ended"> = {};
          const tmap: Record<string, "live" | "upcoming" | "ended"> = {};
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

  function getMatchTitle(matchId: string): string {
    return matchId.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || matchId;
  }

  const rowStatus = (matchId: string): "live" | "upcoming" | "ended" | null => {
    if (!feedStatus) return null;
    const parts = matchId.split("--");
    const feedId = parts.length > 1 ? parts.slice(1).join("--") : matchId;
    if (feedStatus[feedId]) return feedStatus[feedId];
    // Match by fixture name, ignoring any language/extra suffix in parentheses
    // e.g. "Qatar vs Switzerland (German & Spanish)" -> "Qatar vs Switzerland",
    // so a duplicate language feed inherits the real fixture's live status.
    const baseTitle = normTitle(titleFor(matchId).replace(/\([^)]*\)/g, " "));
    if (titleStatus?.[baseTitle]) return titleStatus[baseTitle];
    const byTitle = titleStatus?.[normTitle(getMatchTitle(matchId))];
    if (byTitle) return byTitle;
    const isCustom = parts[0] === "admin" || /^(live-)?event/i.test(parts[0]) || parts.length === 1;
    return isCustom ? null : "ended";
  };

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/admin/live-stats")
        .then((r) => r.json())
        .then((d) => { setData(d); setLastUpdated(new Date()); })
        .catch(console.error);
    };
    return visibleInterval(fetchData, 30_000);
  }, []);

  const loadOverrides = useCallback(() => {
    fetch("/api/admin/stream-override?all=true")
      .then((r) => r.json())
      .then((d) => setOverrides(d.overrides || []))
      .catch(console.error);
  }, []);
  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  function titleFor(matchId: string): string {
    const rec = data?.matchRecords?.find((r) => r.match_id === matchId);
    return rec?.match_title || getMatchTitle(matchId);
  }

  // Friendly label for a page path in "Live active page": Home for "/", the real
  // match title for /watch/<id> pages, otherwise the prettified path.
  function pageLabel(path: string): string {
    if (!path || path === "/") return "Home";
    if (path.startsWith("/watch/")) return titleFor(decodeURIComponent(path.slice(7)));
    const s = path.replace(/^\//, "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function renameMatch(matchId: string) {
    const name = window.prompt("New match name (shown to visitors on live lists and used in analytics):", titleFor(matchId));
    if (!name || !name.trim() || name.trim() === titleFor(matchId)) return;
    await fetch("/api/admin/match-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, display_title: name.trim() }),
    });
    fetch("/api/admin/live-stats").then((r) => r.json()).then((d) => { setData(d); setLastUpdated(new Date()); }).catch(() => {});
  }

  const matchHasOverride = (matchId: string) => overrides.some((o) => o.match_id === matchId && o.enabled);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Viewers parked on ended matches don't count as live.
  // Viewers parked on ended OR upcoming (not-yet-kicked-off) pages don't count
  // as watching live — live means a live match only.
  const nonLiveViewers = feedStatus
    ? data.activeMatches
        .filter((m) => { const s = rowStatus(m.match_id); return s === "ended" || s === "upcoming"; })
        .reduce((sum, m) => sum + m.viewers, 0)
    : 0;
  const endedViewers = feedStatus
    ? data.activeMatches.filter((m) => rowStatus(m.match_id) === "ended").reduce((sum, m) => sum + m.viewers, 0)
    : 0;
  const trueLiveViewers = Math.max(0, (data.liveViewers ?? 0) - nonLiveViewers);
  // People sitting on a pre-kickoff (upcoming) match page — waiting, not watching.
  const waitingViewers = feedStatus
    ? data.activeMatches.filter((m) => rowStatus(m.match_id) === "upcoming").reduce((sum, m) => sum + m.viewers, 0)
    : 0;

  // Live matches get their own container; the "Live active page" list below
  // covers everyone else (including everyone on non-match pages).
  const liveActive = data.activeMatches.filter((m) => rowStatus(m.match_id) === "live");

  // Shared row used by both containers.
  const renderActiveRow = (m: { match_id: string; viewers: number; peak?: number; unique?: number | null }) => (
    <div key={m.match_id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50">
      <span className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-[13px] text-gray-700 truncate min-w-0">{titleFor(m.match_id)}</span>
        <button onClick={() => renameMatch(m.match_id)} title="Rename this match" className="text-[12px] text-gray-300 hover:text-gray-600 shrink-0">✏️</button>
        {rowStatus(m.match_id) === "ended" && (
          <span className="text-[9px] font-black text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded shrink-0">ENDED</span>
        )}
        {rowStatus(m.match_id) === "upcoming" && (
          <span className="text-[9px] font-black text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded shrink-0">SOON</span>
        )}
        {rowStatus(m.match_id) === "live" && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
          </span>
        )}
      </span>
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end leading-tight">
          <span className="flex items-center gap-1.5">
            {rowStatus(m.match_id) === "ended" ? (
              <span className="text-[10px] text-gray-400">{m.viewers} on page</span>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[13px] font-bold text-emerald-600 tabular-nums">{m.viewers}</span>
              </>
            )}
          </span>
          {rowStatus(m.match_id) === "live" && typeof m.peak === "number" && m.peak > 0 && (
            <span className="text-[9px] font-semibold text-gray-400 tabular-nums">peak {m.peak}</span>
          )}
        </div>
        {matchHasOverride(m.match_id) ? (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">OVERRIDDEN</span>
        ) : (
          <button
            onClick={() => setOverrideModal({ matchId: m.match_id, append: false, title: getMatchTitle(m.match_id) })}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
          >
            Override
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pulse</h1>
          <p className="text-[13px] text-gray-500">Live, right now — refreshes every 30s.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Updated {lastUpdated.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Real-time headline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 text-center">
          <p className="text-3xl sm:text-5xl font-black text-emerald-600 tabular-nums">{data.onlineNow ?? data.totalActive}</p>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-2 font-medium">Online Now</p>
          <p className="text-[10px] text-gray-400">on the site</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 text-center">
          <p className="text-3xl sm:text-5xl font-black text-emerald-600 tabular-nums">{trueLiveViewers}</p>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-2 font-medium">Watching Live</p>
          <p className="text-[10px] text-gray-400">on a stream now</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 text-center">
          <p className="text-3xl sm:text-5xl font-black text-emerald-600 tabular-nums">{waitingViewers}</p>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-2 font-medium">Waiting</p>
          <p className="text-[10px] text-gray-400">pre-kickoff</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 text-center">
          <p className="text-3xl sm:text-5xl font-black text-emerald-600 tabular-nums">{endedViewers}</p>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-2 font-medium">Match Ended</p>
          <p className="text-[10px] text-gray-400">on an ended page</p>
        </div>
      </div>

      {/* Live matches get their own priority container */}
      <ChartWrapper title="🔴 Watching live now" className="border-red-200 ring-1 ring-red-100">
        {liveActive.length > 0 ? (
          <div className="space-y-2">{liveActive.map(renderActiveRow)}</div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No one is watching a live match right now</p>
        )}
      </ChartWrapper>

      <ChartWrapper title="Live active page">
        {data.activePages.length > 0 ? (
          <div className="space-y-2">
            {data.activePages.map((p) => (
              <div key={p.path} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50">
                <span className="text-[13px] text-gray-700 truncate min-w-0">{pageLabel(p.path)}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[13px] font-bold text-emerald-600 tabular-nums">{p.viewers}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No one online right now</p>
        )}
      </ChartWrapper>

      <ChartWrapper title="Recent Activity">
        {data.recentActivity.length > 0 ? (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{a.device_type === "mobile" ? "📱" : "💻"}</span>
                  <span className="text-gray-700 font-mono">{a.path}</span>
                </div>
                <span className="text-gray-400 shrink-0">
                  {new Date(a.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
        )}
      </ChartWrapper>

      {overrideModal && (
        <StreamOverrideModal
          matchId={overrideModal.matchId}
          matchTitle={overrideModal.title}
          appendMode={overrideModal.append}
          onClose={() => setOverrideModal(null)}
          onApplied={loadOverrides}
        />
      )}
    </div>
  );
}
