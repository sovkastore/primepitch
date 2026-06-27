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

  const liveCount = CRICKET_MATCHES.filter(m => m.status === "live").length;
  const todayCount = CRICKET_MATCHES.filter(m => m.status === "today").length;
  const tomorrowCount = CRICKET_MATCHES.filter(m => m.status === "tomorrow").length;

  const reset = () => {
    setSelectedMatch(null);
    setActiveChannelId(null);
  };

  const handleWatchClick = (match: Match) => {
    setSelectedMatch(match);
    setActiveChannelId(null);
  };

  const renderBreadcrumb = () => (
    <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium mb-6 uppercase tracking-wider">
      <Link href="/" className="hover:text-emerald-500">Home</Link>
      <span>/</span>
      <button onClick={reset} className="hover:text-emerald-500">Cricket</button>
      {selectedMatch && (
        <>
          <span>/</span>
          <span className="text-gray-600 truncate max-w-[150px]">{selectedMatch.title}</span>
        </>
      )}
    </div>
  );

  // 1. MATCH LIST VIEW
  if (!selectedMatch) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        {renderBreadcrumb()}
        
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">Cricket Live Streaming</h1>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-emerald-500 rounded text-[10px] font-black text-white">{liveCount} LIVE NOW</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[11px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-6 py-3 w-12">#</th>
                  <th className="px-4 py-3 w-24">Time</th>
                  <th className="px-4 py-3">Competition</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {/* LIVE NOW SECTION */}
                <tr className="bg-gray-900">
                  <td colSpan={5} className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      <span className="text-[11px] font-black text-white tracking-widest uppercase">Live Now</span>
                      <span className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[10px] font-black text-white ml-1">{liveCount}</span>
                    </div>
                  </td>
                </tr>
                {CRICKET_MATCHES.filter(m => m.status === "live").map((m, idx) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                    <td className="px-6 py-4 text-gray-400 font-bold">{idx + 1}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-50 border border-red-100 rounded text-[9px] font-black text-red-600">
                        <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse"></span>
                        LIVE
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 font-medium">{m.competition}</td>
                    <td className="px-4 py-4 text-gray-900 font-black">{m.title}</td>
                    <td className="px-4 py-4 text-right">
                      <button 
                        onClick={() => handleWatchClick(m)}
                        className="btn-gradient px-5 py-2 rounded-lg text-white text-[11px] font-black tracking-widest uppercase"
                      >
                        ▶ Watch
                      </button>
                    </td>
                  </tr>
                ))}

                {/* TODAY SECTION */}
                <tr className="bg-gray-100/80">
                  <td colSpan={5} className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-gray-600 tracking-widest uppercase">Today</span>
                      <span className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-[10px] font-black text-white ml-1">{todayCount}</span>
                    </div>
                  </td>
                </tr>
                {CRICKET_MATCHES.filter(m => m.status === "today").map((m, idx) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                    <td className="px-6 py-4 text-gray-400 font-bold">{liveCount + idx + 1}</td>
                    <td className="px-4 py-4 text-gray-600 font-black tabular-nums">{m.time}</td>
                    <td className="px-4 py-4 text-gray-500 font-medium">{m.competition}</td>
                    <td className="px-4 py-4 text-gray-900 font-black">{m.title}</td>
                    <td className="px-4 py-4 text-right">
                      <button 
                        onClick={() => handleWatchClick(m)}
                        className="btn-gradient px-5 py-2 rounded-lg text-white text-[11px] font-black tracking-widest uppercase"
                      >
                        ▶ Watch
                      </button>
                    </td>
                  </tr>
                ))}

                {/* TOMORROW SECTION */}
                <tr className="bg-gray-100/80">
                  <td colSpan={5} className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-gray-600 tracking-widest uppercase">Tomorrow</span>
                      <span className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-[10px] font-black text-white ml-1">{tomorrowCount}</span>
                    </div>
                  </td>
                </tr>
                {CRICKET_MATCHES.filter(m => m.status === "tomorrow").map((m, idx) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                    <td className="px-6 py-4 text-gray-400 font-bold">{liveCount + todayCount + idx + 1}</td>
                    <td className="px-4 py-4 text-gray-600 font-black tabular-nums">{m.time}</td>
                    <td className="px-4 py-4 text-gray-500 font-medium">{m.competition}</td>
                    <td className="px-4 py-4 text-gray-900 font-black">{m.title}</td>
                    <td className="px-4 py-4 text-right">
                      <button 
                        onClick={() => handleWatchClick(m)}
                        className="btn-gradient px-5 py-2 rounded-lg text-white text-[11px] font-black tracking-widest uppercase"
                      >
                        ▶ Watch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 2. PLAYER / CHANNEL SELECTION VIEW
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {renderBreadcrumb()}

      <div className="grid grid-cols-1 gap-8">
        {/* Match Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">🏏</div>
            <div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{selectedMatch.competition}</p>
              <h2 className="text-xl md:text-2xl font-black text-gray-900">{selectedMatch.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <span className="px-3 py-1 bg-red-500 rounded text-[10px] font-black text-white animate-pulse">LIVE NOW</span>
             <button onClick={reset} className="text-[12px] font-bold text-gray-400 hover:text-gray-900">Close Player ×</button>
          </div>
        </div>

        {/* Player Area */}
        {activeChannelId ? (
          <div className="space-y-6">
            <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl aspect-video border-4 border-emerald-500/20">
              <iframe
                src={`https://stream.crichd.sc/update/fetch.php?hd=${activeChannelId}&embed=1`}
                width="100%"
                height="100%"
                scrolling="no"
                frameBorder="0"
                allowFullScreen={true}
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 w-full h-full"
              ></iframe>
            </div>
            
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
               <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-black text-emerald-400 tracking-widest uppercase">Switch Channel</p>
                  <p className="text-[11px] text-gray-500">Source: stream.crichd.sc</p>
               </div>
               <div className="flex flex-wrap gap-2">
                 {selectedMatch.channels.map(ch => (
                   <button 
                     key={ch.id}
                     onClick={() => setActiveChannelId(ch.id)}
                     className={`px-4 py-2 rounded-lg text-[11px] font-black transition-all ${
                       activeChannelId === ch.id 
                       ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" 
                       : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
             <h3 className="text-lg font-bold text-gray-900 mb-6">Select a channel to start streaming</h3>
             <div className="max-w-md mx-auto grid grid-cols-1 gap-3">
               {selectedMatch.channels.map(ch => (
                 <button 
                   key={ch.id}
                   onClick={() => setActiveChannelId(ch.id)}
                   className="w-full flex items-center justify-between px-6 py-4 rounded-xl border-2 border-gray-50 bg-gray-50/50 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                 >
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform">📺</div>
                      <span className="text-[13px] font-black text-gray-900">{ch.name}</span>
                   </div>
                   <span className="text-[11px] font-bold text-emerald-600 px-3 py-1 bg-emerald-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity uppercase">Watch HD</span>
                 </button>
               ))}
             </div>
             <button onClick={reset} className="mt-8 text-[12px] font-bold text-gray-400 hover:text-gray-900">← Back to Schedule</button>
          </div>
        )}
      </div>
    </div>
  );
}
