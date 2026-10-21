"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProMatch } from "../page";
import { findScore, type ScoreInfo } from "@/lib/score-match";
import Hls from "hls.js";

import Script from "next/script";

import { Suspense } from "react";

function AltWatchContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  
  const [match, setMatch] = useState<ProMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeServer, setActiveServer] = useState<any>(null);
  const [customNotice, setCustomNotice] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreInfo[]>([]);
  const [now, setNow] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stopped = false;
    async function loadScores() {
      if (!stopped) setNow(Date.now());
      try {
        const res = await fetch("/api/alt-scores");
        const data = await res.json();
        if (!stopped) setScores(data.scores || []);
      } catch {
        /* scores are an enhancement */
      }
    }
    loadScores();
    const interval = setInterval(loadScores, 60_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  // Re-fetched every 60 s while the tab is visible so servers that get added
  // after kickoff appear without a refresh. The server the viewer picked is
  // untouched by a refresh.
  // A fixture opened before the cron has found its stream shows "finding the
  // stream" and re-checks every 15 s around kickoff (60 s otherwise), so the
  // servers appear on their own. If the cron publishes the real match under a
  // different id, the flags carry that mapping and we follow it.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function load(): Promise<ProMatch | null> {
      try {
        const [res, flagsRes] = await Promise.all([
          fetch(`/api/pro-matches?t=${Date.now()}`, { cache: "no-store" }),
          fetch(`/api/match-flags?t=${Date.now()}`, { cache: "no-store" })
        ]);
        if (stopped) return null;
        
        const data = await res.json();
        const flagsData = await flagsRes.json();
        
        if (id && flagsData.notices && flagsData.notices[id]) {
          setCustomNotice(flagsData.notices[id]);
        }
        
        let matchList: ProMatch[] = [];
        if (Array.isArray(data)) matchList = data;
        else if (data && Array.isArray(data.matches)) matchList = data.matches;
        else if (data && Array.isArray(data.data)) matchList = data.data;
        else if (data && Array.isArray(data.results)) matchList = data.results;
        
        if (id) {
          const liveId: string = flagsData.converted?.[id] || id;
          // Ids are compared with spaces removed: the list page, the admin
          // flags and the cron don't all strip them the same way.
          const norm = (v: string) => v.replace(/\s+/g, "");
          const byId = (want: string) => matchList.find((m: ProMatch) => {
            const mId = `alt-${m.home_team_name}-${m.away_team_name}-${m.match_time}`;
            return norm(mId) === norm(want);
          });
          let targetMatch: ProMatch | undefined = byId(liveId) || byId(id);
          if (!targetMatch && Array.isArray(flagsData.mockFixtures)) {
            // Not published yet: show the fixture itself, with no servers.
            const mock = flagsData.mockFixtures.find((m: any) => m.match_id === id);
            if (mock) targetMatch = { ...mock, match_status: "upcoming", homeTeamScore: "", awayTeamScore: "", servers: [] };
          }
          if (targetMatch) {
            // Deliberately no auto-play: the viewer picks a server themselves,
            // so a dead first server never becomes the first impression.
            setMatch(targetMatch);
            return targetMatch;
          }
        }
      } catch (e) {
        console.error("Failed to load match:", e);
      } finally {
        if (!stopped) setLoading(false);
      }
      return null;
    }
    const run = async () => {
      if (stopped) return;
      let m: ProMatch | null = null;
      if (!document.hidden) m = await load();
      if (stopped) return;
      const ko = Number(m?.match_time || 0) * 1000;
      const waiting = !!m && (m.servers?.length ?? 0) === 0 && ko > 0 && Date.now() >= ko - 10 * 60_000 && Date.now() <= ko + 15 * 60_000;
      timer = setTimeout(run, waiting ? 15_000 : 60_000);
    };
    const onVisible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); run(); } };
    document.addEventListener("visibilitychange", onVisible);
    run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id]);

  useEffect(() => {
    let hls: Hls | null = null;
    
    // Attempt to load Hls.js if needed
    if (activeServer && videoRef.current) {
      if (activeServer.type === "iframe") {
        // Handled in render
      } else if (activeServer.url.includes(".m3u8")) {
        const video = videoRef.current;
        // Upgrade HTTP to HTTPS automatically to avoid Mixed Content errors
        const src = activeServer.url.replace("http://", "https://");

        // Try to load HLS
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Native Safari
          video.src = src;
        } else if (Hls.isSupported()) {
          // Hls.js
          hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      }
    }
    
    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [activeServer]);

  if (loading) {
    return <div className="p-10 text-center text-gray-400">Loading alternative stream...</div>;
  }

  if (!match) {
    return <div className="p-10 text-center text-gray-400">Match not found.</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8 min-h-screen">
      <div className="mb-6">
        <Link href="/alt" className="text-emerald-600 hover:text-emerald-500 font-bold text-sm">
          &larr; Back to Alternative Matches
        </Link>
        <h1 className="text-2xl font-black text-gray-900 mt-4">{match.home_team_name} vs {match.away_team_name}</h1>
        {(() => {
          const score = id
            ? findScore(scores, id, match.home_team_name, match.away_team_name)
            : null;
          const endedByClock =
            now > 0 &&
            Number(match.match_time) > 0 &&
            now > Number(match.match_time) * 1000 + 130 * 60_000;
          // Ignore a "finished" flag that arrives before the match could be
          // over — feeds sometimes mark a fixture ended before kickoff.
          const couldBeOver =
            now > 0 &&
            Number(match.match_time) > 0 &&
            now > Number(match.match_time) * 1000 + 70 * 60_000;
          const isEnded =
            match.match_status === "ended" || (!!score?.ended && couldBeOver) || endedByClock;
          const liveByClock = now > 0 && Number(match.match_time) > 0 && now >= Number(match.match_time) * 1000 - 10 * 60_000;
          const scoreText =
            score && score.homeScore != null && score.awayScore != null
              ? ` • ${score.homeScore} - ${score.awayScore}${
                  isEnded ? "" : score.period === "HT" ? " (HT)" : score.minute ? ` (${score.minute}')` : ""
                }`
              : "";
          return (
            <p className="text-gray-500 text-sm">
              {match.league_name} •{" "}
              {isEnded ? "⏹ Ended" : match.match_status === "live" || liveByClock ? "🔴 LIVE" : "Upcoming"}
              {scoreText}
            </p>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {customNotice && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-sm text-amber-900 font-medium whitespace-pre-wrap mt-0.5">{customNotice}</p>
            </div>
          )}
          {(match.servers?.length ?? 0) > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
              <span className="text-lg shrink-0">⚠️</span>
              <p className="text-[13px] text-blue-900 font-medium mt-0.5">
                Stream not working? Tap a different server — servers vary in speed and quality, so
                switch until one plays well for you.
              </p>
            </div>
          )}
          <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-xl relative">
            {activeServer ? (
              activeServer.type === "iframe" || activeServer.url.includes("embed") ? (
                <iframe 
                  src={activeServer.url.replace("http://", "https://")} 
                  className="w-full h-full border-0 bg-black" 
                  allowFullScreen
                  sandbox="allow-same-origin allow-scripts"
                />
              ) : (
                <video 
                  ref={videoRef}
                  controls 
                  autoPlay
                  playsInline
                  className="w-full h-full bg-black outline-none"
                />
              )
            ) : (match.servers?.length ?? 0) > 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                <span className="text-4xl">▶</span>
                <p className="text-white font-bold text-lg">
                  {match.home_team_name} vs {match.away_team_name}
                </p>
                <p className="text-gray-400 text-sm">
                  Choose a server {`(${match.servers.length} available)`} to start watching
                </p>
                <span className="lg:hidden text-gray-500 text-xs">Server list is below ↓</span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" /></span>
                <p className="text-white font-bold text-lg">{match.home_team_name} vs {match.away_team_name}</p>
                <p className="text-gray-400 text-sm">Finding the stream… it appears here by itself the moment it&rsquo;s ready. No need to refresh.</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Servers</h3>
          <div className="flex flex-col gap-2">
            {match.servers?.map((server, i) => (
              <button
                key={i}
                onClick={() => setActiveServer(server)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  activeServer?.url === server.url 
                    ? "bg-emerald-50 border-emerald-500 text-emerald-600 font-bold shadow-sm" 
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700 hover:border-gray-300"
                }`}
              >
                {server.name} {server.type && <span className="text-[10px] uppercase opacity-50 ml-2">({server.type})</span>}
                {server.url.startsWith("http://") && <span className="block text-[9px] text-red-400 mt-1">HTTP Only (May require new tab)</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AltWatchPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-400">Loading alternative stream...</div>}>
      <AltWatchContent />
    </Suspense>
  );
}
