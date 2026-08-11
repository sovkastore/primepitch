"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProMatch } from "../page";
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [res, flagsRes] = await Promise.all([
          fetch("/api/pro-matches"),
          fetch(`/api/match-flags?t=${Date.now()}`)
        ]);
        
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
          const targetMatch = matchList.find((m: ProMatch) => {
            const mId = `alt-${m.home_team_name.replace(/\\s+/g, '')}-${m.away_team_name.replace(/\\s+/g, '')}-${m.match_time}`;
            return mId === id;
          });
          
          if (targetMatch) {
            setMatch(targetMatch);
            if (targetMatch.servers && targetMatch.servers.length > 0) {
              setActiveServer(targetMatch.servers[0]);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load match:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
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
        <p className="text-gray-500 text-sm">{match.league_name} • {match.match_status === "live" ? "🔴 LIVE" : "Upcoming"}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {customNotice && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-sm text-amber-900 font-medium whitespace-pre-wrap mt-0.5">{customNotice}</p>
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
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                No streams available yet.
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
                  activeServer === server 
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
