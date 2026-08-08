"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBadgeUrl, SPORT_LABELS } from "@/lib/api";
import StreamOverrideModal from "@/components/admin/StreamOverrideModal";
import MatchNoticeModal from "@/components/admin/MatchNoticeModal";
import { visibleInterval } from "@/lib/poll";

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
  match_id: string;
  embed_url: string;
  source: string | null;
  server_label: string | null;
  replace_original: boolean | null;
  enabled: boolean;
}
interface FlagRow {
  match_id: string;
  hidden: boolean;
  hide_one: boolean;
  forced_live: boolean;
  featured: boolean;
  disable_auto: boolean;
  auto_fallback?: boolean | null;
  force_ended: boolean;
  hot: boolean;
  popular?: boolean;
  custom_notice?: string | null;
}
interface Entry {
  match: Match;
  matchId: string;
  status: string;
  serving: string;
  overrides: OverrideRow[];
  flags: FlagRow | null;
}

// Effective Auto-fallback toggle state. Football is OFF by default; an explicit
// per-match choice (auto_fallback) wins. Other sports stay ON unless turned off.
function autoOn(flags: FlagRow | null | undefined, sport: string): boolean {
  if (flags?.auto_fallback != null) return flags.auto_fallback;
  if (flags?.disable_auto) return false;
  return sport.toLowerCase() !== "football";
}

interface ResolvedStream { id: string; streamNo: number; language: string; hd: boolean; embedUrl: string; source: string }
interface ServerState { loading: boolean; streams: ResolvedStream[]; serving: string; error: boolean }

const SERVING: Record<string, { label: string; cls: string }> = {
  echo:     { label: "Echo",         cls: "bg-emerald-50 text-emerald-600" },
  auto:     { label: "Auto-fallback", cls: "bg-blue-50 text-blue-600" },
  override: { label: "Manual",       cls: "bg-amber-50 text-amber-600" },
  none:     { label: "No stream",    cls: "bg-red-50 text-red-500" },
  upcoming: { label: "Upcoming",     cls: "bg-gray-100 text-gray-500" },
};

const TOGGLE_ON: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
};

