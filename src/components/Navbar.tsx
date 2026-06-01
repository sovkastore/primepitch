"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_SPORTS = [
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
  { id: "fight", label: "UFC" },
  { id: "motor-sports", label: "F1" },
  { id: "tennis", label: "Tennis" },
  { id: "cricket", label: "Cricket" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1 shrink-0">
          <span className="text-xl font-extrabold tracking-tight text-white">
            PULSE
          </span>
          <span className="text-xl font-extrabold tracking-tight text-emerald-400">
            SPORTS
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 ml-8">
          {NAV_SPORTS.map((s) => (
            <Link
              key={s.id}
              href={`/${s.id}`}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              {s.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              More ▾
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg py-1 min-w-[140px] shadow-xl">
                {[
                  { id: "american-football", label: "NFL" },
                  { id: "hockey", label: "Hockey" },
                  { id: "baseball", label: "Baseball" },
                  { id: "rugby", label: "Rugby" },
                  { id: "golf", label: "Golf" },
                  { id: "darts", label: "Darts" },
                ].map((s) => (
                  <Link
                    key={s.id}
                    href={`/${s.id}`}
                    onClick={() => setMoreOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10"
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link
            href="/?filter=live"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 text-sm font-medium rounded-full"
          >
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-white p-1"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-zinc-950 border-t border-white/10 px-4 py-3 space-y-1">
          {[...NAV_SPORTS, { id: "american-football", label: "NFL" }, { id: "hockey", label: "Hockey" }, { id: "baseball", label: "Baseball" }].map((s) => (
            <Link
              key={s.id}
              href={`/${s.id}`}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg"
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
