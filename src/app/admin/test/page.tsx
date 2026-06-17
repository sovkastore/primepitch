"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBadgeUrl } from "@/lib/api";

// Admin-only server control room for football matches.
//
// Flow: pick a match -> every candidate server (streamed.pk echo + PPV fallback +
// anything you paste) is listed and PLAYS INLINE here, exactly as the live watch
// page would show it. You watch each one; the ones that actually play, you tick.
// "Make these live" writes the ticked set as the match's curated servers (viewers
// see ONLY those, in this order — the top one auto-plays) and surfaces the match
// in the public live list. While live you can swap dead servers and add new ones.
//
// It writes only to stream_overrides + match_flags.forced_live, through the same
// endpoints the Streams page uses — so it's one shared system, not a parallel one.

interface Team { name: string; badge?: string }
interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  teams?: { home?: Team; away?: Team };
  sources: { source: string; id: string }[];
}
interface OverrideRow {
  id: number;
  embed_url: string;
  source: string | null;
  server_label: string | null;
  enabled?: boolean;
  position?: number | null;
  created_at?: string;
}
interface Entry {
  match: Match;
  matchId: string;
  status: string;
  overrides?: OverrideRow[];
}
interface ResolvedStream {
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}
interface Candidate {
  embedUrl: string;
  label: string;
  source: string;
  checked: boolean; // part of the desired live set
  live: boolean; // already an enabled override
}

// Accept a bare URL or a full <iframe ...> snippet (pull out the src).
function extractEmbedUrl(raw: string): string {
  const t = raw.trim();
  const m = t.match(/src\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : t).trim();
}

function kickoffLabel(ms: number): string {
  const diffMin = Math.round((ms - Date.now()) / 60000);
  const when = new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  if (diffMin <= 0) return `${when} · started`;
  if (diffMin < 60) return `${when} · in ${diffMin}m`;
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return `${when} · in ${h}h${m ? ` ${m}m` : ""}`;
}

function srcBadge(source: string): { label: string; cls: string } {
  if (source.includes("ppv")) return { label: "PPV", cls: "bg-blue-50 text-blue-600" };
  if (source === "manual") return { label: "Manual", cls: "bg-amber-50 text-amber-600" };
  if (source.includes("echo") || source.includes("alpha") || source.includes("bravo") || source.includes("delta"))
    return { label: "streamed.pk", cls: "bg-emerald-50 text-emerald-600" };
  return { label: source || "server", cls: "bg-gray-100 text-gray-500" };
}

function sortOverrides(a: OverrideRow, b: OverrideRow): number {
  const pa = a.position ?? null, pb = b.position ?? null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return (a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0);
}

