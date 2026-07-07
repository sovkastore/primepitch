"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import LiveMatchRow from "@/components/LiveMatchRow";
import UpcomingRow from "@/components/UpcomingRow";
import PreRollGate from "@/components/PreRollGate";
import { Match, getMatchStatus, getLiveMatches, getMatchKey, getMatchFlags, isFlagged, SPORT_LABELS, showVersus, EVENT_SPORTS, bothTeamsHaveVisuals } from "@/lib/api";
import { getVisitorId } from "@/lib/visitor";
import { visibleInterval } from "@/lib/poll";
import { useBatchScores } from "@/lib/use-batch-scores";
import DisclaimerFooter from "@/components/DisclaimerFooter";

interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

// --- Stream selector grouping (presentation only) -------------------------
// Streams arrive as one flat list; we group them by their origin source for
// display. Edit SOURCE_META to set each group's display name, descriptive
// note, and order. Unknown sources fall back to a title-cased name so nothing
// ever renders blank. This does not change how streams are resolved or played.
const SOURCE_META: Record<string, { name: string; note: string; rank: number }> = {
  admin: { name: "Admin", note: "Admin added streams", rank: 0 },
  delta: { name: "Delta", note: "Okayish backup", rank: 2 },
  golf: { name: "Golf", note: "Third party (more ads), but very stable", rank: 3 },
  echo: { name: "Echo", note: "Great quality overall", rank: 4 },
  // Any other source falls back to a title-cased name + generic note (rank 9).
  // Add entries here to give a source a custom name / note / order.
};

function streamGroupMeta(key: string): { name: string; note: string; rank: number } {
  return (
    SOURCE_META[key] || {
      name: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Other",
      note: "Backup source",
      rank: 9,
    }
  );
}

function streamGroupKey(s: Stream): string {
  // Group by the stream's real source. Admin-added / manual streams collapse to
  // the "admin" group; streamed.pk sources (echo, delta, golf, alpha, …) and
  // auto-fallback providers keep their own group. (Overrides keep their origin
  // source, so a force-lived mix of echo+golf+delta+admin splits correctly.)
  const src = (s.source || "").toLowerCase().trim();
  if (src.startsWith("auto-")) return src.slice(5) || "auto";
  if (!src || src === "manual" || src === "admin" || src === "override" || src === "fallback") {
    return "admin";
  }
  return src;
}

interface StreamGroupItem {
  s: Stream;
  idx: number; // original index in the flat streams array (for selection)
  n: number; // 1-based number within its group
}
interface StreamGroup {
  key: string;
  name: string;
  note: string;
  rank: number;
  items: StreamGroupItem[];
}

