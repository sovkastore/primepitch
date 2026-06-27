"use client";

import { useState } from "react";
import Link from "next/link";

interface Channel {
  name: string;
  id: number;
}

interface Match {
  id: number;
  time: string;
  competition: string;
  title: string;
  status: "live" | "today" | "tomorrow" | "upcoming";
  channels: Channel[];
}

const CRICKET_MATCHES: Match[] = [
  // LIVE NOW
  {
    id: 1,
    time: "LIVE",
    competition: "International Cricket",
    title: "England vs New Zealand",
    status: "live",
    channels: [
      { name: "Sky Sports Cricket", id: 2 },
      { name: "Willow Cricket", id: 29 }
    ]
  },
  {
    id: 2,
    time: "LIVE",
    competition: "International Cricket",
    title: "Bangladesh vs Australia",
    status: "live",
    channels: [
      { name: "Star Sports 1", id: 25 },
      { name: "Willow Cricket", id: 29 }
    ]
  },
  {
    id: 3,
    time: "LIVE",
    competition: "International Cricket",
    title: "West Indies vs Sri Lanka",
    status: "live",
    channels: [
      { name: "TNT Sports 3", id: 14 },
      { name: "Willow Cricket", id: 29 }
    ]
  },
  {
    id: 4,
    time: "LIVE",
    competition: "International Cricket",
    title: "Ireland vs India",
    status: "live",
    channels: [
      { name: "Star Sports 1", id: 25 },
      { name: "Sky Sports Cricket", id: 2 }
    ]
  },
  {
    id: 5,
    time: "LIVE",
    competition: "ICC Women's T20 World Cup",
    title: "Ireland Cricket Women vs West Indies Cricket Women",
    status: "live",
    channels: [
      { name: "Sky Sports Mix", id: 7 }
    ]
  },
  // TODAY
  {
    id: 6,
    time: "17:30",
    competition: "ICC Women's T20 World Cup",
    title: "England Cricket Women vs New Zealand Cricket Women",
    status: "today",
    channels: [
      { name: "Sky Sports Cricket", id: 2 },
      { name: "Willow Cricket", id: 29 }
    ]
  },
  // TOMORROW
  {
    id: 7,
    time: "13:30",
    competition: "ICC Women's T20 World Cup",
    title: "Australia Cricket Women vs India Cricket Women",
    status: "tomorrow",
    channels: [
      { name: "Star Sports 1", id: 25 },
      { name: "Sky Sports Cricket", id: 2 }
    ]
  },
  {
    id: 8,
    time: "21:30",
    competition: "Major League Cricket",
    title: "Los Angeles Knight Riders vs Seattle Orcas",
    status: "tomorrow",
    channels: [
      { name: "Willow Cricket", id: 29 },
      { name: "TNT Sports 1", id: 12 }
    ]
  }
];

