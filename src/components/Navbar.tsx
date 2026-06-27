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
             <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">🔔</span>
             <div className="text-[14px]">Subscribe <span className="block text-[10px] opacity-80 font-medium">Live match alerts</span></div>
          </Link>

          <Link href="/world-cup" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-50 bg-emerald-50/50">
             <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl">🏆</span>
             <div className="text-[14px] text-gray-900">FIFA World Cup 2026</div>
          </Link>

          <Link href="/help" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-50 bg-white">
             <span className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl">❓</span>
             <div className="text-[14px] text-gray-900">Can&apos;t Watch?</div>
          </Link>

          <div className="h-px bg-gray-50 my-1" />

          {/* All Sports Dropdown */}
          <button onClick={() => setSportsOpen(!sportsOpen)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50/50">
             <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">🎯</span>
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
             <span className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-xl">🏏</span>
             <div className="flex-1">
                <span className="block text-[15px] font-black text-emerald-400">Live Cricket Matches</span>
                <span className="block text-[10px] text-white/50 lowercase">Manual schedule & premium streams</span>
             </div>
             <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth={3} /></svg>
          </Link>

          {socials.length > 0 && (
            <div className="pt-4 space-y-1">
              {socials.map(s => (
                <a key={s.id} href={s.url} target="_blank" className="flex items-center gap-3 p-3 text-gray-500 text-[14px] hover:text-emerald-600">
                   <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">📢</span>
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
