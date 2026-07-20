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
  reshowHours: number; // 0 = stay dismissed until the message changes
};

const DISMISS_KEY = "pp_announce_dismissed_v2"; // stores { sig, ts }
const TRACK_DISMISS_URL = "/api/track-dismiss";

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

// Stable id for the current message. A dismissal is tied to this, so changing
// the wording/link/colour in the admin counts as a NEW message and shows again.
// (reshowHours is deliberately NOT part of the signature — changing the timer
// must not wipe existing dismissals.)
function signatureOf(a: Announcement): string {
  let h = 0;
  const s = `${a.message}|${a.linkUrl}|${a.linkLabel}|${a.variant}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

// A stable, anonymous per-device id so "unique dismissals" counts devices, not
// taps. No personal data; just a random uuid kept in localStorage.
function getDeviceId(): string {
  try {
    let id = localStorage.getItem("pp_device_id");
    if (!id) {
      id =
        (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("pp_device_id", id);
    }
    return id;
  } catch {
    return "";
  }
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
          const sig = signatureOf(cfg);
          const raw = localStorage.getItem(DISMISS_KEY);
          let hide = false;
          if (raw) {
            const rec = JSON.parse(raw) as { sig?: string; ts?: number };
            if (rec?.sig === sig) {
              const hrs = Number(cfg.reshowHours) || 0;
              if (hrs <= 0) {
                hide = true; // hidden until the message itself changes
              } else {
                const elapsed = Date.now() - (rec.ts ?? 0);
                hide = elapsed < hrs * 3600_000; // still inside the cooldown
              }
            }
          }
          setDismissed(hide);
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
    const sig = signatureOf(a);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ sig, ts: Date.now() }));
    } catch {
      /* ignore */
    }
    // Record the dismissal straight to Supabase (device -> Supabase, no
    // Cloudflare hit). Simple request (text/plain) so there's no CORS preflight.
    try {
      const id = getDeviceId();
      if (id) {
        fetch(TRACK_DISMISS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ device_id: id, signature: sig }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* tracking is best-effort */
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