function Toggle({ on, onClick, color = "emerald" }: { on: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full transition-colors shrink-0 ${on ? TOGGLE_ON[color] || TOGGLE_ON.emerald : "bg-gray-300"}`}
      style={{ width: 36, height: 20 }}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function StreamsManagerPage() {
  const [live, setLive] = useState<Entry[]>([]);
  const [upcoming, setUpcoming] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "upcoming">("live");
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [modal, setModal] = useState<{ matchId: string; title: string; sport: string; matchData: Match; append: boolean } | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ matchId: string; title: string; matchData: Match; currentNotice: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Accordion: which card is expanded, and a cache of its resolved servers.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [servers, setServers] = useState<Record<string, ServerState>>({});
  // Tracks per-server "Use" button state, keyed by `${matchId}::${embedUrl}`.
  const [pinning, setPinning] = useState<Record<string, "saving" | "done">>({});

  const loadServers = useCallback(async (e: Entry, force = false) => {
    if (!force && servers[e.matchId] && !servers[e.matchId].error) return;
    setServers((p) => ({ ...p, [e.matchId]: { loading: true, streams: [], serving: e.serving, error: false } }));
    try {
      const res = await fetch(`/api/match-streams/${encodeURIComponent(e.matchId)}?title=${encodeURIComponent(e.match.title)}&sport=${encodeURIComponent(e.match.category)}`);
      const d = await res.json();
      setServers((p) => ({ ...p, [e.matchId]: { loading: false, streams: Array.isArray(d.streams) ? d.streams : [], serving: d.serving || "none", error: false } }));
    } catch {
      setServers((p) => ({ ...p, [e.matchId]: { loading: false, streams: [], serving: "none", error: true } }));
    }
  }, [servers]);

  const toggleExpand = useCallback((e: Entry) => {
    setExpanded((cur) => {
      const next = cur === e.matchId ? null : e.matchId;
      if (next) loadServers(e);
      return next;
    });
  }, [loadServers]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/all-matches");
      const d = await res.json();
      setLive(d.live || []);
      setUpcoming(d.upcoming || []);
      setLastUpdated(new Date());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return visibleInterval(fetchData, 60_000);
  }, [fetchData]);

  const setEntries = tab === "live" ? setLive : setUpcoming;

  function patchEntry(matchId: string, fn: (e: Entry) => Entry) {
    const apply = (arr: Entry[]) => arr.map((e) => (e.matchId === matchId ? fn(e) : e));
    setLive(apply);
    setUpcoming(apply);
  }

  async function setFlag(e: Entry, patch: Partial<FlagRow>) {
    const base: FlagRow = e.flags ?? { match_id: e.matchId, hidden: false, hide_one: false, forced_live: false, featured: false, disable_auto: false, force_ended: false, hot: false, popular: false, custom_notice: null };
    const next = { ...base, ...patch };
    patchEntry(e.matchId, (x) => ({ ...x, flags: next }));
    await fetch("/api/admin/match-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: e.matchId, match_data: e.match, ...patch }),
    }).catch(() => {});
  }

  async function toggleOverride(matchId: string, id: number, enabled: boolean) {
    patchEntry(matchId, (e) => ({ ...e, overrides: e.overrides.map((o) => (o.id === id ? { ...o, enabled } : o)) }));
    await fetch("/api/admin/stream-override", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) }).catch(() => {});
  }

  async function editLabel(matchId: string, id: number, server_label: string) {
    patchEntry(matchId, (e) => ({ ...e, overrides: e.overrides.map((o) => (o.id === id ? { ...o, server_label } : o)) }));
    await fetch("/api/admin/stream-override", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, server_label }) }).catch(() => {});
  }

  async function removeOverride(matchId: string, id: number) {
    patchEntry(matchId, (e) => ({ ...e, overrides: e.overrides.filter((o) => o.id !== id) }));
    await fetch(`/api/admin/stream-override?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function setReplaceMode(matchId: string, replace: boolean) {
    patchEntry(matchId, (e) => ({ ...e, overrides: e.overrides.map((o) => ({ ...o, replace_original: replace })) }));
    await fetch("/api/admin/stream-override", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: matchId, replace_original: replace }) }).catch(() => {});
  }

  // Pin a resolved server (e.g. an echo server) as a manual override, added
  // alongside any existing manual servers. Lets admins pick a streamed.pk server
  // straight from the panel instead of pasting an embed URL by hand.
  async function pinServer(e: Entry, s: ResolvedStream) {
    const key = `${e.matchId}::${s.embedUrl}`;
    setPinning((p) => ({ ...p, [key]: "saving" }));
    try {
      const res = await fetch("/api/admin/stream-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: e.matchId,
          match_title: e.match.title,
          match_data: e.match,
          embed_url: s.embedUrl,
          source: s.source || "echo",
          server_label: s.language || `Server ${s.streamNo}`,
          replace_original: e.overrides[0]?.replace_original ?? false,
          append: true,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setPinning((p) => ({ ...p, [key]: "done" }));
      fetchData();
    } catch {
      setPinning((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  // Sports present across all matches (for the filter dropdown)
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    for (const e of [...live, ...upcoming]) set.add(e.match.category);
    return Array.from(set).sort((a, b) => (SPORT_LABELS[a] || a).localeCompare(SPORT_LABELS[b] || b));
  }, [live, upcoming]);

  const inSport = (e: Entry) => sportFilter === "all" || e.match.category === sportFilter;
  const liveCount = live.filter(inSport).length;
  const upcomingCount = upcoming.filter(inSport).length;
  // Fallback health: live matches with no working stream at all.
  const noStreamLive = live.filter((e) => e.serving === "none");

  const entries = tab === "live" ? live : upcoming;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (sportFilter !== "all" && e.match.category !== sportFilter) return false;
      if (q && !(e.match.title.toLowerCase().includes(q) || e.matchId.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [entries, search, sportFilter]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Streams</h1>
        {lastUpdated && (
          <span className="text-[11px] text-gray-400 font-medium">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>
      <p className="text-[13px] text-gray-500 -mt-3">
        Every live &amp; upcoming match — attach a fallback to any of them, force-live, hide, or manage servers.
      </p>

      {/* Fallback health alert — live matches with no working stream */}
      {!loading && noStreamLive.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-[13px] font-bold text-red-700">
              {noStreamLive.length} live {noStreamLive.length === 1 ? "match has" : "matches have"} no working stream
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {noStreamLive.slice(0, 6).map((e) => (
              <span key={e.matchId} className="text-[11px] text-red-600 font-medium">{e.match.title}</span>
            ))}
          </div>
          <p className="text-[10px] text-red-400 mt-1">Attach a fallback below to fix.</p>
        </div>
      )}

      {/* Tabs + sport filter + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
          {(["live", "upcoming"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[12px] font-bold px-4 py-1.5 rounded-lg transition-colors capitalize ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              {t} ({t === "live" ? liveCount : upcomingCount})
            </button>
          ))}
        </div>
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">All sports</option>
          {availableSports.map((s) => (
            <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team or match…"
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">No {tab} matches.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const serv = SERVING[e.serving] || SERVING.none;
            const t = e.match.teams;
            const time = new Date(e.match.date).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
            const flags = e.flags;
            return (
              <div key={e.matchId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Header (tap to see the servers actually serving this match) */}
                <button onClick={() => toggleExpand(e)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {t?.home?.badge && <img src={getBadgeUrl(t.home.badge)} alt="" className="w-6 h-6 object-contain shrink-0" />}
                    <span className="text-[13px] font-bold text-gray-900 truncate">
                      {t?.home && t?.away ? `${t.home.name} vs ${t.away.name}` : e.match.title}
                    </span>
                    {t?.away?.badge && <img src={getBadgeUrl(t.away.badge)} alt="" className="w-6 h-6 object-contain shrink-0" />}
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-1 rounded shrink-0 ${serv.cls}`}>{serv.label.toUpperCase()}</span>
                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded === e.matchId ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Servers panel — lazily loaded for the selected card only */}
                {expanded === e.matchId && (
                  <div className="px-4 pb-3 border-b border-gray-100">
                    {(() => {
                      const st = servers[e.matchId];
                      if (!st || st.loading) return <p className="text-[12px] text-gray-400 py-2">Loading servers…</p>;
                      if (st.streams.length === 0) return (
                        <div className="py-2 flex items-center justify-between">
                          <p className="text-[12px] text-gray-400">{e.status === "upcoming" ? "No stream source yet — nothing to preview." : "No working server right now."}</p>
                          <button onClick={() => loadServers(e, true)} className="text-[11px] font-bold text-gray-500 hover:text-gray-800">↻ Refresh</button>
                        </div>
                      );
                      return (
                        <div className="space-y-1.5 py-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Servers on the site ({st.streams.length})</span>
                            <button onClick={() => loadServers(e, true)} className="text-[11px] font-bold text-gray-500 hover:text-gray-800">↻ Refresh</button>
                          </div>
                          {st.streams.map((s, i) => (
                            <div key={s.id || i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                              <span className="text-[12px] font-bold text-gray-800 shrink-0">Server {s.streamNo || i + 1}</span>
                              {i === 0 && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">shown first</span>}
                              {s.hd && <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">HD</span>}
                              <span className="text-[10px] text-gray-400 truncate flex-1 min-w-0">{s.source}{s.language ? ` · ${s.language}` : ""}</span>
                              {(() => {
                                const pk = `${e.matchId}::${s.embedUrl}`;
                                const added = e.overrides.some((o) => o.embed_url === s.embedUrl) || pinning[pk] === "done";
                                if (added) return <span className="text-[11px] font-bold text-emerald-600 shrink-0">✓ Added</span>;
                                return (
                                  <button onClick={() => pinServer(e, s)} disabled={pinning[pk] === "saving"} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 shrink-0 disabled:opacity-50">{pinning[pk] === "saving" ? "…" : "Use"}</button>
                                );
                              })()}
                              <a href={s.embedUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-blue-600 hover:text-blue-800 shrink-0">Preview</a>
                              <button onClick={() => navigator.clipboard?.writeText(s.embedUrl)} className="text-[11px] font-bold text-gray-400 hover:text-gray-700 shrink-0">Copy</button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Custom Notice Banner on Card */}
                {flags?.custom_notice && (
                  <div className="mx-4 mb-2.5 px-3 py-2 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">💬</span>
                      <p className="text-[12px] text-amber-950 font-semibold truncate">
                        <span className="text-amber-800 font-bold mr-1.5 bg-amber-200/60 px-1.5 py-0.5 rounded">WATCH PAGE TIP:</span>
                        {flags.custom_notice}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setNoticeModal({ matchId: e.matchId, title: e.match.title, matchData: e.match, currentNotice: flags.custom_notice || "" })}
                        className="text-[11px] font-bold text-amber-900 hover:text-amber-950 underline px-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setFlag(e, { custom_notice: null })}
                        className="text-[11px] font-bold text-red-600 hover:text-red-800 px-1"
                        title="Remove notice"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub row: time + actions */}
                <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[11px] text-gray-400 font-medium">{time} · {e.match.category}</span>
                  <button
                    onClick={() => setModal({ matchId: e.matchId, title: e.match.title, sport: e.match.category, matchData: e.match, append: e.overrides.length > 0 })}
                    className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1 rounded-lg transition-colors"
                  >
                    {e.overrides.length > 0 ? "+ Add stream" : "Add fallback"}
                  </button>
                  <button
                    onClick={() => setNoticeModal({ matchId: e.matchId, title: e.match.title, matchData: e.match, currentNotice: flags?.custom_notice || "" })}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                      flags?.custom_notice
                        ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-sm"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    <span>💬</span>
                    {flags?.custom_notice ? "Edit Notice" : "+ Notice"}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
                    <Toggle on={!!flags?.popular} onClick={() => setFlag(e, { popular: !flags?.popular })} color="amber" />
                    ⭐ Popular
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <Toggle on={!!flags?.hot} onClick={() => setFlag(e, { hot: !flags?.hot })} color="red" />
                    🔥 Hot
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <Toggle on={!!flags?.forced_live} onClick={() => setFlag(e, { forced_live: !flags?.forced_live })} color="blue" />
                    Force live
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <Toggle on={!!flags?.force_ended} onClick={() => setFlag(e, { force_ended: !flags?.force_ended })} color="red" />
                    End now
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <Toggle on={!!flags?.hidden} onClick={() => setFlag(e, { hidden: !flags?.hidden })} color="red" />
                    Hide match
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <Toggle on={!!flags?.hide_one} onClick={() => setFlag(e, { hide_one: !flags?.hide_one })} color="red" />
                    Hide this copy
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <Toggle on={autoOn(flags, e.match.category)} onClick={() => setFlag(e, { auto_fallback: !autoOn(flags, e.match.category) })} />
                    Auto-fallback
                  </label>
                </div>

                {/* Overrides */}
                {e.overrides.length > 0 && (
                  <div className="border-t border-gray-100">
                    <div className="px-4 py-2 flex items-center justify-between bg-gray-50">
                      <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Manual servers</span>
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button onClick={() => setReplaceMode(e.matchId, false)} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${!e.overrides[0]?.replace_original ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Alongside</button>
                        <button onClick={() => setReplaceMode(e.matchId, true)} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${e.overrides[0]?.replace_original ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Replace</button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {e.overrides.map((o) => (
                        <div key={o.id} className={`px-4 py-2 flex items-center gap-2 ${!o.enabled ? "opacity-50" : ""}`}>
                          <Toggle on={o.enabled} onClick={() => toggleOverride(e.matchId, o.id, !o.enabled)} />
                          <input
                            defaultValue={o.server_label || o.source || ""}
                            onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== o.server_label) editLabel(e.matchId, o.id, v); }}
                            className="flex-1 min-w-0 text-[12px] font-medium text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-emerald-300 rounded px-1.5 py-0.5 focus:outline-none"
                          />
                          <span className="text-[10px] text-gray-400 shrink-0">{o.source}</span>
                          <button onClick={() => removeOverride(e.matchId, o.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <StreamOverrideModal
          matchId={modal.matchId}
          matchTitle={modal.title}
          sport={modal.sport}
          matchData={modal.matchData}
          appendMode={modal.append}
          onClose={() => setModal(null)}
          onApplied={fetchData}
        />
      )}

      {noticeModal && (
        <MatchNoticeModal
          matchId={noticeModal.matchId}
          matchTitle={noticeModal.title}
          matchData={noticeModal.matchData}
          currentNotice={noticeModal.currentNotice}
          onClose={() => setNoticeModal(null)}
          onSaved={(n) => {
            patchEntry(noticeModal.matchId, (e) => {
              const base = e.flags ?? {
                match_id: e.matchId,
                hidden: false,
                hide_one: false,
                forced_live: false,
                featured: false,
                disable_auto: false,
                force_ended: false,
                hot: false,
              };
              return { ...e, flags: { ...base, custom_notice: n } };
            });
          }}
        />
      )}
    </div>
  );
}
