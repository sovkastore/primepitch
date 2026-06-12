"use client";

import Link from "next/link";
import { useState } from "react";
import { SPORT_LABELS } from "@/lib/api";
import Logo from "@/components/Logo";

const ALL_SPORTS = [
  "football", "basketball", "american-football", "ufc", "wwe", "boxing",
  "motor-sports", "tennis", "cricket", "hockey", "baseball", "rugby",
  "golf", "darts", "billiards", "afl", "other",
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between">
          {/* Left: Hamburger (mobile) */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-gray-500 hover:text-gray-900 w-8 h-8 flex items-center justify-center relative z-[1000]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>

          {/* Center: Logo */}
          <Link href="/" className="flex items-center">
            <Logo size="md" />
          </Link>

          {/* Right spacer */}
          <div className="w-8" />
        </div>
      </nav>

      {/* Mobile fullscreen menu — outside nav to avoid stacking context */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 bg-white z-[999] px-4 py-3 space-y-0.5 overflow-y-auto">
          <Link
            href="/world-cup"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors mb-1"
          >
            🏆 FIFA World Cup 2026
          </Link>
          {ALL_SPORTS.map((id) => (
            <Link
              key={id}
              href={`/${id}`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              {SPORT_LABELS[id] || id}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
