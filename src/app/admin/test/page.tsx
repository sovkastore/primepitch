"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBadgeUrl } from "@/lib/api";

// Admin-only sandbox for testing an UPCOMING football match's stream early.
//
// What it does: for a chosen upcoming match it resolves the stream across all of
// the match's sources WITHOUT the pre-kickoff gate (so streamed.pk feeds that are
// already online show up) and plays the result inline, here, for the admin only.
//
// What it deliberately does NOT do: it writes nothing. No force-live, no override,
// no flags. Previewing here does not start the match for the public and does not
// touch the Streams page — whether a match goes live publicly is decided there
// (Force Live / overrides). This page is purely a "does a working stream exist
// yet?" check; if it plays here, go to Streams to actually push it live.

interface Team { name: string; badge?: string }
interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  teams?: { home?: Team; away?: Team };
  sources: { source: string; id: string }[];
}
interface Entry {
  match: Match;
  matchId: string;
  status: string;
}
interface ResolvedStream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

function kickoffLabel(ms: number): string {
  const diffMin = Math.round((ms - Date.now()) / 60000);
  const when = new Date(ms).toLocaleString(undefined, {
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  if (diffMin <= 0) return `${when} · kickoff passed`;
  if (diffMin < 60) return `${when} · in ${diffMin}m`;
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return `${when} · in ${h}h${m ? ` ${m}m` : ""}`;
}

export default function TestStreamPage() {
  const [matches, setMatches] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Entry | null>(null);
  const [streams, setStreams] = useState<ResolvedStream[]>([]);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false); // a test has completed for `selected`
  const [active, setActive] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/all-matches");
      const d = await res.json();
      const up: Entry[] = (d.upcoming || [])
        .filter((e: Entry) => e.match?.category === "football")
        .sort((a: Entry, b: Entry) => a.match.date - b.match.date);
      setMatches(up);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  // Resolve a match's stream ungated. We call the existing read-only resolver for
  // every source the match carries (no `kickoff` param -> auto-fallback ungated,
  // echo/override resolve normally) and merge, so the working feed surfaces no
  // matter which source it lives on. Read-only: this changes nothing server-side.
  async function testMatch(e: Entry) {
    setSelected(e);
    setStreams([]);
    setActive(0);
    setIframeLoaded(false);
    setResolved(false);
    setResolving(true);
    try {
      const sources = e.match.sources?.length
        ? e.match.sources
        : [{ source: e.matchId.split("--")[0], id: e.matchId.split("--")[1] }];
      const lists = await Promise.all(
        sources.map(async (s) => {
          try {
            const r = await fetch(
              `/api/match-streams/${encodeURIComponent(`${s.source}--${s.id}`)}` +
                `?title=${encodeURIComponent(e.match.title)}&sport=${encodeURIComponent(e.match.category)}`
            );
            const d = await r.json();
            return (d.streams || []) as ResolvedStream[];
          } catch {
            return [] as ResolvedStream[];
          }
        })
      );
      const seen = new Set<string>();
      const merged: ResolvedStream[] = [];
      for (const list of lists) {
        for (const s of list) {
          if (s.embedUrl && !seen.has(s.embedUrl)) {
            seen.add(s.embedUrl);
            merged.push(s);
          }
        }
      }
      setStreams(merged);
    } finally {
      setResolving(false);
      setResolved(true);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((e) => e.match.title.toLowerCase().includes(q));
  }, [matches, search]);

  const current = streams[active];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Test Stream</h1>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">PREVIEW · ADMIN ONLY</span>
        </div>
        <p className="text-[13px] text-gray-500 mt-1">
          Check whether an upcoming football match already has a working stream — played here, privately, before kickoff.
        </p>
      </div>

      {/* Isolation notice */}
      <div className="mb-5 flex gap-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
        <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[12px] text-amber-800 leading-relaxed">
          Testing here is <b>isolated</b> — it does not start the match for users, change any flag, or touch the Streams page.
          If a stream plays here, go to{" "}
          <Link href="/admin/streams" className="font-bold underline">Streams</Link>{" "}
          and use <b>Force Live</b> (or pin an override) to actually push it live.
        </p>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5">
        {/* Upcoming list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "70vh" }}>
          <div className="p-3 border-b border-gray-100 flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search upcoming football…"
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <button
              onClick={loadMatches}
              title="Refresh list"
              className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-12">No upcoming football matches.</p>
            ) : (
              filtered.map((e) => {
                const isSel = selected?.matchId === e.matchId;
                const home = e.match.teams?.home;
                return (
                  <button
                    key={e.matchId}
                    onClick={() => testMatch(e)}
                    className={`w-full text-left px-3.5 py-3 border-b border-gray-50 transition-colors ${isSel ? "bg-emerald-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      {home?.badge && <img src={getBadgeUrl(home.badge)} alt="" className="w-4 h-4 object-contain shrink-0" />}
                      <p className="text-[13px] font-semibold text-gray-900 truncate flex-1">{e.match.title}</p>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{kickoffLabel(e.match.date)}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Preview panel */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center text-center py-20 px-6">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-gray-400 mt-3">Pick an upcoming match on the left to test its stream.</p>
            </div>
          ) : (
            <div>
              <div className="p-4 border-b border-gray-100">
                <p className="text-[14px] font-bold text-gray-900">{selected.match.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{kickoffLabel(selected.match.date)}</p>
              </div>

              <div className="p-4">
                {/* Player */}
                <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  {resolving ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[12px] text-gray-400">Resolving stream…</p>
                    </div>
                  ) : current ? (
                    <>
                      <iframe
                        key={current.embedUrl}
                        src={current.embedUrl}
                        className="absolute inset-0 w-full h-full"
                        allowFullScreen
                        allow="encrypted-media"
                        onLoad={() => setIframeLoaded(true)}
                      />
                      {!iframeLoaded && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
                          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                      <p className="text-[13px] font-semibold text-gray-300">No stream online yet</p>
                      <p className="text-[11px] text-gray-500">streamed.pk isn’t serving this match yet. Try again closer to kickoff.</p>
                    </div>
                  )}
                </div>

                {/* Server picker */}
                {streams.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1.5">
                      {streams.length} server{streams.length > 1 ? "s" : ""} found
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {streams.map((s, i) => (
                        <button
                          key={s.embedUrl}
                          onClick={() => { setActive(i); setIframeLoaded(false); }}
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                            i === active ? "bg-emerald-500 text-white border-emerald-500" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {s.language || s.source || `Server ${i + 1}`}
                          {s.hd && <span className="ml-1 text-[9px] opacity-70">HD</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Result line + next step */}
                {resolved && !resolving && (
                  <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                    <p className={`text-[12px] font-semibold ${streams.length ? "text-emerald-600" : "text-red-500"}`}>
                      {streams.length
                        ? `✓ Working — ${streams.length} stream${streams.length > 1 ? "s" : ""} resolved early`
                        : "✗ No working stream yet"}
                    </p>
                    {streams.length > 0 && (
                      <Link
                        href="/admin/streams"
                        className="px-3.5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-bold rounded-xl transition-colors"
                      >
                        Make it live in Streams →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
