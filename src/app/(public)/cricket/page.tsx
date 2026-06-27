"use client";

import { useState } from "react";
import Link from "next/link";

const CRICKET_CHANNELS = [
  { name: "Sky Sports Cricket", id: 2 },
  { name: "Willow Cricket", id: 29 },
  { name: "Star Sports 1", id: 25 },
  { name: "Star Sports 1 Hindi", id: 26 },
  { name: "Sky Sport 3 NZ", id: 60 },
  { name: "Sky Sport 4 NZ", id: 61 },
  { name: "Sky Sports Main Event", id: 1 },
  { name: "Sky Sports Mix", id: 7 },
  { name: "TNT Sports 1", id: 12 },
  { name: "TNT Sports 3", id: 14 },
];

const CRICKET_SCHEDULE = [
  { tournament: "English T20 Blast", match: "Kent Spitfires vs Notts Outlaws", time: "LIVE" },
  { tournament: "Major League Cricket", match: "MI New York vs Texas Super Kings", time: "Today 23:30" },
  { tournament: "Major League Cricket", match: "San Francisco Unicorns vs Seattle Orcas", time: "Tomorrow 01:00" },
  { tournament: "ICC Women's T20 World Cup", match: "England Cricket Women vs New Zealand Cricket Women", time: "Tomorrow 14:00" },
  { tournament: "ICC Women's T20 World Cup", match: "Australia Cricket Women vs India Cricket Women", time: "Tomorrow 18:30" },
];

export default function CricketPage() {
  const [activeChannelId, setActiveChannelId] = useState(2);

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8 pb-24 md:pb-8">
      {/* Top Navigation / Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-emerald-600 transition-colors font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to All Sports
        </Link>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">Live Now</span>
        </div>
      </div>

      {/* Header Section */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-3xl shadow-sm">
          🏏
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Cricket Live</h1>
          <p className="text-sm text-gray-500 mt-1">Watch live cricket streams from around the world in HD.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Player Area */}
        <div className="lg:col-span-8 space-y-6">
          <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-200 aspect-video">
            <iframe
              src={`https://crichd.vip/update/fetch.php?hd=${activeChannelId}`}
              width="100%"
              height="100%"
              marginWidth={0}
              marginHeight={0}
              scrolling="no"
              frameBorder="0"
              allowFullScreen={true}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              className="absolute inset-0 w-full h-full"
            ></iframe>
          </div>

          {/* Buffering Hint */}
          <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
            <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] text-emerald-800 leading-relaxed">
              <strong>Pro Tip:</strong> If the stream doesn't load immediately, please wait a few seconds for the player to initialize. 
              Our dynamic player handles the best quality automatically.
            </p>
          </div>
        </div>

        {/* Channel Switcher Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[12px] font-extrabold text-gray-400 tracking-widest uppercase mb-4 px-1">Choose Channel</h3>
            <div className="grid grid-cols-1 gap-2">
              {CRICKET_CHANNELS.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`server-btn text-left flex items-center justify-between group ${
                    activeChannelId === channel.id ? "active" : ""
                  }`}
                >
                  <span>{channel.name}</span>
                  {activeChannelId === channel.id && (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                  )}
                  {activeChannelId !== channel.id && (
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* Active Status Card */}
          <div className="bg-gray-900 rounded-2xl p-5 text-white shadow-lg overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
              </svg>
            </div>
            <p className="text-[10px] font-black text-emerald-400 tracking-widest uppercase mb-1">Now Watching</p>
            <h4 className="text-lg font-bold truncate">
              {CRICKET_CHANNELS.find(c => c.id === activeChannelId)?.name}
            </h4>
            <div className="mt-4 flex items-center gap-3">
              <span className="px-2 py-0.5 bg-emerald-500 rounded text-[9px] font-black text-black tracking-tight uppercase">High Definition</span>
              <span className="text-[11px] text-gray-400 font-medium">Source: CricHD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Schedules Section */}
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
          <h2 className="text-xl font-bold text-gray-900">Cricket Schedule</h2>
          <span className="text-xs text-gray-400 font-medium ml-2">Upcoming Fixtures</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
          {CRICKET_SCHEDULE.map((item, idx) => (
            <div 
              key={idx} 
              className="group flex flex-col lg:flex-row lg:items-center justify-between p-4 lg:p-5 bg-white border border-gray-100 rounded-2xl hover:border-emerald-200 hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-center gap-4">
                <div className="hidden lg:flex w-10 h-10 rounded-xl bg-gray-50 items-center justify-center text-lg group-hover:bg-emerald-50 transition-colors">
                  🏏
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider mb-0.5">
                    {item.tournament}
                  </p>
                  <h4 className="text-[15px] font-bold text-gray-800">{item.match}</h4>
                </div>
              </div>
              <div className="mt-3 lg:mt-0 flex items-center justify-between lg:justify-end gap-6 border-t lg:border-none pt-3 lg:pt-0">
                <div className="flex flex-col items-start lg:items-end">
                  {item.time === "LIVE" ? (
                    <span className="badge-live">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      LIVE
                    </span>
                  ) : (
                    <span className="text-[13px] font-bold text-gray-600">{item.time}</span>
                  )}
                  <p className="text-[10px] text-gray-400 font-medium">Match Start Time</p>
                </div>
                <div className="btn-gradient px-4 py-2 rounded-lg text-white text-[11px] font-black tracking-wide cursor-pointer">
                  {item.time === "LIVE" ? "WATCH NOW" : "SET REMINDER"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