function groupStreams(streams: Stream[]): StreamGroup[] {
  const map = new Map<string, StreamGroup>();
  streams.forEach((s, idx) => {
    const key = streamGroupKey(s);
    let g = map.get(key);
    if (!g) {
      const m = streamGroupMeta(key);
      g = { key, name: m.name, note: m.note, rank: m.rank, items: [] };
      map.set(key, g);
    }
    g.items.push({ s, idx, n: g.items.length + 1 });
  });
  return [...map.values()].sort((a, b) => a.rank - b.rank);
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
  let source = "";
  let matchId = "";
  if (rawId.startsWith("tv-")) {
    source = "tv";
    matchId = rawId.replace("tv-", "");
  } else {
    [source, matchId] = rawId.split("--");
  }
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [relatedMatches, setRelatedMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveScore, setLiveScore] = useState<{ home: number; away: number; minute: number | null; period: string; league?: string | null } | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [forceLive, setForceLive] = useState(false);
  const [autoLive, setAutoLive] = useState(false);
  // True once the live-set lookup has resolved, so the view is tracked with the
  // correct forceLive value (avoids a race that logged force-lived viewers as pre).
  const [liveResolved, setLiveResolved] = useState(false);
  const [hotKeys, setHotKeys] = useState<Set<string>>(new Set());
  const [adsCfg, setAdsCfg] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/ads-config").then(r => r.json()).then(setAdsCfg).catch(() => {});
  }, []);

  // One-time read of HOT flags so an upcoming/custom hot match's page is also
  // special (live matches already carry `hot` via the live feed).
  useEffect(() => {
    getMatchFlags().then((f) => setHotKeys(new Set(f.hot))).catch(() => {});
  }, []);

  const trackedRef = useRef(false);
  const streamTriesRef = useRef(0);

  const fallbackName = source === "tv"
    ? `TV Channel ${matchId}`
    : matchId
        ?.replace(/^ppv-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "Live Match";

  const displayTitle = currentMatch?.title || fallbackName;
  const hasTeams = showVersus(currentMatch) && bothTeamsHaveVisuals(currentMatch);
  const sportLabel = SPORT_LABELS[currentMatch?.category || ""] || currentMatch?.category || "";
  // A match that can't be found in any current list and has no streams has
  // ENDED (feeds drop matches once played) — never show it as "upcoming".
  const matchStatus = source === "tv" ? "live" : (currentMatch ? getMatchStatus(currentMatch) : (loading ? "upcoming" : "ended"));
  const isLive = source === "tv" ? true : (matchStatus === "live" || forceLive || autoLive);
  const isEnded = source !== "tv" && (!isLive && matchStatus === "ended" && streams.length === 0);

  // Tell the global heartbeat when this match is over (covers both the FULL
  // TIME page and stale tabs reopened after the match ended), so returning
  // visitors count as online — not as live-stream watchers.
  useEffect(() => {
    const w = window as unknown as { __ppMatchEnded?: boolean };
    w.__ppMatchEnded = matchStatus === "ended" && !forceLive;
    return () => { w.__ppMatchEnded = false; };
  }, [matchStatus, forceLive]);
  const isUpcoming = !isLive && !isEnded && matchStatus === "upcoming";
  // HOT (admin-flagged). Live matches carry it via the live feed; for upcoming /
  // custom listings we read the flag once so their pages are special too.
  const isHot = !isEnded && (currentMatch?.hot === true || hotKeys.has(rawId) || (currentMatch ? isFlagged(currentMatch, hotKeys) : false));

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

        let current = allMatches.find((m) =>
          m.sources?.some((s) => s.id === matchId)
        );
        // Custom/ppv listings aren't in the feed — load their stored details
        // (title, kickoff) so the page shows a real countdown before kickoff
        // and a real FULL TIME after, never a wrong "ended" guess.
        if (!current) {
          try {
            const apiPath = source === "tv" ? "/api/tv-channels" : `/api/match-meta/${encodeURIComponent(rawId)}`;
            const metaRes = await fetch(apiPath);
            const meta = await metaRes.json();
            if (source === "tv") {
              const ch = (meta.channels || []).find((c: any) => String(c.id) === matchId);
              if (ch) {
                current = { id: `tv--${ch.id}`, title: ch.name, category: ch.category, date: Date.now(), sources: [{ source: "tv", id: String(ch.id) }] };
              }
            } else {
              if (meta?.match) current = meta.match as Match;
            }
          } catch {}
        }
        if (current) setCurrentMatch(current);

        // A match the site shows as LIVE can have a future scheduled time (e.g. a
        // practice session streamed.pk lists live ahead of its slot). Trust the live
        // set, not just the clock, so it opens the player instead of a countdown.
        const liveSet = await getLiveMatches();
        const liveEntry = liveSet.find((m) => {
          const s = m.sources?.[0];
          return s ? `${s.source}--${s.id}` === rawId : false;
        });
        const inLiveSet = !!liveEntry;
        // The live set carries admin renames — prefer it for display.
        if (liveEntry) {
          current = liveEntry;
          setCurrentMatch(liveEntry);
        }
        setForceLive(inLiveSet);

        const status = current ? getMatchStatus(current) : "upcoming";

        // Streams come from the centralized resolver: manual overrides → echo → auto-fallback.
        if (status === "live" || inLiveSet) {
          const title = current?.title || fallbackName;
          const sport = current?.category || "football";
          const kickoff = current?.date || 0;
          try {
            const res = await fetch(
              `/api/match-streams/${encodeURIComponent(rawId)}?title=${encodeURIComponent(title)}&sport=${encodeURIComponent(sport)}&kickoff=${kickoff}`
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
        setLiveResolved(true);
      }
    }
    if (source) load();
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

  // Auto-switch the countdown to the live player without a manual refresh.
  // Cost-aware: NO polling until the final 5 minutes. Before then we just sleep
  // on timers (zero requests). Inside the last 5 min we check streamed.pk for a
  // real source every 20s (paused in background tabs); at kickoff we flip
  // regardless. Once live, this effect bails (isLive guard).
  useEffect(() => {
    if (loading || !currentMatch || isLive || isEnded) return;
    const kickoff = currentMatch.date;
    if (!kickoff) return;
    const EARLY_MS = 5 * 60 * 1000;
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let clearPoll: (() => void) | undefined;

    const goLive = () => {
      if (stopped) return;
      stopped = true;
      clearPoll?.();
      setAutoLive(true);
      retryStreams(); // fetch immediately instead of waiting for the retry tick
    };

    // Only within the last 5 min: has streamed.pk published a real source yet?
    const startEarlyPoll = () => {
      if (stopped) return;
      const check = async () => {
        try {
          const live = await getLiveMatches();
          const hit = live.some((m) => {
            const s = m.sources?.[0];
            return s ? `${s.source}--${s.id}` === rawId : false;
          });
          if (hit) goLive();
        } catch {}
      };
      check();
      clearPoll = visibleInterval(check, 20_000);
    };

    const msToKickoff = kickoff - Date.now();
    if (msToKickoff <= 0) {
      goLive(); // already past kickoff — open the player now
    } else {
      timers.push(setTimeout(goLive, msToKickoff)); // flip exactly at kickoff
      const untilWindow = Math.max(0, msToKickoff - EARLY_MS);
      if (untilWindow === 0) startEarlyPoll();
      else timers.push(setTimeout(startEarlyPoll, untilWindow));
    }

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      clearPoll?.();
    };
  }, [loading, currentMatch, isLive, isEnded, rawId]);

  // Track match view + heartbeat
  useEffect(() => {
    if (!currentMatch || !liveResolved || trackedRef.current) return;
    // Never record a visit to an ended match page — not as a load, not as a
    // watcher, not toward peak/unique. Only live (watching) and upcoming
    // (before kickoff) are tracked. This also keeps the "not-live" bucket
    // meaning strictly "before kickoff" (never after the match).
    if (matchStatus === "ended" && !forceLive) return;

    const visitor_id = getVisitorId();
    if (!visitor_id) return;
    trackedRef.current = true;

    fetch("/api/track/match-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id,
        match_id: rawId,
        source,
        match_title: currentMatch.title,
        sport: currentMatch.category,
        // A view counts as "live" if the feed says live, OR the match has been
        // force-lived (admin/PPV): the stream is live now, so everyone watching
        // is a live viewer — including before the scheduled kickoff.
        is_live: matchStatus === "live" || forceLive,
      }),
    }).catch(() => {});
    // Presence heartbeats are handled site-wide by <Analytics/> (every 2.5 min,
    // includes match_id on watch pages) — no per-page heartbeat anymore.
  }, [currentMatch, rawId, source, matchStatus, forceLive, liveResolved]);

  const currentStream = streams[activeStream];

  // Reset the player loading state on every stream/server switch; never let a
  // missing iframe `load` event trap the user on a spinner (8s fallback).
  useEffect(() => {
    if (!currentStream?.embedUrl) return;
    setIframeLoaded(false);
    const fallback = setTimeout(() => setIframeLoaded(true), 8000);
    return () => clearTimeout(fallback);
  }, [currentStream?.embedUrl]);


  // Live → streamable live matches of the same sport; upcoming → time-based related.
  const relatedToShow = isLive
    ? liveMatches
        .filter((m) => m.category === currentMatch?.category && m.title !== currentMatch?.title)
        .slice(0, 8)
    : relatedMatches.slice(0, 8);

  // ONE batched score request covers all related live cards.
  const relScores = useBatchScores(isLive ? relatedToShow : []);

  // Ended match: try to fetch the final score (archive first, then events feed).
  const [finalScore, setFinalScore] = useState<{ home: number; away: number } | null>(null);
  const [finalTeams, setFinalTeams] = useState<{ home: string; away: string } | null>(null);
  useEffect(() => {
    if (!isEnded) return;
    // Event sports (racing/golf) have no head-to-head — show the title, not a vs.
    if (EVENT_SPORTS.has(currentMatch?.category || "")) return;
    // Team names from match data, else from the title/slug ("A vs B ...").
    let h = currentMatch?.teams?.home?.name || "";
    let a = currentMatch?.teams?.away?.name || "";
    if (!h || !a) {
      const m = displayTitle.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
      if (m) {
        h = m[1].trim();
        // Drop trailing listing junk like "German Spanish Game 111".
        a = m[2].trim().replace(/\s+(german|spanish|english|french|game|stream|hd)\b.*$/i, "").trim();
      }
    }
    if (!h || !a) return;
    fetch(`/api/final-score?home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.score) {
          setFinalScore(d.score);
          if (d.teams) setFinalTeams(d.teams);
        }
      })
      .catch(() => {});
  }, [isEnded, currentMatch, displayTitle]);

  async function retryStreams() {
    try {
      const title = currentMatch?.title || fallbackName;
      const sport = currentMatch?.category || "football";
      const kickoff = currentMatch?.date || 0;
      const res = await fetch(
        `/api/match-streams/${encodeURIComponent(rawId)}?title=${encodeURIComponent(title)}&sport=${encodeURIComponent(sport)}&kickoff=${kickoff}`
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
        {!isEnded && !isUpcoming && adsCfg?.notifications?.wait_banner?.enabled && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-gray-900 leading-snug">{adsCfg.notifications.wait_banner.title}</p>
              <p className="text-[11.5px] text-gray-600 leading-snug mt-0.5">{adsCfg.notifications.wait_banner.text}{" "}
                <Link href="/help" className="font-semibold text-emerald-700 underline underline-offset-2 whitespace-nowrap">Can&apos;t watch? →</Link>
              </p>
            </div>
          </div>
        )}
        {isEnded ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[9px] font-black text-gray-500 tracking-wide">
                FULL TIME
              </span>
              <span className="text-[10px] font-semibold text-gray-400">{sportLabel}</span>
            </div>

            <p className="text-[15px] font-bold text-gray-900 text-center">{finalTeams ? `${finalTeams.home} vs ${finalTeams.away}` : displayTitle}</p>

            {finalScore ? (
              <div className="flex items-center justify-center mt-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 rounded-xl">
                  <span className="text-2xl font-black text-white tabular-nums">{finalScore.home}</span>
                  <span className="text-sm text-gray-400 font-bold">-</span>
                  <span className="text-2xl font-black text-white tabular-nums">{finalScore.away}</span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400 text-center mt-3">This match has ended.</p>
            )}

            <div className="mt-5">
              <Link href="/" className="flex items-center justify-center gap-2 w-full py-2.5 btn-gradient rounded-xl text-[11px] font-black text-white tracking-wide">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                SEE WHAT&apos;S LIVE NOW
              </Link>
            </div>
          </div>
        ) : isUpcoming ? (
          <div
            className={
              "rounded-2xl shadow-sm p-6 " +
              (isHot
                ? "bg-white border-2 border-red-300 ring-1 ring-red-200 animate-hot-glow"
                : "bg-white border border-gray-100")
            }
          >
            {isHot && (
              <div className="-mx-6 -mt-6 mb-5 px-5 py-3 rounded-t-2xl bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white flex items-center gap-2">
                <span className="animate-hot-flame text-lg leading-none">🔥</span>
                <span className="text-[12px] font-black uppercase tracking-wider">Hot Match</span>
                <span className="text-[11px] font-semibold text-white/85">— featured — don&apos;t miss it</span>
              </div>
            )}
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
          <div
            className={
              "relative w-full bg-black rounded-xl overflow-hidden " +
              (isHot
                ? "border-2 border-red-300 ring-1 ring-red-200 animate-hot-glow"
                : "border border-gray-200")
            }
            style={{ aspectRatio: "16/9" }}
          >
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
                    {adsCfg?.notifications?.tap_warning?.enabled && adsCfg.notifications.tap_warning.title && (
                      <div>
                        <p className="text-sm font-semibold text-gray-200">{adsCfg.notifications.tap_warning.title}</p>
                      </div>
                    )}
                  </div>
                )}

                <PreRollGate streamKey={currentStream.embedUrl} />
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

      {/* Choose Stream — only for live matches. Streams are grouped by their
          source (Admin / Echo / fallback providers) with HD/SD subsections.
          Presentation only — selection still indexes the flat streams list. */}
      {isLive && (
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          <h3 className="text-[12px] font-bold text-gray-500 tracking-widest mb-3">CHOOSE STREAM</h3>
          {streams.length > 0 ? (() => {
            const groups = groupStreams(streams);
            const renderRow = (it: StreamGroupItem) => (
              <button
                key={`${it.s.id || it.s.source}-${it.idx}`}
                onClick={() => setActiveStream(it.idx)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  it.idx === activeStream
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-gray-50 border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  it.idx === activeStream ? "bg-emerald-500" : "bg-gray-200"
                }`}>
                  <svg className={`w-3.5 h-3.5 ${it.idx === activeStream ? "text-black" : "text-gray-600"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-gray-900">
                      {`Stream ${it.n}`}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      it.s.hd ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"
                    }`}>
                      {it.s.hd ? "HD" : "SD"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {it.s.language || "English"}
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
            );
            return (
              <div className="space-y-4">
                <p className="text-[11px] text-gray-400 font-medium">
                  Showing top quality sources • {groups.length} of {groups.length} sources
                </p>
                {groups.map((g) => {
                  const hd = g.items.filter((it) => it.s.hd);
                  const sd = g.items.filter((it) => !it.s.hd);
                  return (
                    <div key={g.key} className="rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-[15px] font-extrabold text-gray-900">{g.name}</h4>
                          <p className="text-[11px] font-semibold text-amber-500 mt-0.5 flex items-center gap-1">
                            <span aria-hidden>✨</span> {g.note}
                          </p>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                          {g.items.length} stream{g.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="p-3 space-y-3">
                        {hd.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">HD Streams</p>
                            {hd.map(renderRow)}
                          </div>
                        )}
                        {sd.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">SD Streams</p>
                            {sd.map(renderRow)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() : !loading && (
            <p className="text-[12px] text-gray-600 py-4 text-center">No servers available</p>
          )}
        </div>
      )}

      {/* Disclaimer Footer */}
      <DisclaimerFooter />
    </div>
  );
}
