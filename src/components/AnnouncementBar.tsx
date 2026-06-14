"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
};

const STYLES: Record<Variant, { bar: string; chip: string; cta: string; close: string }> = {
  info: {
    bar: "bg-slate-900 text-white",
    chip: "bg-white/10 text-white",
    cta: "bg-white text-slate-900 hover:bg-white/90",
    close: "hover:bg-white/10 text-white/70 hover:text-white",
  },
  success: {
    bar: "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white",
    chip: "bg-white/15 text-white",
    cta: "bg-white text-emerald-700 hover:bg-white/90",
    close: "hover:bg-white/15 text-white/80 hover:text-white",
  },
  warning: {
    bar: "bg-amber-400 text-slate-900",
    chip: "bg-black/10 text-slate-900",
    cta: "bg-slate-900 text-white hover:bg-slate-800",
    close: "hover:bg-black/10 text-slate-900/70 hover:text-slate-900",
  },
};

// Stable id for the current message so a dismissal sticks until the admin
// changes it ("say it once").
function signatureOf(a: Announcement): string {
  let h = 0;
  const s = `${a.message}|${a.linkUrl}|${a.linkLabel}|${a.variant}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export default function AnnouncementBar() {
  const [a, setA] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/announcement", { cache: "no-store" })
      .then((r) => r.json())
      .then((cfg: Announcement) => {
        if (!alive || !cfg?.enabled || !cfg.message) return;
        setA(cfg);
        try {
          setDismissed(localStorage.getItem("pp_announce_dismissed") === signatureOf(cfg));
        } catch {
          setDismissed(false);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!a || dismissed) return null;

  const s = STYLES[a.variant] ?? STYLES.info;

  const close = () => {
    try {
      localStorage.setItem("pp_announce_dismissed", signatureOf(a));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const isExternal = /^https?:\/\//i.test(a.linkUrl);
  const hasCta = Boolean(a.linkUrl && a.linkLabel);
  const ctaClass = `shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold transition-colors ${s.cta}`;
  const arrow = (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className={`w-full ${s.bar}`} role="status">
      <div className="max-w-5xl mx-auto pl-3 pr-2 sm:px-4 py-2 flex items-center gap-2.5">
        <span className={`shrink-0 grid place-items-center w-7 h-7 rounded-full ${s.chip}`}>
          {/* megaphone */}
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M3 11v2a1 1 0 0 0 1 1h1.4l.9 4.5a1 1 0 0 0 1 .8H9a1 1 0 0 0 1-1.2L9.3 14H11l7 4V6l-7 4H4a1 1 0 0 0-1 1Zm17-3v8a3 3 0 0 0 0-8Z" />
          </svg>
        </span>

        <p className="flex-1 min-w-0 text-[13px] font-medium leading-snug">{a.message}</p>

        {hasCta &&
          (isExternal ? (
            <a href={a.linkUrl} target="_blank" rel="noopener noreferrer" className={ctaClass}>
              {a.linkLabel}
              {arrow}
            </a>
          ) : (
            <Link href={a.linkUrl} className={ctaClass}>
              {a.linkLabel}
              {arrow}
            </Link>
          ))}

        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className={`shrink-0 w-7 h-7 grid place-items-center rounded-full transition-colors ${s.close}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
