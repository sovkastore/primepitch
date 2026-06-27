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
  x: {
    color: "#000000",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  whatsapp: {
    color: "#25D366",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.928-1.029z" />
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
    fetch("/api/social-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSocials(Array.isArray(d.links) ? d.links : []))
      .catch(() => {})
      .finally(() => setSocialsLoaded(true));
    fetch("/api/partner-program/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAffiliate(d?.open === true))
      .catch(() => {});
  }, [mobileOpen, socialsLoaded]);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200 uppercase">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-500 w-8 h-8 flex items-center justify-center relative z-[1000]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <Link href="/" className="flex items-center"><Logo size="md" /></Link>
          <div className="w-8" />
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 bg-white z-[999] overflow-y-auto uppercase tracking-tighter">
          <div className="max-w-md mx-auto px-4 py-4 space-y-2">
            <Link href="/subscribe" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500 text-white shadow-lg">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-white/20 grid place-items-center"><svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v.6a6 6 0 0 1 5 5.9v3.2l1.7 2.6a1 1 0 0 1-.84 1.55H5.14a1 1 0 0 1-.84-1.55L6 12.7V9.5a6 6 0 0 1 5-5.9V3a1 1 0 0 1 1-1Zm0 20a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 22Z" /></svg></span>
              <div className="flex-1">
                <span className="block font-black text-[15px]">Subscribe</span>
                <span className="block text-[11px] text-white/80">Live alerts to your phone</span>
              </div>
            </Link>

            <Link href="/world-cup" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-100 bg-emerald-50/60">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-white grid place-items-center text-emerald-600 shadow-sm"><svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M12 13v3" /></svg></span>
              <div className="flex-1">
                <span className="block font-black text-[15px]">FIFA World Cup 2026</span>
                <span className="block text-[11px] text-emerald-600">All 104 matches</span>
              </div>
            </Link>

            <Link href="/help" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-gray-50 grid place-items-center text-emerald-600"><svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /></svg></span>
              <div className="flex-1">
                <span className="block font-black text-[15px]">Can&apos;t watch?</span>
                <span className="block text-[12px] text-gray-500">Contact Streaming Support</span>
              </div>
            </Link>

            {/* THE MISSING LINK — FIXED */}
            <Link href="/cricket-live" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900 text-white shadow-xl shadow-emerald-900/10 scale-[1.02] border-2 border-emerald-500/30">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center text-xl">🏏</span>
              <div className="flex-1">
                <span className="block font-black text-[15px] text-emerald-400">Live Cricket Matches</span>
                <span className="block text-[11px] text-white/60 font-bold">Premium schedule & auto-streams</span>
              </div>
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
            </Link>

            {affiliate && (
              <Link href="/partner-program" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-100 bg-emerald-50/30">
                <span className="shrink-0 w-10 h-10 rounded-xl bg-white grid place-items-center text-emerald-600 shadow-sm"><svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></span>
                <div className="flex-1"><span className="block font-black text-[15px]">Partner Program</span></div>
              </Link>
            )}

            <div className="h-px bg-gray-100 my-2" />

            <button type="button" onClick={() => setSportsOpen((v) => !v)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-gray-100 grid place-items-center text-gray-500 text-xl font-bold">🎯</span>
              <span className="flex-1 text-left font-black text-[15px] text-gray-800 tracking-tight">All Sports Categories</span>
              <svg className={`shrink-0 w-4 h-4 text-gray-400 transition-transform ${sportsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {sportsOpen && (
              <div className="grid grid-cols-2 gap-1 pb-1">
                {ALL_SPORTS.map((id) => (
                  <Link key={id} href={`/${id}`} onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-xl text-[13px] font-black text-gray-600 hover:text-gray-900 hover:bg-emerald-50">
                    {SPORT_LABELS[id] || id}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
