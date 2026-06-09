"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import LiveMatchRow from "@/components/LiveMatchRow";
import { Match, getMatchStatus, getWatchHref, SPORT_LABELS } from "@/lib/api";
import { getVisitorId } from "@/lib/visitor";

interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

const ALL_SPORTS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
];

function CountdownTimer({ targetDate }: { targetDate: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, targetDate - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  const units = [
    { label: "DAYS", value: days },
    { label: "HRS", value: hours },
    { label: "MIN", value: minutes },
    { label: "SEC", value: seconds },
  ];

  const display = days > 0 ? units : units.slice(1);

  return (
    <div className="flex items-center justify-center gap-3">
      {display.map((u, i) => (
        <div key={u.label} className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-3xl md:text-4xl font-black text-gray-900 tabular-nums">
              {String(u.value).padStart(2, "0")}
            </span>
            <span className="text-[9px] font-bold text-gray-500 tracking-widest mt-1">{u.label}</span>
          </div>
          {i < display.length - 1 && (
            <span className="text-2xl font-bold text-gray-600 -mt-4">:</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WatchPage() {
  const params = useParams();
  const rawId = decodeURIComponent(params.id as string);
  const [source, matchId] = rawId.split("--");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [relatedMatches, setRelatedMatches] = useState<Match[]>([]);

  const trackedRef = useRef(false);

  const fallbackName = matchId
    ?.replace(/^ppv-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Live Match";

  const displayTitle = currentMatch?.title || fallbackName;
  const hasTeams = currentMatch?.teams?.home && currentMatch?.teams?.away;
  const sportLabel = SPORT_LABELS[currentMatch?.category || ""] || currentMatch?.category || "";
  const matchStatus = currentMatch ? getMatchStatus(currentMatch) : "upcoming";
  const isLive = matchStatus === "live";
  const isUpcoming = matchStatus === "upcoming";

  const scheduledTime = currentMatch
    ? new Date(currentMatch.date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  useEffect(() => {
    async function load() {
      try {
        const streamPromise = fetch(`https://streamed.pk/api/stream/${source}/${matchId}`)
          .then((r) => r.json())
          .catch(() => []);

        const matchResults = await Promise.all(
          ALL_SPORTS.map(async (sport) => {
            try {
              const res = await fetch(`https://streamed.pk/api/matches/${sport}`);
              const data = await res.json();
              return data.map((m: Match) => ({ ...m, category: sport }));
            } catch {
              return [];
            }
          })
        );
        const allMatches: Match[] = matchResults.flat();

        const current = allMatches.find((m) =>
          m.sources?.some((s) => s.id === matchId)
        );
        if (current) setCurrentMatch(current);

        const status = current ? getMatchStatus(current) : "upcoming";

        // Only load streams for live matches
        if (status === "live") {
          const streamData: Stream[] = await streamPromise;
          setStreams(streamData);
        }

        // Related: same category, same status
        const others = allMatches.filter(
          (m) =>
            m.title !== current?.title &&
            m.category === current?.category &&
            getMatchStatus(m) === status
        );
        setRelatedMatches(others);
      } catch (e) {
        console.error("Failed to load:", e);
      } finally {
        setLoading(false);
      }
    }
    if (source && matchId) load();
  }, [source, matchId]);

  // Track match view + heartbeat
  useEffect(() => {
    if (!currentMatch || trackedRef.current) return;
    trackedRef.current = true;

    const visitor_id = getVisitorId();
    if (!visitor_id) return;

    fetch("/api/track/match-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id,
        match_id: rawId,
        source,
        match_title: currentMatch.title,
        sport: currentMatch.category,
        is_live: getMatchStatus(currentMatch) === "live",
      }),
    }).catch(() => {});

    const heartbeat = setInterval(() => {
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id, path: `/watch/${rawId}`, match_id: rawId }),
      }).catch(() => {});
    }, 30_000);

    const onUnload = () => {
      const body = JSON.stringify({ visitor_id, path: `/watch/${rawId}`, match_id: rawId });
      navigator.sendBeacon("/api/track/heartbeat", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [currentMatch, rawId, source]);

  const currentStream = streams[activeStream];

  async function retryStreams() {
    try {
      const res = await fetch(`https://streamed.pk/api/stream/${source}/${matchId}`);
      const data: Stream[] = await res.json();
      if (data.length > 0) {
        setStreams(data);
        setActiveStream(0);
      }
    } catch {}
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Top bar */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-sm font-extrabold">
          <span className="text-gray-900">PRIME</span>
          <span className="text-gradient">PITCH</span>
        </span>
        <div className="w-6" />
      </div>

      {/* Video player (live) OR Match card (upcoming) */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        {isUpcoming ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            {/* Top: UPCOMING badge + sport */}
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[9px] font-black text-blue-600 tracking-wide">
                UPCOMING
              </span>
              <span className="text-[10px] font-semibold text-gray-400">{sportLabel}</span>
            </div>

            {/* Teams — same layout as LiveMatchRow */}
            {hasTeams ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex flex-col items-center gap-2">
                  <TeamBadge
                    badge={currentMatch!.teams!.home!.badge}
                    name={currentMatch!.teams!.home!.name}
                    size="lg"
                    sport={currentMatch!.category}
                  />
                  <p className="text-[12px] font-bold text-gray-900 text-center truncate w-full">
                    {currentMatch!.teams!.home!.name}
                  </p>
                </div>
                <span className="text-[11px] text-gray-400 font-extrabold tracking-wider shrink-0">VS</span>
                <div className="flex-1 flex flex-col items-center gap-2">
                  <TeamBadge
                    badge={currentMatch!.teams!.away!.badge}
                    name={currentMatch!.teams!.away!.name}
                    size="lg"
                    sport={currentMatch!.category}
                  />
                  <p className="text-[12px] font-bold text-gray-900 text-center truncate w-full">
                    {currentMatch!.teams!.away!.name}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[13px] font-bold text-gray-900 text-center">{displayTitle}</p>
            )}

            {/* Date + Countdown */}
            <div className="mt-5 pt-4 border-t border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-400 tracking-widest uppercase mb-3">Match starts in</p>
              {currentMatch && <CountdownTimer targetDate={currentMatch.date} />}
              <p className="text-[12px] text-gray-500 font-medium mt-3">{scheduledTime}</p>
            </div>
          </div>
        ) : (
          <div className="relative w-full bg-black rounded-xl overflow-hidden border border-gray-200" style={{ aspectRatio: "16/9" }}>
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentStream ? (
              <iframe src={currentStream.embedUrl} className="absolute inset-0 w-full h-full" allowFullScreen allow="encrypted-media" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-300">Stream temporarily unavailable</p>
                  <p className="text-xs text-gray-500 mt-1">The match may be at halftime or on a break.<br />The stream will resume shortly.</p>
                </div>
                <button onClick={retryStreams} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium mt-1 transition-colors">
                  Tap to refresh ↻
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Match info — only for live matches */}
      {isLive && (
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          {hasTeams ? (
            <div className="flex items-center gap-3">
              <TeamBadge badge={currentMatch!.teams!.home!.badge} name={currentMatch!.teams!.home!.name} size="md" sport={currentMatch!.category} />
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900">
                  {currentMatch!.teams!.home!.name} vs {currentMatch!.teams!.away!.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500">
                    <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-[11px] text-gray-500">{sportLabel}</span>
                </div>
              </div>
              <TeamBadge badge={currentMatch!.teams!.away!.badge} name={currentMatch!.teams!.away!.name} size="md" sport={currentMatch!.category} />
            </div>
          ) : (
            <div>
              <h1 className="text-base font-bold text-gray-900">{displayTitle}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500">
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
                {sportLabel && <span className="text-[11px] text-gray-500">{sportLabel}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Choose Stream — only for live matches */}
      {isLive && (
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          <h3 className="text-[12px] font-bold text-gray-500 tracking-widest mb-3">CHOOSE STREAM</h3>
          <div className="space-y-2">
            {streams.length > 0 ? streams.map((s, i) => (
              <button
                key={s.streamNo}
                onClick={() => setActiveStream(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  i === activeStream
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-gray-50 border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  i === activeStream ? "bg-emerald-500" : "bg-gray-200"
                }`}>
                  <svg className={`w-3.5 h-3.5 ${i === activeStream ? "text-black" : "text-gray-600"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-gray-900">Server {s.streamNo}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      s.hd ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"
                    }`}>
                      {s.hd ? "HD" : "SD"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {s.hd ? "1080p" : "720p"} &middot; {s.language || "English"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-emerald-400 font-medium">Stable</span>
                  <div className="flex items-end gap-0.5">
                    <div className="w-1 h-2 rounded-sm bg-emerald-400" />
                    <div className="w-1 h-3 rounded-sm bg-emerald-400" />
                    <div className="w-1 h-4 rounded-sm bg-emerald-400" />
                  </div>
                </div>
              </button>
            )) : !loading && (
              <p className="text-[12px] text-gray-600 py-4 text-center">No servers available</p>
            )}
          </div>
        </div>
      )}

      {/* Related Matches */}
      {relatedMatches.length > 0 && (
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-bold text-gray-500 tracking-widest">
              {isUpcoming ? "MORE UPCOMING" : "RELATED MATCHES"}
            </h3>
            <Link href="/" className="text-[11px] text-gray-500 hover:text-emerald-500 transition-colors font-medium">
              View All &rsaquo;
            </Link>
          </div>
          <div className="space-y-3">
            {relatedMatches.slice(0, 8).map((m, i) => {
              if (isLive) {
                return <LiveMatchRow key={`rel-${m.id}-${i}`} match={m} />;
              }
              const d = new Date(m.date);
              const dateStr = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
              const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
              const href = getWatchHref(m);
              const hasTeams = m.teams?.home && m.teams?.away;
              const label = SPORT_LABELS[m.category] || m.category;
              return (
                <Link key={`rel-${m.id}-${i}`} href={href} className="group block">
                  <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
                    <div className="shrink-0 w-20 text-center">
                      <p className="text-[11px] font-bold text-emerald-500">{timeStr}</p>
                      <p className="text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 shrink-0" />
                    {hasTeams ? (
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <TeamBadge badge={m.teams!.home!.badge} name={m.teams!.home!.name} size="sm" sport={m.category} />
                        <span className="text-[12px] font-bold text-gray-800 truncate">{m.teams!.home!.name}</span>
                        <span className="text-[9px] text-gray-400 font-extrabold shrink-0">VS</span>
                        <span className="text-[12px] font-bold text-gray-800 truncate text-right">{m.teams!.away!.name}</span>
                        <TeamBadge badge={m.teams!.away!.badge} name={m.teams!.away!.name} size="sm" sport={m.category} />
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-gray-800 truncate">{m.title}</p>
                      </div>
                    )}
                    <span className="text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">{label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
