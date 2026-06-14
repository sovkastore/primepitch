"use client";

import { useEffect, useRef, useState } from "react";

// Plays a VAST pre-roll ad over the player, then reveals the stream. The reveal
// is guaranteed: it fires on ad-complete, skip, no-fill, error, script failure,
// or a hard timeout — so a missing/broken ad can NEVER block the match.

type Trigger = "visit" | "interval" | "match" | "server";
type Placement = "watch" | "home" | "both";
type Page = "watch" | "home";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  placement: Placement;
  cap: number; // minutes between plays, for "interval"
  skipAfter: number; // seconds (best-effort; the creative's own skipoffset wins)
  noFillTimeout: number; // seconds to wait for an ad before giving up
};
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  preroll?: Preroll;
};

declare global {
  interface Window {
    fluidPlayer?: (
      el: HTMLVideoElement | string,
      opts: Record<string, unknown>
    ) => { on: (e: string, cb: () => void) => void; destroy?: () => void };
  }
}

const FLUID_JS = "https://cdn.fluidplayer.com/v3/current/fluidplayer.min.js";
const BLANK_MP4 = "/preroll-blank.mp4"; // 1s black clip the player attaches to

function domainAllowed(setting: AdsConfig["domains"], host: string): boolean {
  if (setting === "all") return true;
  if (setting === "workers_dev") return host.endsWith(".workers.dev");
  if (setting === "xellnetwork") return host.endsWith("xellnetwork.xyz");
  return false;
}

// Decide whether the ad is due right now, based on the admin-chosen trigger.
function isDue(p: Preroll, page: Page): boolean {
  try {
    let trigger = p.trigger;
    // "match"/"server" only make sense on the watch page; on home, fall back to once-per-visit.
    if (page === "home" && (trigger === "match" || trigger === "server")) trigger = "visit";
    if (trigger === "match" || trigger === "server") return true;
    if (trigger === "visit") {
      if (sessionStorage.getItem("preroll_seen")) return false;
      sessionStorage.setItem("preroll_seen", "1");
      return true;
    }
    // interval
    const mins = p.cap > 0 ? p.cap : 0;
    if (mins <= 0) return true;
    const last = Number(localStorage.getItem("preroll_t") || 0);
    if (Date.now() - last < mins * 60000) return false;
    localStorage.setItem("preroll_t", String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function placementAllows(placement: Placement, page: Page): boolean {
  if (placement === "both") return true;
  return placement === page;
}

function loadFluid(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.fluidPlayer) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>("script[data-fluid]");
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.fluidPlayer));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = FLUID_JS;
    s.async = true;
    s.dataset.fluid = "1";
    s.onload = () => resolve(!!window.fluidPlayer);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export default function PreRollGate({
  page = "watch",
  streamKey = "",
}: {
  page?: Page;
  streamKey?: string;
}) {
  const [cfg, setCfg] = useState<Preroll | null>(null);
  const [show, setShow] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  // Decide whether to show the ad for this stream.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ads-config", { cache: "no-store" });
        if (!res.ok) return;
        const c = (await res.json()) as AdsConfig;
        const p = c.preroll;
        if (!c.master || !p?.enabled || !p.vastTag) return;
        if (typeof window === "undefined") return;
        if (window.location.pathname.startsWith("/admin")) return;
        if (!domainAllowed(c.domains, window.location.hostname)) return;
        if (!placementAllows(p.placement ?? "watch", page)) return;
        if (!isDue(p, page)) return;
        if (cancelled) return;
        setCfg(p);
        setShow(true);
      } catch {
        /* no config -> no ad */
      }
    })();
    return () => {
      cancelled = true;
    };
    // streamKey in deps so "server"/"match" modes re-evaluate on stream change
  }, [streamKey]);

  // Run the ad once we've decided to show it.
  useEffect(() => {
    if (!show || !cfg) return;
    doneRef.current = false;
    let player: { on: (e: string, cb: () => void) => void; destroy?: () => void } | null = null;
    let cancelled = false;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setShow(false);
    };

    // Hard safety nets — the stream is revealed no matter what.
    // 1) absolute cap so nothing can hang the player forever.
    const hardCap = setTimeout(finish, 90_000);

    (async () => {
      const ok = await loadFluid();
      if (cancelled) return;
      if (!ok || !window.fluidPlayer || !videoRef.current) return finish();

      const vid = videoRef.current;
      // The blank content plays right after the ad (or immediately on no-fill),
      // so its "ended" is our universal "ad is over, reveal the stream" signal.
      vid.addEventListener("ended", finish);

      try {
        player = window.fluidPlayer(vid, {
          layoutControls: {
            autoPlay: true,
            mute: true,
            keyboardControl: false,
            controlBar: { autoHide: true },
            playButtonShowing: false,
          },
          vastOptions: {
            adList: [{ roll: "preRoll", vastTag: cfg.vastTag }],
            skipButtonCaption: `Skip in [seconds]`,
            skipButtonClickCaption: "Skip Ad ▶",
            vastTimeout: Math.max(2, cfg.noFillTimeout) * 1000,
            allowVPAID: true,
            vastAdvanced: {
              noVastVideoCallback: finish, // no ad filled
              vastVideoEndedCallback: finish, // ad finished
            },
          },
        });
        player.on("ended", finish);
      } catch {
        finish();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(hardCap);
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [show, cfg]);

  if (!show) return null;
  const wrap =
    page === "home"
      ? "fixed inset-0 z-[60] bg-black flex items-center justify-center"
      : "absolute inset-0 z-30 bg-black flex items-center justify-center";
  return (
    <div className={wrap}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted
        preload="auto"
      >
        <source src={BLANK_MP4} type="video/mp4" />
      </video>
    </div>
  );
}
