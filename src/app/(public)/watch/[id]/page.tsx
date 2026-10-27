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
  streamedpk: { name: "Prime", note: "High quality primary stream", rank: 1 },
  streamed: { name: "Prime", note: "High quality primary stream", rank: 1 },
  delta: { name: "Delta", note: "Okayish backup", rank: 2 },
  golf: { name: "Golf", note: "Third party (more ads), but very stable", rank: 3 },
  echo: { name: "Echo", note: "Great quality overall", rank: 4 },
  // Current feeds. Same note on both on purpose: neither group is presented
  // as better than the other.
  ppv: { name: "Prime", note: "Tap a server to watch", rank: 1 },
  sf: { name: "Nova", note: "Tap a server to watch", rank: 2 },
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

// "04:34:27" / "1d 04:34:27" for the Starts-in line above the player.
function formatStartsIn(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return `${days > 0 ? `${days}d ` : ""}${h}:${m}:${sec}`;
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
  // No server is picked on arrival — the viewer chooses one, so a dead first
  // stream never becomes the first impression of the site.
  const [activeStream, setActiveStream] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [relatedMatches, setRelatedMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveScore, setLiveScore] = useState<{ home: number; away: number; minute: number | null; period: string; league?: string | null } | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [forceLive, setForceLive] = useState(false);
  // Ticks once a second while kickoff is still ahead (drives the "Starts in"
  // line); null until mount so SSR and the first client render match.
  const [now, setNow] = useState<number | null>(null);
  // True once the live-set lookup has resolved, so the view is tracked with the
  // correct forceLive value (avoids a race that logged force-lived viewers as pre).
  const [liveResolved, setLiveResolved] = useState(false);
  const [hotKeys, setHotKeys] = useState<Set<string>>(new Set());
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [adsCfg, setAdsCfg] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/ads-config").then(r => r.json()).then(setAdsCfg).catch(() => {});
  }, []);

  // One-time read of HOT flags and match notices so an upcoming/custom hot match's
  // page is also special (live matches already carry `hot` via the live feed).
  useEffect(() => {
    getMatchFlags()
      .then((f) => {
        setHotKeys(new Set(f.hot));
        if (f.notices?.[rawId]) setMatchNotice(f.notices[rawId]);
      })
      .catch(() => {});
  }, [rawId]);

  const trackedRef = useRef(false);

  const fallbackName = source === "tv"
    ? `TV Channel ${matchId}`
    : matchId
        ?.replace(/^ppv-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "Live Match";

  const displayTitle = currentMatch?.title || fallbackName;
  const hasTeams = showVersus(currentMatch) && bothTeamsHaveVisuals(currentMatch);
  const sportLabel = SPORT_LABELS[currentMatch?.category || ""] || currentMatch?.category || "";
  // Every match page is a live page: player on top, servers below, whatever the
  // clock says. The only other state is ENDED — the match finished (admin
  // ended it, or kickoff was hours ago) and no server is left. A match that
  // can't be found in any current list and has no streams has also ENDED
  // (feeds drop matches once played).
  const matchStatus = source === "tv" ? "live" : (currentMatch ? getMatchStatus(currentMatch) : (loading ? "upcoming" : "ended"));
  const isEnded = !loading && source !== "tv" && !forceLive && streams.length === 0 && matchStatus === "ended";
  const isLive = !isEnded;

  // Kickoff still ahead? Drives the "Starts in" line and keeps pre-kickoff
  // visitors out of the "watching live" count.
  const kickoffAt = source === "tv" ? 0 : (currentMatch?.date || 0);
  const msToKickoff = now === null || !kickoffAt ? 0 : kickoffAt - now;
  const preKickoff = msToKickoff > 0;

  useEffect(() => {
    setNow(Date.now());
    if (!kickoffAt || kickoffAt <= Date.now()) return; // already started — no ticking
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [kickoffAt]);

  // Tell the global heartbeat when this match is over (covers both the FULL
  // TIME page and stale tabs reopened after the match ended), so returning
  // visitors count as online — not as live-stream watchers.
  useEffect(() => {
    const w = window as unknown as { __ppMatchEnded?: boolean };
    w.__ppMatchEnded = isEnded;
    return () => { w.__ppMatchEnded = false; };
  }, [isEnded]);
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
              const res = await fetch(`/api/matches?sport=${sport}`);
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
              if (meta?.custom_notice) setMatchNotice(meta.custom_notice);
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

        // Servers always come from the centralized resolver, whatever the clock
        // says (manual overrides → streamed.pk → auto-fallback; before kickoff the
        // resolver only hands out real streamed.pk / admin servers). Whatever it
        // returns is what the page lists — nothing waits on kickoff.
        {
          const title = current?.title || fallbackName;
          const sport = current?.category || "football";
          const kickoff = current?.date || 0;
          try {
            const res = await fetch(
              `/api/match-streams/${encodeURIComponent(rawId)}?title=${encodeURIComponent(title)}&sport=${encodeURIComponent(sport)}&kickoff=${kickoff}`
            );
            const data = await res.json();
            setStreams(Array.isArray(data.streams) ? data.streams : []);
            if (data?.notice) setMatchNotice(data.notice);
            setActiveStream(null);
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
    if (!isLive || preKickoff) return; // nothing to score before kickoff

    const fetchScore = () => {
      const home = encodeURIComponent(currentMatch.teams!.home!.name);
      const away = encodeURIComponent(currentMatch.teams!.away!.name);
      fetch(`/api/live-score?home=${home}&away=${away}`)
        .then((r) => r.json())
        .then((d) => { if (d.score) setLiveScore(d.score); })
        .catch(() => {});
    };

    return visibleInterval(fetchScore, 90_000);
  }, [currentMatch, isLive, preKickoff]);

  // Servers that aren't there yet show up by themselves: while the list is
  // empty (and the match hasn't ended), ask the resolver again every 60 s and
  // list whatever comes back. Paused in background tabs. Once servers exist
  // the list stays put so a viewer's selection never jumps.
  useEffect(() => {
    if (loading || isEnded || streams.length > 0) return;
    return visibleInterval(retryStreams, 60_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isEnded, streams.length, rawId]);

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
        // Before kickoff a visitor is "waiting", not watching — even though the
        // page already shows the servers.
        is_live: isLive && !(currentMatch.date > Date.now() && source !== "tv"),
      }),
    }).catch(() => {});
    // Presence heartbeats are handled site-wide by <Analytics/> (every 2.5 min,
    // includes match_id on watch pages) — no per-page heartbeat anymore.
  }, [currentMatch, rawId, source, matchStatus, forceLive, liveResolved, isLive]);

  const currentStream = activeStream === null ? undefined : streams[activeStream];

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
      // List whatever came back; the viewer still picks the server themselves.
      if (Array.isArray(data.streams) && data.streams.length > 0) {
        setStreams(data.streams);
      }
      if (data?.notice !== undefined) {
        setMatchNotice(data.notice || null);
      }
    } catch {}
  }

  let noticeText = matchNotice || "";
  let noticeLink = "";
  let noticeLinkText = "";
  if (matchNotice) {
    try {
      if (matchNotice.startsWith("{")) {
        const parsed = JSON.parse(matchNotice);
        noticeText = parsed.text || "";
        noticeLink = parsed.linkUrl || "";
        noticeLinkText = parsed.linkText || "";
      }
    } catch {
      // It's a plain string
    }
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

      {/* Video player + servers (every match), or the FULL TIME card once it has ended */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        {/* Kickoff still ahead: one line of information, like streamed.pk's. It
            changes nothing else on the page — the servers below work regardless. */}
        {!isEnded && preKickoff && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2.5">
            <p className="text-[12.5px] font-bold text-gray-900">
              Starts in <span className="tabular-nums text-blue-700">{formatStartsIn(msToKickoff)}</span>
            </p>
            <p className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">{scheduledTime}</p>
          </div>
        )}
        {!isEnded && adsCfg?.notifications?.wait_banner?.enabled && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-gray-900 leading-snug">
                {activeStream === null
                  ? "Select a server to watch the stream."
                  : adsCfg.notifications.wait_banner.title}
              </p>
              <p className="text-[11.5px] text-gray-600 leading-snug mt-0.5">
                {activeStream === null
                  ? "Pick any server from the list to start the match. If one doesn't play well, tap a different server."
                  : adsCfg.notifications.wait_banner.text}{" "}
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
            ) : streams.length > 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <svg className="w-7 h-7 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Select a server to watch the stream</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {streams.length} server{streams.length === 1 ? "" : "s"} available
                  </p>
                </div>
                <span className="lg:hidden text-[11px] text-gray-500">Server list is below ↓</span>
              </div>
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
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-300">No servers yet</p>
                  <p className="text-xs text-gray-500 mt-1">Check back closer to kickoff —<br />servers are listed here as soon as they exist.</p>
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
                {preKickoff ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[9px] font-bold text-blue-600">
                    STARTS IN {formatStartsIn(msToKickoff)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500">
                    <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                )}
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
                {preKickoff ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[9px] font-bold text-blue-600">
                    STARTS IN {formatStartsIn(msToKickoff)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[9px] font-bold text-red-500">
                    <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                )}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-bold text-gray-500 tracking-widest">CHOOSE STREAM</h3>
          </div>
          {/* Custom Admin Match Recommendation / Notice */}
          {noticeText && (
            <div className="mb-3.5 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/50 shadow-sm flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0 flex items-start gap-3">
                <div className="w-8 h-8 mt-0.5 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0 text-amber-800">
                  <span className="text-base">💡</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500 text-white shadow-xs">
                      Recommendation
                    </span>
                  </div>
                  <p className="text-[13px] font-bold text-gray-900 leading-snug whitespace-pre-wrap">
                    {noticeText}
                  </p>
                </div>
              </div>
              {noticeLink && (
                <a
                  href={noticeLink}
                  target={noticeLink.startsWith("http") ? "_blank" : undefined}
                  rel={noticeLink.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-black tracking-wide uppercase rounded-xl shadow-sm transition-colors"
                >
                  {noticeLinkText || "Click Here"}
                </a>
              )}
            </div>
          )}
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
            <p className="text-[12px] text-gray-600 py-4 text-center">No servers yet — check back closer to kickoff.</p>
          )}
        </div>
      )}

      {/* Disclaimer Footer */}
      <DisclaimerFooter />
    </div>
  );
}