export default function CricketPage() {
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  const liveMatches = CRICKET_MATCHES.filter(m => m.status === "live");
  const todayMatches = CRICKET_MATCHES.filter(m => m.status === "today");
  const tomorrowMatches = CRICKET_MATCHES.filter(m => m.status === "tomorrow");

  const reset = () => {
    setSelectedMatch(null);
    setActiveChannelId(null);
  };

  const handleWatchClick = (match: Match) => {
    setSelectedMatch(match);
    setActiveChannelId(null);
  };

  const renderBreadcrumb = () => (
    <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium mb-4 px-4 uppercase tracking-wider">
      <Link href="/" className="hover:text-emerald-500">Home</Link>
      <span>/</span>
      <button onClick={reset} className="hover:text-emerald-500">Cricket</button>
      {selectedMatch && (
        <>
          <span>/</span>
          <span className="text-gray-600 truncate max-w-[120px]">{selectedMatch.title}</span>
        </>
      )}
    </div>
  );

  const MatchRow = ({ match }: { match: Match }) => (
    <div className="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-emerald-50/20 transition-colors w-full gap-3">
      {/* Time/Status Column */}
      <div className="w-14 md:w-20 shrink-0 text-center">
        {match.status === "live" ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-[9px] font-black text-red-600 tracking-tighter">LIVE</span>
          </div>
        ) : (
          <span className="text-[12px] font-black text-gray-700 tabular-nums">{match.time}</span>
        )}
      </div>

      {/* Info Column */}
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-tight truncate mb-0.5">
          {match.competition}
        </p>
        <h4 className="text-[13px] md:text-[15px] font-black text-gray-900 leading-tight">
          {match.title}
        </h4>
      </div>

      {/* Watch Button */}
      <div className="shrink-0">
        <button 
          onClick={() => handleWatchClick(match)}
          className="btn-gradient px-4 py-2.5 rounded-xl text-white text-[10px] font-black tracking-widest uppercase flex items-center gap-2 shadow-sm active:scale-95 transition-transform"
        >
          <span className="hidden sm:inline">WATCH</span>
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </button>
      </div>
    </div>
  );

  // 1. MATCH LIST VIEW
  if (!selectedMatch) {
    return (
      <div className="max-w-[1200px] mx-auto py-6">
        {renderBreadcrumb()}
        
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mx-3">
          {/* Main Title Banner */}
          <div className="p-5 border-b border-gray-100 bg-white flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">Cricket Live</h1>
              <p className="text-[11px] text-gray-400 font-medium">All Match Streaming Schedule</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="px-2 py-1 bg-red-500 rounded text-[9px] font-black text-white animate-pulse uppercase">{liveMatches.length} Live</span>
            </div>
          </div>

          <div className="flex flex-col w-full">
            {/* SECTION: LIVE */}
            <div className="bg-gray-900 px-5 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-white tracking-widest uppercase">Live Now</span>
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{liveMatches.length} Match</span>
            </div>
            {liveMatches.map(m => <MatchRow key={m.id} match={m} />)}

            {/* SECTION: TODAY */}
            <div className="bg-gray-50 px-5 py-2 flex items-center justify-between border-y border-gray-100">
              <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase">Today</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">{todayMatches.length} Match</span>
            </div>
            {todayMatches.map(m => <MatchRow key={m.id} match={m} />)}

            {/* SECTION: TOMORROW */}
            <div className="bg-gray-50 px-5 py-2 flex items-center justify-between border-y border-gray-100">
              <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase">Tomorrow</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">{tomorrowMatches.length} Match</span>
            </div>
            {tomorrowMatches.map(m => <MatchRow key={m.id} match={m} />)}
          </div>
        </div>
      </div>
    );
  }

  // 2. PLAYER / CHANNEL SELECTION VIEW
  return (
    <div className="max-w-[1200px] mx-auto px-3 py-6">
      {renderBreadcrumb()}

      <div className="grid grid-cols-1 gap-6">
        {/* Match Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shadow-inner">🏏</div>
             <div className="min-w-0">
               <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">{selectedMatch.competition}</p>
               <h2 className="text-lg md:text-xl font-black text-gray-900 leading-tight pr-4">{selectedMatch.title}</h2>
             </div>
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-none pt-4 md:pt-0 mt-2 md:mt-0">
             <span className="px-2.5 py-1 bg-red-500 rounded text-[9px] font-black text-white animate-pulse">LIVE NOW</span>
             <button onClick={reset} className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-gray-200">CLOSE ×</button>
          </div>
        </div>

        {/* Player Area */}
        {activeChannelId ? (
          <div className="space-y-6">
            <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl aspect-video border-2 md:border-4 border-emerald-500/20">
              <iframe
                src={`https://stream.crichd.sc/update/fetch.php?hd=${activeChannelId}&embed=1`}
                width="100%"
                height="100%"
                scrolling="no"
                frameBorder="0"
                allowFullScreen={true}
                className="absolute inset-0 w-full h-full"
              ></iframe>
            </div>
            
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
               <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-emerald-400 tracking-widest uppercase">Switch Channel</p>
                  <p className="text-[9px] text-gray-500">Source: crichd.sc</p>
               </div>
               <div className="flex flex-wrap gap-2.5">
                 {selectedMatch.channels.map(ch => (
                   <button 
                     key={ch.id}
                     onClick={() => setActiveChannelId(ch.id)}
                     className={`px-4 py-2 rounded-xl text-[10px] md:text-[11px] font-black transition-all ${
                       activeChannelId === ch.id 
                       ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" 
                       : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                     }`}
                   >
                     {ch.name}
                   </button>
                 ))}
               </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
             <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <h3 className="text-lg font-black text-gray-900 mb-6">Start Watching</h3>
             <div className="max-w-sm mx-auto grid grid-cols-1 gap-3">
               {selectedMatch.channels.map(ch => (
                 <button 
                   key={ch.id}
                   onClick={() => setActiveChannelId(ch.id)}
                   className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border-2 border-gray-50 bg-gray-50/50 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                 >
                   <span className="text-[13px] font-black text-gray-900">{ch.name}</span>
                   <span className="text-[10px] font-bold text-white px-3 py-1 bg-emerald-500 rounded-lg uppercase shadow-sm">Watch</span>
                 </button>
               ))}
             </div>
             <button onClick={reset} className="mt-8 text-[11px] font-bold text-gray-400 hover:text-gray-600 tracking-widest uppercase">← Back to Matches</button>
          </div>
        )}
      </div>
    </div>
  );
}
