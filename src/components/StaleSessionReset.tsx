"use client";

import { useEffect } from "react";

// When the user comes back after being away (tab hidden, or browser closed and
// reopened) for longer than this, snap them to the default Football home — same
// as a first-time visit. Quick reloads and brief tab switches keep their place.
const AWAY_LIMIT_MS = 60_000;
const KEY = "pp_active_at";
const TICK_MS = 15_000;

export default function StaleSessionReset() {
  useEffect(() => {
    const read = () => {
      try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
    };
    const touch = () => {
      try { localStorage.setItem(KEY, String(Date.now())); } catch {}
    };
    const isStale = () => {
      const t = read();
      return t > 0 && Date.now() - t > AWAY_LIMIT_MS;
    };
    const resetToFootball = () => {
      let hadSport = false;
      try {
        hadSport = !!sessionStorage.getItem("pp_sport");
        sessionStorage.removeItem("pp_sport");
      } catch {}
      touch(); // mark fresh so the reloaded page isn't treated as stale again
      const onHome = window.location.pathname === "/";
      const onCricket = window.location.pathname.startsWith("/cricket");
      const onSportsLive = window.location.pathname.startsWith("/sports-live");
      const onPPV = window.location.pathname.startsWith("/ppv");
      const onTV = window.location.pathname.startsWith("/tv-channels") || window.location.pathname.startsWith("/watch/tv-");
      
      // Do not redirect to home if they are on a standalone manual stream page
      if ((!onHome && !onCricket && !onSportsLive && !onPPV && !onTV) || hadSport) {
        window.location.replace("/");
      }
    };

    // Returned to a stale tab, or reopened the browser after >1 min away.
    if (isStale()) { resetToFootball(); return; }
    touch();

    const interval = setInterval(() => { if (!document.hidden) touch(); }, TICK_MS);
    const onVisibility = () => {
      if (document.hidden) touch();           // record the moment they leave
      else if (isStale()) resetToFootball();  // came back too late → reset
      else touch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", touch);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", touch);
    };
  }, []);

  return null;
}
