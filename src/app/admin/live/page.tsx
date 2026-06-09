"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import ChartWrapper from "@/components/admin/ChartWrapper";

interface LiveData {
  totalActive: number;
  activeMatches: { match_id: string; viewers: number }[];
  activePages: { path: string; viewers: number }[];
  recentActivity: { path: string; device_type: string; created_at: string }[];
}

interface FallbackStream {
  source: string;
  title: string;
  embedUrl: string;
  server: string;
}

interface OverrideRow {
  id: number;
  match_id: string;
  match_title: string;
  embed_url: string;
  source: string;
  server_label: string;
  replace_original: boolean;
  enabled: boolean;
}

export default function LiveMonitorPage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  // Override modal
  const [overrideModal, setOverrideModal] = useState<string | null>(null);
  const [appendMode, setAppendMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fallbackResults, setFallbackResults] = useState<FallbackStream[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    function fetchData() {
      fetch("/api/admin/live-stats")
        .then((r) => r.json())
        .then((d) => { setData(d); setLastUpdated(new Date()); })
        .catch(console.error);
    }
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, []);

  const loadOverrides = useCallback(() => {
    fetch("/api/admin/stream-override?all=true")
      .then((r) => r.json())
      .then((d) => setOverrides(d.overrides || []))
      .catch(console.error);
  }, []);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  function getMatchTitle(matchId: string): string {
    return matchId.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || matchId;
  }

  async function searchFallbacks(matchId: string, isAppend = false) {
    setOverrideModal(matchId);
    setAppendMode(isAppend);
    setSearching(true);
    setFallbackResults([]);
    setSelected(new Set());
    setReplaceOriginal(false);
    setManualUrl("");

    const title = getMatchTitle(matchId);
    try {
      const res = await fetch(`/api/admin/fallback-search?title=${encodeURIComponent(title)}&sport=football`);
      const data = await res.json();
      setFallbackResults(data.streams || []);
    } catch {
      setFallbackResults([]);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function applySelected(matchId: string) {
    const title = getMatchTitle(matchId);
    const streams = Array.from(selected).map((i) => ({
      embed_url: fallbackResults[i].embedUrl,
      source: fallbackResults[i].source,
      server_label: fallbackResults[i].server,
    }));
    if (streams.length === 0) return;

    await fetch("/api/admin/stream-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, match_title: title, replace_original: replaceOriginal, streams, append: appendMode }),
    });
    loadOverrides();
    setOverrideModal(null);
  }

  async function applyManual(matchId: string) {
    if (!manualUrl) return;
    const title = getMatchTitle(matchId);
    await fetch("/api/admin/stream-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, match_title: title, replace_original: replaceOriginal, embed_url: manualUrl, source: "manual", server_label: "Manual", append: appendMode }),
    });
    loadOverrides();
    setOverrideModal(null);
  }

  async function toggleStream(id: number, enabled: boolean) {
    await fetch("/api/admin/stream-override", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setOverrides((prev) => prev.map((o) => o.id === id ? { ...o, enabled } : o));
  }

  async function toggleMode(matchId: string, replace: boolean) {
    await fetch("/api/admin/stream-override", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, replace_original: replace }),
    });
    setOverrides((prev) => prev.map((o) => o.match_id === matchId ? { ...o, replace_original: replace } : o));
  }

  async function removeStream(id: number) {
    await fetch(`/api/admin/stream-override?id=${id}`, { method: "DELETE" });
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  }

  async function removeAllForMatch(matchId: string) {
    await fetch(`/api/admin/stream-override?match_id=${encodeURIComponent(matchId)}`, { method: "DELETE" });
    setOverrides((prev) => prev.filter((o) => o.match_id !== matchId));
  }

  const matchHasOverride = (matchId: string) => overrides.some((o) => o.match_id === matchId && o.enabled);

  // Group overrides by match
  const overridesByMatch: Record<string, OverrideRow[]> = {};
  for (const o of overrides) {
    if (!overridesByMatch[o.match_id]) overridesByMatch[o.match_id] = [];
    overridesByMatch[o.match_id].push(o);
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Live Monitor</h1>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Updated {lastUpdated.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-6xl font-black text-gray-900 tabular-nums">{data.totalActive}</p>
        <p className="text-sm text-gray-500 mt-2 font-medium">Active Viewers Right Now</p>
      </div>

      {/* Stream Overrides — detailed per match */}
      {Object.keys(overridesByMatch).length > 0 && (
        <ChartWrapper title="Stream Overrides">
          <div className="space-y-4">
            {Object.entries(overridesByMatch).map(([matchId, items]) => {
              const isReplace = items[0]?.replace_original ?? false;
              const enabledCount = items.filter((o) => o.enabled).length;

              return (
                <div key={matchId} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Match header */}
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-bold text-gray-900">{items[0].match_title || getMatchTitle(matchId)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{enabledCount} active stream{enabledCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => searchFallbacks(matchId, true)}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        + Add More
                      </button>
                      <button
                        onClick={() => removeAllForMatch(matchId)}
                        className="text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Remove All
                      </button>
                    </div>
                  </div>

                  {/* Mode toggle */}
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-500">Mode</span>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => toggleMode(matchId, false)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${!isReplace ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                      >
                        Add alongside
                      </button>
                      <button
                        onClick={() => toggleMode(matchId, true)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${isReplace ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                      >
                        Replace originals
                      </button>
                    </div>
                  </div>

                  {/* Individual streams */}
                  <div className="divide-y divide-gray-50">
                    {items.map((o) => (
                      <div key={o.id} className={`px-4 py-2.5 flex items-center gap-3 ${!o.enabled ? "opacity-50" : ""}`}>
                        {/* Toggle */}
                        <button
                          onClick={() => toggleStream(o.id, !o.enabled)}
                          className={`w-8 h-4.5 rounded-full transition-colors shrink-0 relative ${o.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                          style={{ minWidth: 32, height: 18 }}
                        >
                          <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${o.enabled ? "translate-x-[15px]" : "translate-x-0.5"}`} />
                        </button>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-800 truncate">
                            {o.server_label || o.source}
                          </p>
                          <p className="text-[10px] text-gray-400">{o.source}</p>
                        </div>

                        {/* Status */}
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${o.enabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                          {o.enabled ? "ACTIVE" : "OFF"}
                        </span>

                        {/* Remove */}
                        <button
                          onClick={() => removeStream(o.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ChartWrapper>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartWrapper title="Active Matches">
          {data.activeMatches.length > 0 ? (
            <div className="space-y-2">
              {data.activeMatches.map((m) => (
                <div key={m.match_id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-[13px] text-gray-700 truncate max-w-[45%]">{getMatchTitle(m.match_id)}</span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[13px] font-bold text-gray-900 tabular-nums">{m.viewers}</span>
                    </span>
                    {matchHasOverride(m.match_id) ? (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">OVERRIDDEN</span>
                    ) : (
                      <button
                        onClick={() => searchFallbacks(m.match_id)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                      >
                        Override
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No one watching matches right now</p>
          )}
        </ChartWrapper>

        <ChartWrapper title="Viewers by Page">
          {data.activePages.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.activePages.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="path" tick={{ fontSize: 10 }} width={80} tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + "..." : v} />
                <Tooltip />
                <Bar dataKey="viewers" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No active viewers</p>
          )}
        </ChartWrapper>
      </div>

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

      {/* Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOverrideModal(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-gray-900">Add Override Streams</h3>
                <button onClick={() => setOverrideModal(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[12px] text-gray-500 mt-1">{getMatchTitle(overrideModal)}</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Replace toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-[12px] font-bold text-gray-700">Replace original streams</p>
                  <p className="text-[10px] text-gray-400">
                    {replaceOriginal ? "Originals will be hidden from users" : "Fallbacks show alongside originals"}
                  </p>
                </div>
                <button
                  onClick={() => setReplaceOriginal(!replaceOriginal)}
                  className={`relative w-10 rounded-full transition-colors ${replaceOriginal ? "bg-emerald-500" : "bg-gray-300"}`}
                  style={{ height: 20 }}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${replaceOriginal ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* Manual URL */}
              <div>
                <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Paste Embed URL</label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <button
                    onClick={() => applyManual(overrideModal)}
                    disabled={!manualUrl}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Fallback results with checkboxes */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Auto-Search Results</label>
                  {selected.size > 0 && (
                    <button
                      onClick={() => applySelected(overrideModal)}
                      className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Add {selected.size} Selected
                    </button>
                  )}
                </div>

                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400 ml-3">Searching fallback APIs...</span>
                  </div>
                ) : fallbackResults.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {fallbackResults.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => toggleSelect(i)}
                        className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border transition-colors text-left ${
                          selected.has(i) ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          selected.has(i) ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                        }`}>
                          {selected.has(i) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-900 truncate">{s.title}</p>
                          <p className="text-[10px] text-gray-400">{s.server} &middot; {s.source}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-400 text-center py-6">No matching streams found. Try pasting a URL manually.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
