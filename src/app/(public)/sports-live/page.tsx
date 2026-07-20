"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import PreRollGate from "@/components/PreRollGate";
import DisclaimerFooter from "@/components/DisclaimerFooter";

interface StreamSource {
  label: string;
  url: string;
  type: "hls" | "embed" | "hls-cors" | "dash" | "mp4" | "youtube" | "twitch";
}

interface ManualMatch {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  status: "live" | "today" | "tomorrow" | "hidden";
  streams: StreamSource[];
}

export default function SportsLivePage() {
  const [matches, setMatches] = useState<ManualMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<ManualMatch | null>(null);
  const [activeStreamIdx, setActiveStreamIdx] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const shakaRef = useRef<any>(null);

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    setLoading(true);
    try {
      const res = await fetch("/api/sports-live");
      const d = await res.json();
      setMatches(d.matches || []);
    } catch (e) {
      console.error("Fetch Error:", e);
    }
    setLoading(false);
  }

  const isLiveNow = (m: ManualMatch) => {
    if (m.status === "live") return true;
    if (m.status === "hidden") return false;
    
    const now = new Date();
    const start = new Date(m.starts_at);
    const diffMs = now.getTime() - start.getTime();
    // Live if started in last 8 hours
    return diffMs >= 0 && diffMs < (8 * 60 * 60 * 1000);
  };

  const liveMatches = matches.filter(m => isLiveNow(m));
  const upcomingMatches = matches.filter(m => !isLiveNow(m) && m.status !== "hidden");

  const reset = () => {
    setSelectedMatch(null);
    setActiveStreamIdx(0);
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }
    if (shakaRef.current) {
        shakaRef.current.destroy();
        shakaRef.current = null;
    }
  };

  const handleWatch = (match: ManualMatch) => {
    setSelectedMatch(match);
    setActiveStreamIdx(0);
    setIframeLoaded(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // HLS / DASH / MP4 logic
  useEffect(() => {
    if (!selectedMatch) return;
    const stream = selectedMatch.streams[activeStreamIdx];
    
    // Clean up previous players
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (shakaRef.current) { shakaRef.current.destroy(); shakaRef.current = null; }
    if (videoRef.current) { videoRef.current.src = ""; }

    if (!stream || (stream.type !== "hls" && stream.type !== "hls-cors" && stream.type !== "dash" && stream.type !== "mp4")) {
        return;
    }

    const initPlayer = async () => {
        if (typeof window === "undefined" || !videoRef.current) return;
        
        // ---- CASE: MP4 ----
        if (stream.type === "mp4") {
            videoRef.current.src = stream.url;
            return;
        }

        // ---- CASE: HLS ----
        if (stream.type === "hls" || stream.type === "hls-cors") {
            if (!(window as any).Hls) {
                await new Promise((resolve) => {
                    const s = document.createElement("script");
                    s.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
                    s.onload = resolve;
                    document.head.appendChild(s);
                });
            }
            const Hls = (window as any).Hls;
            if (Hls.isSupported()) {
                const isCors = stream.type === "hls-cors";
                const config = isCors ? {
                    xhrSetup: function(xhr: any, url: string) {
                        xhr.open('GET', 'https://corsproxy.io/?' + encodeURIComponent(url), true);
                    }
                } : {};
                const hls = new Hls(config);
                hls.loadSource(stream.url);
                hls.attachMedia(videoRef.current!);
                hlsRef.current = hls;
            } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
                videoRef.current.src = stream.url;
            }
        }

        // ---- CASE: DASH ----
        if (stream.type === "dash") {
            if (!(window as any).shaka) {
                await new Promise((resolve) => {
                    const s = document.createElement("script");
                    s.src = "https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.3.5/shaka-player.compiled.js";
                    s.onload = resolve;
                    document.head.appendChild(s);
                });
            }
            const shaka = (window as any).shaka;
            shaka.polyfill.installAll();
            if (shaka.Player.isBrowserSupported()) {
                const player = new shaka.Player(videoRef.current);
                shakaRef.current = player;
                try {
                    await player.load(stream.url);
                } catch (e) {
                    console.error("Shaka Load Error", e);
                }
            }
        }
    };

    initPlayer();

    return () => {
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        if (shakaRef.current) { shakaRef.current.destroy(); shakaRef.current = null; }
    };
  }, [selectedMatch, activeStreamIdx]);

  const currentStream = selectedMatch?.streams[activeStreamIdx];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Loading Sports Live...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 transition-all">
          <Link href="/" className="hover:text-emerald-500 transition-colors">Home</Link>
          <span className="text-gray-300">/</span>
          <button onClick={reset} className="hover:text-emerald-500 transition-colors">Sports Live</button>
          {selectedMatch && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-gray-900 truncate max-w-[150px]">{selectedMatch.title}</span>
            </>
          )}
        </div>

        {!selectedMatch ? (
          <div className="space-y-10">
            {/* Hero Header */}
            <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-4 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Live Coverage Active</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-none italic uppercase">Sports Live</h1>
                <p className="text-[13px] md:text-15px text-gray-500 font-bold max-w-lg leading-relaxed">
                  Live streams for sports events.
                </p>
              </div>
              <div className="hidden lg:block">
                 <div className="w-24 h-24 bg-emerald-500 rounded-3xl rotate-12 flex items-center justify-center text-5xl shadow-2xl shadow-emerald-500/20">🏆</div>
              </div>
            </div>

            {/* Live Matches Grid */}
            <div className="space-y-4">
               <div className="flex items-center justify-between px-2">
                 <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <h2 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.2em]">Live Coverage</h2>
                 </div>
                 <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded uppercase">{liveMatches.length} Matches</span>
               </div>
               
               {liveMatches.length === 0 ? (
                 <div className="bg-white rounded-[2rem] p-12 text-center border border-gray-100 border-dashed">
                    <p className="text-gray-400 font-black text-[13px] uppercase tracking-widest">No live matches at this moment.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {liveMatches.map(m => (
                     <div key={m.id} className="bg-white rounded-[1.5rem] p-1 border border-gray-100 hover:border-emerald-200 shadow-sm transition-all group">
                        <div className="p-5 flex flex-col h-full">
                           <div className="flex items-center justify-between mb-4">
                             <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest px-2 py-0.5 bg-emerald-50 rounded">{m.category}</span>
                             <span className="text-[10px] font-black text-red-500 animate-pulse uppercase">Live</span>
                           </div>
                           <h3 className="text-lg font-black text-gray-900 leading-tight mb-6 flex-1">{m.title}</h3>
                           <button 
                             onClick={() => handleWatch(m)}
                             className="w-full py-4 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 group-hover:bg-emerald-500 transition-all shadow-xl shadow-gray-900/10 group-hover:shadow-emerald-500/20"
                           >
                             Watch Stream
                             <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                           </button>
                        </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>

            {/* Upcoming Grid */}
            {upcomingMatches.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] px-2">Upcoming Events</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                   {upcomingMatches.map(m => (
                     <div key={m.id} className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl filter grayscale group-hover:grayscale-0 transition-all">🏅</div>
                           <div>
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{m.category}</p>
                              <h4 className="text-[15px] font-black text-gray-900">{m.title}</h4>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[12px] font-black text-gray-900 tabular-nums">
                             {new Date(m.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                           </p>
                           <p className="text-[9px] font-bold text-gray-400 uppercase">
                             {new Date(m.starts_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                           </p>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 flex flex-col gap-6">
               <div className="relative w-full bg-black rounded-[2rem] overflow-hidden shadow-2xl aspect-video border-2 border-gray-200">
                  {currentStream ? (
                    <>
                      {currentStream.type === "embed" || currentStream.type === "youtube" || currentStream.type === "twitch" ? (
                        <iframe
                          key={currentStream.url}
                          src={
                            currentStream.type === "youtube" 
                              ? `https://www.youtube.com/embed/${currentStream.url}`
                              : currentStream.type === "twitch"
                                ? `https://player.twitch.tv/?channel=${currentStream.url}&parent=${window.location.hostname}`
                                : currentStream.url
                          }
                          className="absolute inset-0 w-full h-full"
                          allowFullScreen
                          allow="encrypted-media; autoplay"
                          onLoad={() => setIframeLoaded(true)}
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          className="absolute inset-0 w-full h-full"
                          controls
                          playsInline
                          autoPlay
                        />
                      )}
                      
                      {currentStream.type === "embed" && !iframeLoaded && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black text-center">
                          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Warming up the stream...</p>
                        </div>
                      )}

                      <PreRollGate page="sports-live" streamKey={currentStream.url} />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-black uppercase text-[12px] tracking-widest">
                       Select a source to begin
                    </div>
                  )}
               </div>

               <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                     <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl shadow-inner">🏅</div>
                     <div>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">{selectedMatch.category}</p>
                        <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-tight">{selectedMatch.title}</h2>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className="px-3 py-1 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest animate-pulse">Live Stream</span>
                     <button onClick={reset} className="px-4 py-2 bg-gray-100 rounded-xl text-[11px] font-black text-gray-500 hover:bg-gray-200 transition-colors uppercase tracking-widest">Close ×</button>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <div className="bg-gray-900 rounded-[2rem] p-6 md:p-8 border border-gray-800 shadow-2xl">
                    <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mb-6 px-1">Available Servers</h3>
                    <div className="grid grid-cols-1 gap-3">
                       {selectedMatch.streams.map((s, idx) => (
                         <button 
                           key={idx}
                           onClick={() => {
                             setActiveStreamIdx(idx);
                             setIframeLoaded(false);
                           }}
                           className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all transition-colors duration-300 ${
                             activeStreamIdx === idx 
                             ? "bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20" 
                             : "bg-gray-800 border-transparent hover:border-gray-700 hover:bg-gray-750"
                           }`}
                         >
                           <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activeStreamIdx === idx ? 'bg-black/10' : 'bg-gray-700'}`}>
                                <svg className={`w-3.5 h-3.5 ${activeStreamIdx === idx ? 'text-white' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                              </div>
                              <span className={`text-[14px] font-black ${activeStreamIdx === idx ? 'text-black' : 'text-gray-300'}`}>{s.label}</span>
                           </div>
                           <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${activeStreamIdx === idx ? 'bg-black/10 text-black' : 'bg-gray-700 text-gray-500'}`}>{s.type}</span>
                         </button>
                       ))}
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] p-8 border border-gray-100">
                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Live Chat</h4>
                    <div className="aspect-[4/5] bg-gray-50 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-100">
                        <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Chat Disabled</p>
                    </div>
                </div>
            </div>
          </div>
        )}
      </div>
      
      <DisclaimerFooter />
    </div>
  );
}
