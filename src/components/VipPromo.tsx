"use client";

import { useEffect, useRef, useState } from "react";

// "Watch streams without ads" -> /vip. Shown only once VIP has launched, and
// only to people who are NOT already ad-free (paid VIP, admin, partner).
//
// Tapping it must not fire a popunder: ad scripts listen for clicks at the
// document level, so we catch the tap first (capture phase, on our own
// element), stop it from reaching them, and do the navigation ourselves.
export default function VipPromo({ compact = false }: { compact?: boolean }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fetch("/api/vip/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const adFree = d?.me?.vip === true || (!!d?.staff && d?.staffAds !== true);
        setShow(d?.live === true && !adFree);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !show) return;
    const swallow = (e: Event) => { e.stopPropagation(); };
    const go = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = "/vip";
    };
    const opts = { capture: true } as const;
    for (const t of ["pointerdown", "mousedown", "mouseup", "touchstart", "touchend"]) el.addEventListener(t, swallow, opts);
    el.addEventListener("click", go, opts);
    return () => {
      for (const t of ["pointerdown", "mousedown", "mouseup", "touchstart", "touchend"]) el.removeEventListener(t, swallow, opts);
      el.removeEventListener("click", go, opts);
    };
  }, [show]);

  if (!show) return null;

  return (
    <a
      ref={ref}
      href="/vip"
      className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 text-gray-900 font-black tracking-tight shadow-[0_2px_10px_rgba(245,158,11,0.35)] ring-1 ring-amber-500/30 hover:brightness-105 active:scale-[0.98] transition ${compact ? "px-3 h-8 text-[11px]" : "px-4 h-9 text-[12px]"}`}
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>
      Watch streams without ads
      <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
    </a>
  );
}
