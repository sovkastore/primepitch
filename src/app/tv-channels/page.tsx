"use client";

import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdsLoader from "@/components/AdsLoader";
import Logo from "@/components/Logo";

interface Channel {
  id: string;
  name: string;
  category: string;
  logo_url: string;
  channel_id: number | null;
  embed_url: string;
}

interface Config {
  page_title: string;
  meta_description: string;
  banner_json: { enabled?: boolean; text?: string; link?: string; style?: string };
  notification_json: { enabled?: boolean; message?: string; type?: string };
}

export default function TVChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isNotificationDismissed, setIsNotificationDismissed] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const [cRes, cfgRes] = await Promise.all([
          fetch("/api/tv-channels"),
          fetch("/api/tv-channels/config")
        ]);
        const cData = await cRes.json();
        const cfgData = await cfgRes.json();
        setChannels(cData.channels || []);
        setConfig(cfgData);
      } catch (err) {
        console.error("Failed to load TV channels", err);
      }
      setLoading(false);
    }
    init();
  }, []);

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const s = search.toLowerCase();
    return channels.filter(c => 
      c.name.toLowerCase().includes(s) || 
      c.category.toLowerCase().includes(s)
    );
  }, [channels, search]);

  const categories = useMemo(() => {
    const set = new Set(channels.map(c => c.category));
    return Array.from(set).sort();
  }, [channels]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <div className="w-12 h-12 border-4 border-gray-100 border-t-emerald-500 rounded-full animate-spin" />
           <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Warming up streams...</p>
        </div>
      </div>
    );
  }

  const showNotification = config?.notification_json?.enabled && config?.notification_json?.message && !isNotificationDismissed;

  return (
    <>
      <Navbar />
      
      {showNotification && (
        <div className="bg-emerald-600 text-white py-3 px-4 relative overflow-hidden">
           <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
             <div className="flex items-center gap-3">
               <span className="shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">🔔</span>
               <p className="text-[13px] font-bold leading-tight">{config.notification_json.message}</p>
             </div>
             <button onClick={() => setIsNotificationDismissed(true)} className="shrink-0 hover:bg-white/10 p-1.5 rounded-full transition-colors">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
           </div>
        </div>
      )}

      <main className="min-h-screen bg-gray-50/50 pb-20">
        {/* Banner Section */}
        {config?.banner_json?.enabled && config.banner_json.text && (
          <div className="bg-gray-900 text-white py-12 px-4 text-center relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-50" />
             <div className="relative z-10 max-w-4xl mx-auto space-y-4">
                <h2 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter leading-none">
                  {config.banner_json.text}
                </h2>
                {config.banner_json.link && (
                  <Link href={config.banner_json.link} className="inline-block px-8 py-3 bg-emerald-500 text-white rounded-full text-sm font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl shadow-emerald-500/20">
                    Get Access Now
                  </Link>
                )}
             </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-1">
              <h1 className="text-3xl md:text-5xl font-black text-gray-900 uppercase tracking-tighter italic leading-none">
                 {config?.page_title || "Live TV Channels"}
              </h1>
              <p className="text-gray-400 text-sm font-medium">{config?.meta_description}</p>
            </div>

            <div className="relative w-full md:w-80">
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Sky Sports, TNT..." 
                className="w-full px-6 py-4 bg-white border border-gray-100 rounded-3xl text-sm font-bold shadow-sm focus:ring-4 focus:ring-emerald-500/5 transition-all outline-none"
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>
          </div>

          <AdsLoader />

          {filteredChannels.length === 0 ? (
            <div className="py-20 text-center animate-in fade-in duration-500">
               <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-4xl grayscale opacity-50">📺</div>
               <h3 className="text-xl font-black text-gray-900 uppercase">Channel not found</h3>
               <p className="text-gray-400 text-sm font-bold mt-1">We couldn't find "{search}". Try searching for something else!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredChannels.map(ch => (
                <Link 
                  key={ch.id} 
                  href={ch.embed_url || `/watch/tv-${ch.id}`}
                  className="bg-white border border-gray-100 p-5 rounded-3xl group hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all relative overflow-hidden"
                >
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                  <div className="aspect-square bg-gray-50 rounded-2xl flex items-center justify-center mb-4 overflow-hidden border border-gray-50 group-hover:bg-white transition-colors">
                     {ch.logo_url ? <img src={ch.logo_url} className="w-2/3 h-2/3 object-contain" alt="" /> : <span className="text-4xl">📺</span>}
                  </div>
                  <div className="space-y-1">
                     <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{ch.category}</span>
                     <h3 className="font-black text-gray-900 text-sm leading-tight uppercase group-hover:text-emerald-600 transition-colors">{ch.name}</h3>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <AdsLoader />
        </div>
      </main>

      <Footer />
    </>
  );
}
