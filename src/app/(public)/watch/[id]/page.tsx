"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import LiveMatchRow from "@/components/LiveMatchRow";
import UpcomingRow from "@/components/UpcomingRow";
import { Match, getMatchStatus, getLiveMatches, getMatchKey, SPORT_LABELS } from "@/lib/api";
import { getVisitorId } from "@/lib/visitor";
import { visibleInterval } from "@/lib/poll";
import { useBatchScores } from "@/lib/use-batch-scores";

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
  // null until mount so SSR and first client render match (no hydration mismatch).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // now === null on SSR + first client render → deterministic "--" placeholder (no mismatch).
  const diff = now === null ? 0 : Math.max(0, targetDate - now);
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

  const display = now !== null && days > 0 ? units : units.slice(1);

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
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveScore, setLiveScore] = useState<{ home: number; away: number; minute: number | null; period: string; league?: string | null } | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [gaveUp, setGaveUp] = useState(false);
  const [forceLive, setForceLive] = useState(false);

  const trackedRef = useRef(false);
  const streamTriesRef = useRef(0);

  const fallbackName = matchId
    ?.replace(/^ppv-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Live Match";

  const displayTitle = currentMatch?.title || fallbackName;
  const hasTeams = currentMatch?.teams?.home && currentMatch?.teams?.away;
  const sportLabel = SPORT_LABELS[currentMatch?.category || ""] || currentMatch?.category || "";
  const matchStatus = currentMatch ? getMatchStatus(currentMatch) : "upcoming";
  const isLive = matchStatus === "live" || forceLive;
  const isUpcoming = !isLive && matchStatus === "upcoming";

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

        // A match the site shows as LIVE can have a future scheduled time (e.g. a
        // practice session streamed.pk lists live ahead of its slot). Trust the live
        // set, not just the clock, so it opens the player instead of a countdown.
        const liveSet = await getLiveMatches();
        const inLiveSet = liveSet.some((m) => {
          const s = m.sources?.[0];
          return s ? `${s.source}--${s.id}` === rawId : false;
        });
        setForceLive(inLiveSet);

        const status = current ? getMatchStatus(current) : "upcoming";

        // Streams come from the centralized resolver: manual overrides → echo → auto-fallback.
        if (status === "live" || inLiveSet) {
          const title = current?.title || fallbackName;
          const sport = current?.category || "football";
          try {
            const res = await fetch(
              `/api/match-streams/${encodeURIComponent(rawId)}?title=${encodeURIComponent(title)}&sport=${encodeURIComponent(sport)}`
            );
            const data = await res.json();
            setStreams(Array.isArray(data.streams) ? data.streams : []);
            setActiveStream(0);
          } catch {
            setStreams([]);
          }
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

  // Streamable live matches (for RELATED MATCHES when watching a live game)
  useEffect(() => {
    const loadLive = () => { getLiveMatches().then(setLiveMatches).catch(() => {}); };
    return visibleInterval(loadLive, 90_000);
  }, []);

  // Poll live score while the match is live (incl. force-live, where the scheduled
  // time-based status would still read "upcoming").
  useEffect(() => {
    if (!currentMatch?.teams?.home?.name || !currentMatch?.teams?.away?.name) return;
    if (!isLive) return;

    const fetchScore = () => {
      const home = encodeURIComponent(currentMatch.teams!.home!.name);
      const away = encodeURIComponent(currentMatch.teams!.away!.name);
      fetch(`/api/live-score?home=${home}&away=${away}`)
        .then((r) => r.json())
        .then((d) => { if (d.score) setLiveScore(d.score); })
        .catch(() => {});
    };

    return visibleInterval(fetchScore, 90_000);
  }, [currentMatch, isLive]);

  // Reset the stream-resolution state whenever the match changes.
  useEffect(() => {
    setGaveUp(false);
    streamTriesRef.current = 0;
  }, [rawId]);

  // While a live match has no stream yet, keep retrying fast (the fallback often
  // needs a cold lookup on first load) and show a "Finding the stream…" state —
  // never a premature "No streams available yet". Give up after ~60s.
  useEffect(() => {
    if (loading || !isLive || streams.length > 0 || gaveUp) return;
    const interval = setInterval(async () => {
      if (document.hidden) return; // don't retry in a background tab
      streamTriesRef.current += 1;
      await retryStreams();
      if (streamTriesRef.current >= 13) setGaveUp(true); // ~60s
    }, 4500);
    return () => clearInterval(interval);
  }, [loading, isLive, streams.length, gaveUp]);

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
    // Presence heartbeats are handled site-wide by <Analytics/> (every 2.5 min,
    // includes match_id on watch pages) — no per-page heartbeat anymore.
  }, [currentMatch, rawId, source]);

  const currentStream = streams[activeStream];

  // Reset the player loading state on every stream/server switch; never let a
  // missing iframe `load` event trap the user on a spinner (8s fallback).
  useEffect(() => {
    if (!currentStream?.embedUrl) return;
    setIframeLoaded(false);
    setShowHint(true);
    const fallback = setTimeout(() => setIframeLoaded(true), 8000);
    return () => clearTimeout(fallback);
  }, [currentStream?.embedUrl]);

  // Dismiss the "tap the player to start" cue once the user actually taps the
  // player. We can't see inside the cross-origin iframe, but the first tap either
  // focuses the iframe (desktop) or opens the source's ad pop-up which hides the
  // tab (mobile) — both signal the user has engaged with the player.
  useEffect(() => {
    if (!iframeLoaded || !showHint) return;
    const onBlur = () => {
      if (document.activeElement?.tagName === "IFRAME") setShowHint(false);
    };
    const onVisibility = () => { if (document.hidden) setShowHint(false); };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [iframeLoaded, showHint]);

  // Live → streamable live matches of the same sport; upcoming → time-based related.
  const relatedToShow = isLive
    ? liveMatches
        .filter((m) => m.category === currentMatch?.category && m.title !== currentMatch?.title)
        .slice(0, 8)
    : relatedMatches.slice(0, 8);

  // ONE batched score request covers all related live cards.
  const relScores = useBatchScores(isLive ? relatedToShow : []);

  async function retryStreams() {
    try {
      const title = currentMatch?.title || fallbackName;
      const sport = currentMatch?.category || "football";
      const res = await fetch(
        `/api/match-streams/${encodeURIComponent(rawId)}?title=${encodeURIComponent(title)}&sport=${encodeURIComponent(sport)}`
      );
      const data = await res.json();
      if (Array.isArray(data.streams) && data.streams.length > 0) {
        setStreams(data.streams);
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
          <span className="font-semibold">Back</span>
        </Link>
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
              <>
                <iframe
                  key={currentStream.embedUrl}
                  src={currentStream.embedUrl}
                  className="absolute inset-0 w-full h-full"
                  allowFullScreen
                  allow="encrypted-media"
                  onLoad={() => setIframeLoaded(true)}
                />

                {/* Loading overlay — covers the embed's black box until it's ready */}
                {!iframeLoaded && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
                    <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <div>
                      <p className="text-sm font-semibold text-gray-200">Connecting to stream…</p>
                      <p className="text-[11px] text-gray-500 mt-1">This only takes a moment</p>
                    </div>
                  </div>
                )}

                {/* "Tap to play" cue — non-blocking, auto-fades */}
                {iframeLoaded && showHint && (
                  <div className="absolute inset-x-0 top-3 z-10 flex justify-center pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-[11px] font-semibold text-white shadow-lg">
                      <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      Tap the player to start
                    </span>
                  </div>
                )}
              </>
            ) : liveScore?.period === "HT" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-300">Stream temporarily unavailable</p>
                  <p className="text-xs text-gray-500 mt-1">The match is at halftime.<br />The stream will resume shortly.</p>
                </div>
                <button onClick={retryStreams} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium mt-1 transition-colors">
                  Tap to refresh ↻
                </button>
              </div>
            ) : isLive && !gaveUp ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-gray-200">Finding the stream…</p>
                  <p className="text-[11px] text-gray-500 mt-1">Hang tight, this won&apos;t take long.</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-300">No streams available yet</p>
                  <p className="text-xs text-gray-500 mt-1">Streams will appear automatically<br />when they become available.</p>
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
            <div>
              {/* Score display */}
              {liveScore ? (
                <div className="flex items-center justify-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <TeamBadge badge={currentMatch!.teams!.home!.badge} name={currentMatch!.teams!.home!.name} size="md" sport={currentMatch!.category} />
                    <span className="text-sm font-bold text-gray-900">{currentMatch!.teams!.home!.name}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 rounded-xl">
                    <span className="text-xl font-black text-white tabular-nums">{liveScore.home}</span>
                    <span className="text-xs text-gray-400 font-bold">-</span>
                    <span className="text-xl font-black text-white tabular-nums">{liveScore.away}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{currentMatch!.teams!.away!.name}</span>
                    <TeamBadge badge={currentMatch!.teams!.away!.badge} name={currentMatch!.teams!.away!.name} size="md" sport={currentMatch!.category} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 mb-3">
                  <TeamBadge badge={currentMatch!.teams!.home!.badge} name={currentMatch!.teams!.home!.name} size="md" sport={currentMatch!.category} />
                  <p className="flex-1 text-base font-bold text-gray-900 min-w-0">
                    {currentMatch!.teams!.home!.name} vs {currentMatch!.teams!.away!.name}
                  </p>
                  <TeamBadge badge={currentMatch!.teams!.away!.badge} name={currentMatch!.teams!.away!.name} size="md" sport={currentMatch!.category} />
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500">
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
                {liveScore?.minute && (
                  <span className="text-[11px] font-bold text-gray-900">{liveScore.minute}&apos;</span>
                )}
                {liveScore?.period === "HT" && (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">HT</span>
                )}
                <span className="text-[11px] text-gray-500 truncate max-w-[60%]">{liveScore?.league || sportLabel}</span>
              </div>
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
                key={`${s.id || s.source}-${i}`}
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
                    <span className="text-[13px] font-bold text-gray-900">
                      {s.id?.startsWith("override") ? `Stream ${i + 1}` : `Server ${s.streamNo}`}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      s.hd ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"
                    }`}>
                      {s.hd ? "HD" : "SD"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {s.language || "English"}
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
      {relatedToShow.length > 0 && (
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
            {relatedToShow.map((m) =>
              isLive ? (
                <LiveMatchRow key={`rel-${getMatchKey(m)}`} match={m} score={relScores[getMatchKey(m)] || null} />
              ) : (
                <UpcomingRow key={`rel-${getMatchKey(m)}`} match={m} showSport={false} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
