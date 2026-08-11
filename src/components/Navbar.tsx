"use client";

import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import { SPORT_LABELS } from "@/lib/api";
import Logo from "@/components/Logo";

const ALL_SPORTS = [
  "football", "basketball", "american-football", "ufc", "wwe", "boxing",
  "motor-sports", "tennis", "cricket", "hockey", "baseball", "rugby",
  "golf", "darts", "billiards", "afl", "other",
];

const SOCIAL_ICONS: Record<string, { color: string; icon: ReactNode }> = {
  telegram: {
    color: "#229ED9",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
    ),
  },
};

type PublicSocial = { id: string; label: string; url: string };

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sportsOpen, setSportsOpen] = useState(false);
  const [socials, setSocials] = useState<PublicSocial[]>([]);
  const [socialsLoaded, setSocialsLoaded] = useState(false);
  const [affiliate, setAffiliate] = useState(false);

  useEffect(() => {
    if (!mobileOpen || socialsLoaded) return;
    fetch("/api/social-links", { cache: "no-store" }).then(r => r.json()).then(d => setSocials(Array.isArray(d.links) ? d.links : [])).finally(() => setSocialsLoaded(true));
    fetch("/api/partner-program/status", { cache: "no-store" }).then(r => r.json()).then(d => setAffiliate(d?.open === true));
  }, [mobileOpen, socialsLoaded]);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 uppercase h-14 flex items-center px-4">
        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-500 w-8 h-8 flex items-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
        <div className="flex-1 flex justify-center"><Link href="/"><Logo size="md" /></Link></div>
        <div className="w-8" />
      </nav>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 bg-white z-[999] overflow-y-auto px-4 py-4 space-y-1.5 uppercase font-bold tracking-tight">
          <Link href="/subscribe" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500 text-white shadow-lg">
             <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M12 22a2.98 2.98 0 0 0 2.818-2H9.182A2.98 2.98 0 0 0 12 22zm7-7.414V11c0-3.079-1.638-5.774-4.5-6.458V3.5a1.5 1.5 0 0 0-3 0v1.042C8.638 5.226 7 7.921 7 11v3.586l-1.707 1.707A.996.996 0 0 0 5 17v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a.996.996 0 0 0-.293-.707L17 14.586z" />
               </svg>
             </span>
             <div className="text-[14px]">Subscribe <span className="block text-[10px] opacity-80 font-medium">Live match alerts</span></div>
          </Link>

          <Link href="/world-cup" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-50 bg-emerald-50/50">
             <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 text-emerald-500 shadow-sm">
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M12 2a1 1 0 0 0-1 1v2.53a5.002 5.002 0 0 0-4 4.92V11c0 1.307-.813 2.547-1.895 3.197a1 1 0 0 0-.105 1.743A3.01 3.01 0 0 0 7 19h10a3.01 3.01 0 0 0 2-3.06a1 1 0 0 0-.105-1.743C17.813 13.547 17 12.307 17 11V10.45a5.002 5.002 0 0 0-4-4.92V3a1 1 0 0 0-1-1zm3 8h-6V10.45a3.001 3.001 0 0 1 6 0V11z" />
               </svg>
             </span>
             <div className="text-[14px] text-gray-900">FIFA World Cup 2026</div>
          </Link>

          <Link href="/alt" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-red-50 bg-red-50/50">
             <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 text-red-500 shadow-sm">
               <span className="text-xl">🔥</span>
             </span>
             <div className="text-[14px] font-bold text-red-700">Big Games</div>
          </Link>

          <Link href="/help" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-50 bg-white">
             <span className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 text-gray-400">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
             </span>
             <div className="text-[14px] text-gray-900">Can&apos;t Watch?</div>
          </Link>

          <div className="h-px bg-gray-50 my-1" />

          {/* All Sports Dropdown */}
          <button onClick={() => setSportsOpen(!sportsOpen)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50/50">
             <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 text-gray-400 shadow-sm">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
               </svg>
             </span>
             <div className="flex-1 text-left text-[14px] text-gray-800">All Sports</div>
             <svg className={`w-4 h-4 transition-transform ${sportsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth={2} /></svg>
          </button>
          {sportsOpen && (
            <div className="grid grid-cols-2 gap-1 px-1">
              {ALL_SPORTS.map(id => (
                <Link key={id} href={`/${id}`} onClick={() => setMobileOpen(false)} className="p-2 text-[12px] text-gray-500 hover:text-emerald-500">{SPORT_LABELS[id] || id}</Link>
              ))}
            </div>
          )}

          {/* LIVE CRICKET Matches — PLACED BELOW ALL SPORTS */}
          <Link href="/cricket-live" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900 text-white shadow-xl">
             <span className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 text-white">
               <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 8L19 13M14 8L4 18C3.44772 18.5523 3 19.3431 3 20C3 20.6569 3.44772 21 4 21C4.65685 21 5.44772 20.5523 6 20L16 10M14 8L16 10M16 10L21 5M12 6C12 7.10457 11.1046 8 10 8C8.89543 8 8 7.10457 8 6C8 4.89543 8.89543 4 10 4C11.1046 4 12 4.89543 12 6Z" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
             </span>
             <div className="flex-1">
                <span className="block text-[15px] font-black text-emerald-400">Live Cricket Matches</span>
             </div>
             <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth={3} /></svg>
          </Link>

          {socials.length > 0 && (
            <div className="pt-4 space-y-1">
              {socials.map(s => (
                <a key={s.id} href={s.url} target="_blank" className="flex items-center gap-3 p-3 text-gray-500 text-[14px] hover:text-emerald-600 group">
                   <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-50 text-gray-400 group-hover:text-emerald-500 transition-colors">
                     {s.id.toLowerCase().includes("telegram") ? SOCIAL_ICONS.telegram.icon : (
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                     )}
                   </span>
                   {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