export default function TestStreamPage() {
  const [tab, setTab] = useState<"upcoming" | "live">("upcoming");
  const [data, setData] = useState<{ live: Entry[]; upcoming: Entry[] }>({ live: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Entry | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [resolving, setResolving] = useState(false);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [applying, setApplying] = useState<"" | "live" | "stop">("");
  const [flash, setFlash] = useState("");

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/all-matches");
      const d = await res.json();
      const football = (arr: Entry[]) =>
        (arr || []).filter((e) => e.match?.category === "football").sort((a, b) => a.match.date - b.match.date);
      setData({ live: football(d.live), upcoming: football(d.upcoming) });
    } catch {
      setData({ live: [], upcoming: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  // Build the candidate list for a match: current live servers first (enabled
  // overrides, in display order, pre-ticked), then every other server streamed.pk
  // / PPV resolves for it. Read-only resolve — ungated so pre-kickoff feeds show.
  const selectMatch = useCallback(async (e: Entry) => {
    setSelected(e);
    setCandidates([]);
    setWatchUrl(null);
    setIframeLoaded(false);
    setManualUrl("");
    setFlash("");
    setResolving(true);
    try {
      const sources = e.match.sources?.length
        ? e.match.sources
        : [{ source: e.matchId.split("--")[0], id: e.matchId.split("--")[1] }];
      const [ovRes, ...streamRes] = await Promise.all([
        fetch(`/api/admin/stream-override?match_id=${encodeURIComponent(e.matchId)}`)
          .then((r) => r.json()).catch(() => ({ overrides: [] })),
        ...sources.map((s) =>
          fetch(`/api/match-streams/${encodeURIComponent(`${s.source}--${s.id}`)}` +
            `?title=${encodeURIComponent(e.match.title)}&sport=${encodeURIComponent(e.match.category)}`)
            .then((r) => r.json()).catch(() => ({ streams: [] }))
        ),
      ]);

      const seen = new Set<string>();
      const list: Candidate[] = [];

      const overrides: OverrideRow[] = (ovRes.overrides || [])
        .filter((o: OverrideRow) => o.enabled !== false)
        .sort(sortOverrides);
      for (const o of overrides) {
        if (!o.embed_url || seen.has(o.embed_url)) continue;
        seen.add(o.embed_url);
        list.push({ embedUrl: o.embed_url, label: o.server_label || "Server", source: o.source || "manual", checked: true, live: true });
      }
      for (const sr of streamRes) {
        for (const s of (sr.streams || []) as ResolvedStream[]) {
          if (!s.embedUrl || seen.has(s.embedUrl)) continue;
          seen.add(s.embedUrl);
          list.push({ embedUrl: s.embedUrl, label: s.language || `Server ${s.streamNo}`, source: s.source || "echo", checked: false, live: false });
        }
      }

      setCandidates(list);
      setWatchUrl(list[0]?.embedUrl ?? null);
    } finally {
      setResolving(false);
    }
  }, []);

  function watch(url: string) { setWatchUrl(url); setIframeLoaded(false); }
  function toggleCheck(url: string) {
    setCandidates((cs) => cs.map((c) => (c.embedUrl === url ? { ...c, checked: !c.checked } : c)));
  }
  function move(url: string, dir: -1 | 1) {
    setCandidates((cs) => {
      const i = cs.findIndex((c) => c.embedUrl === url);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = cs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addManual() {
    const url = extractEmbedUrl(manualUrl);
    if (!url) return;
    setCandidates((cs) => (cs.some((c) => c.embedUrl === url) ? cs : [...cs, { embedUrl: url, label: "Manual", source: "manual", checked: true, live: false }]));
    watch(url);
    setManualUrl("");
  }

  const checkedList = candidates.filter((c) => c.checked);
  const liveCount = candidates.filter((c) => c.live).length;

  async function makeLive() {
    if (!selected || checkedList.length === 0) return;
    setApplying("live");
    try {
      // Replace the curated set with exactly the ticked servers, in display order
      // (position = index). replace_original ON => viewers see only these.
      await fetch("/api/admin/stream-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: selected.matchId,
          match_title: selected.match.title,
          match_data: selected.match,
          replace_original: true,
          append: false,
          streams: checkedList.map((c, i) => ({ embed_url: c.embedUrl, source: c.source, server_label: c.label, position: i })),
        }),
      });
      // Surface the match in the public live list (needs match_data).
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: selected.matchId, match_data: selected.match, forced_live: true }),
      });
      setCandidates((cs) => cs.map((c) => ({ ...c, live: c.checked })));
      setFlash(`✓ ${checkedList.length} server${checkedList.length > 1 ? "s" : ""} live — viewers see them now`);
      loadMatches();
    } finally {
      setApplying("");
    }
  }

  async function stopServing() {
    if (!selected) return;
    setApplying("stop");
    try {
      await fetch(`/api/admin/stream-override?match_id=${encodeURIComponent(selected.matchId)}`, { method: "DELETE" });
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: selected.matchId, match_data: selected.match, forced_live: false }),
      });
      setCandidates((cs) => cs.map((c) => ({ ...c, live: false })));
      setFlash("Stopped — curated servers cleared (falls back to streamed.pk)");
      loadMatches();
    } finally {
      setApplying("");
    }
  }

  const entries = tab === "live" ? data.live : data.upcoming;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? entries.filter((e) => e.match.title.toLowerCase().includes(q)) : entries;
  }, [entries, search]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Test Stream</h1>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">ADMIN ONLY</span>
        </div>
        <p className="text-[13px] text-gray-500 mt-1">
          Watch each server play here, tick the ones that work, then make exactly those go live.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(["upcoming", "live"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-bold capitalize transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {t} ({(t === "live" ? data.live : data.upcoming).length})
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        {/* Match list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "74vh" }}>
          <div className="p-3 border-b border-gray-100 flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search football…"
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <button onClick={loadMatches} title="Refresh" className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-12">No {tab} football matches.</p>
            ) : (
              filtered.map((e) => {
                const isSel = selected?.matchId === e.matchId;
                const servers = e.overrides?.filter((o) => o.enabled !== false).length ?? 0;
                const home = e.match.teams?.home;
                return (
                  <button
                    key={e.matchId}
                    onClick={() => selectMatch(e)}
                    className={`w-full text-left px-3.5 py-3 border-b border-gray-50 transition-colors ${isSel ? "bg-emerald-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      {home?.badge && <img src={getBadgeUrl(home.badge)} alt="" className="w-4 h-4 object-contain shrink-0" />}
                      <p className="text-[13px] font-semibold text-gray-900 truncate flex-1">{e.match.title}</p>
                      {servers > 0 && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">{servers} live</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{kickoffLabel(e.match.date)}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Curation panel */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center text-center py-24 px-6">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-gray-400 mt-3">Pick a match to test its servers.</p>
            </div>
          ) : (
            <div>
              <div className="p-4 border-b border-gray-100">
                <p className="text-[14px] font-bold text-gray-900">{selected.match.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {kickoffLabel(selected.match.date)}
                  {liveCount > 0 && <span className="ml-2 text-emerald-600 font-semibold">· {liveCount} live now</span>}
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Player */}
                <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  {resolving ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[12px] text-gray-400">Finding servers…</p>
                    </div>
                  ) : watchUrl ? (
                    <>
                      <iframe key={watchUrl} src={watchUrl} className="absolute inset-0 w-full h-full" allowFullScreen allow="encrypted-media" onLoad={() => setIframeLoaded(true)} />
                      {!iframeLoaded && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black"><div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                      <p className="text-[13px] font-semibold text-gray-300">No servers online yet</p>
                      <p className="text-[11px] text-gray-500">streamed.pk isn’t serving this match yet, or paste one below.</p>
                    </div>
                  )}
                </div>

                {/* Candidate servers */}
                {candidates.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1.5">
                      {candidates.length} server{candidates.length > 1 ? "s" : ""} found · tick the ones that play
                    </p>
                    <div className="space-y-1.5">
                      {candidates.map((c, i) => {
                        const b = srcBadge(c.source);
                        const playing = watchUrl === c.embedUrl;
                        return (
                          <div key={c.embedUrl} className={`flex items-center gap-2 py-2 px-2.5 rounded-xl border ${c.checked ? "bg-emerald-50/60 border-emerald-200" : "bg-gray-50 border-gray-100"}`}>
                            <button onClick={() => toggleCheck(c.embedUrl)} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${c.checked ? "bg-emerald-500 border-emerald-500" : "border-gray-300 bg-white"}`}>
                              {c.checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </button>
                            <span className="text-[11px] font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-gray-800 truncate">{c.label}</p>
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${b.cls}`}>{b.label}</span>
                            {c.live && <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded">LIVE</span>}
                            <button onClick={() => watch(c.embedUrl)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${playing ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                              {playing ? "Playing" : "Watch"}
                            </button>
                            <div className="flex flex-col">
                              <button onClick={() => move(c.embedUrl, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 leading-none">▲</button>
                              <button onClick={() => move(c.embedUrl, 1)} disabled={i === candidates.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 leading-none">▼</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Manual add */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Add a server — paste URL or &lt;iframe&gt; code</label>
                  <div className="flex gap-2 mt-1.5">
                    <input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://...  or  <iframe src=...>"
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <button onClick={addManual} disabled={!manualUrl} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-colors">Add</button>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400 mt-3 mb-2">
                    Viewers see <b>only the ticked servers</b>, in this order — the top one auto-plays. Reorder with ▲▼.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={makeLive}
                      disabled={checkedList.length === 0 || applying !== ""}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white text-[13px] font-bold rounded-xl transition-colors"
                    >
                      {applying === "live" ? "Going live…" : `Make these live (${checkedList.length})`}
                    </button>
                    {liveCount > 0 && (
                      <button
                        onClick={stopServing}
                        disabled={applying !== ""}
                        className="px-4 py-2.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 text-[13px] font-bold rounded-xl transition-colors"
                      >
                        {applying === "stop" ? "Stopping…" : "Stop serving"}
                      </button>
                    )}
                    <Link href="/admin/streams" className="ml-auto text-[12px] font-semibold text-gray-400 hover:text-gray-700 underline">Open Streams</Link>
                  </div>
                  {flash && <p className="text-[12px] font-semibold text-emerald-600 mt-2.5">{flash}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
