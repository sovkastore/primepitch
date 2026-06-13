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

// Icons/brand colors per channel. The actual links + on/off state are managed
// from Admin → Settings and fetched at runtime, so the owner controls them.
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
  const [socials, setSocials] = useState<PublicSocial[]>([]);
  const [socialsLoaded, setSocialsLoaded] = useState(false);

  // Fetch the admin-managed connect links the first time the menu opens —
  // no request on page load, only when someone actually opens the menu.
  useEffect(() => {
    if (!mobileOpen || socialsLoaded) return;
    fetch("/api/social-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSocials(Array.isArray(d.links) ? d.links : []))
      .catch(() => {})
      .finally(() => setSocialsLoaded(true));
  }, [mobileOpen, socialsLoaded]);

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

          {/* Connect with us — admin-managed, tap-to-open links */}
          {socials.length > 0 && (
            <div className="pt-3 mt-2 border-t border-gray-100">
              <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                Connect with us
              </p>
              {socials.map((s) => {
                const meta = SOCIAL_ICONS[s.id];
                return (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {meta && <span style={{ color: meta.color }} className="shrink-0">{meta.icon}</span>}
                    {s.label}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
