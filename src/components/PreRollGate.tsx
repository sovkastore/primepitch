"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Pre-roll VAST gate powered by Google's IMA SDK (replaces Fluid Player).
//
// The overlay stays HIDDEN while the ad is requested in the background. It only
// becomes visible if a REAL ad actually starts (IMA "STARTED" event). No-fill
// (VAST 1009), error, SDK failure, or timeout -> nothing renders, no black
// flash, and the stream/homepage loads normally. All admin controls (placement,
// trigger, interval-minutes via `cap`, skip-after, no-fill wait, master, domain)
// behave exactly as before.

type Trigger = "visit" | "interval" | "match" | "server";
type Placement = "watch" | "home" | "both";
type Page = "watch" | "home";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  placement: Placement;
  cap: number; // minutes between plays, for "interval"
  skipAfter: number; // seconds until the Skip button appears
  noFillTimeout: number; // seconds to wait for an ad before giving up
};
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  preroll?: Preroll;
};

// --- Minimal typings for the bits of the IMA SDK we use (keeps strict mode happy) ---
type ImaEvent = { type: string };
interface ImaAdDisplayContainer {
  initialize(): void;
}
interface ImaAdsRenderingSettings {
  restoreCustomPlaybackStateOnAdBreakComplete: boolean;
}
interface ImaAdsManager {
  addEventListener(type: string, cb: (e: ImaEvent) => void): void;
  init(width: number, height: number, viewMode: string): void;
  start(): void;
  setVolume(volume: number): void;
  resize(width: number, height: number, viewMode: string): void;
  skip(): void;
  destroy(): void;
}
interface ImaAdsManagerLoadedEvent {
  getAdsManager(
    content: HTMLVideoElement,
    settings: ImaAdsRenderingSettings
  ): ImaAdsManager;
}
interface ImaAdsRequest {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
  nonLinearAdSlotWidth: number;
  nonLinearAdSlotHeight: number;
  setAdWillAutoPlay(b: boolean): void;
  setAdWillPlayMuted(b: boolean): void;
}
interface ImaAdsLoader {
  addEventListener(
    type: string,
    cb: (e: ImaAdsManagerLoadedEvent) => void,
    capture?: boolean
  ): void;
  requestAds(req: ImaAdsRequest): void;
  destroy(): void;
}
interface ImaNamespace {
  AdDisplayContainer: new (
    el: HTMLElement,
    video: HTMLVideoElement
  ) => ImaAdDisplayContainer;
  AdsLoader: new (c: ImaAdDisplayContainer) => ImaAdsLoader;
  AdsRequest: new () => ImaAdsRequest;
  AdsRenderingSettings: new () => ImaAdsRenderingSettings;
  ViewMode: { NORMAL: string };
  AdEvent: {
    Type: {
      STARTED: string;
      COMPLETE: string;
      ALL_ADS_COMPLETED: string;
      SKIPPED: string;
    };
  };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
}

declare global {
  interface Window {
    google?: { ima?: ImaNamespace };
  }
}

const IMA_SDK = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

function domainAllowed(setting: AdsConfig["domains"], host: string): boolean {
  if (setting === "all") return true;
  if (setting === "workers_dev") return host.endsWith(".workers.dev");
  if (setting === "xellnetwork") return host.endsWith("xellnetwork.xyz");
  return false;
}

// Decide whether the ad is due right now, based on the admin-chosen trigger.
// (Identical logic to the previous gate so admin controls are unchanged.)
function isDue(p: Preroll, page: Page): boolean {
  try {
    let trigger = p.trigger;
    if (page === "home" && (trigger === "match" || trigger === "server"))
      trigger = "visit";
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

let imaLoader: Promise<boolean> | null = null;
function loadIma(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.ima) return Promise.resolve(true);
  if (imaLoader) return imaLoader;
  imaLoader = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-ima]"
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.google?.ima));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = IMA_SDK;
    s.async = true;
    s.dataset.ima = "1";
    s.onload = () => resolve(!!window.google?.ima);
    s.onerror = () => {
      imaLoader = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return imaLoader;
}

export default function PreRollGate({
  page = "watch",
  streamKey = "",
}: {
  page?: Page;
  streamKey?: string;
}) {
  // cfg is set only once we've decided an ad is due and should be attempted.
  const [cfg, setCfg] = useState<Preroll | null>(null);
  // adShowing flips true ONLY when a real ad has started playing.
  const [adShowing, setAdShowing] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLVideoElement>(null);

  const adsManagerRef = useRef<ImaAdsManager | null>(null);
  const adsLoaderRef = useRef<ImaAdsLoader | null>(null);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    try {
      adsManagerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    try {
      adsLoaderRef.current?.destroy();
    } catch {
      /* ignore */
    }
    adsManagerRef.current = null;
    adsLoaderRef.current = null;
    setShowSkip(false);
    setAdShowing(false);
    setCfg(null); // unmount the gate entirely
  }, []);

  const skip = useCallback(() => {
    try {
      adsManagerRef.current?.skip();
    } catch {
      /* ignore */
    }
    finish();
  }, [finish]);

  // Phase 1 — decide whether the ad is due (same gates as before).
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
      } catch {
        /* no config -> no ad */
      }
    })();
    return () => {
      cancelled = true;
    };
    // streamKey in deps so "server"/"match" modes re-evaluate on stream change
  }, [streamKey, page]);

  // Phase 2 — request + run the ad in the background; reveal only on real start.
  useEffect(() => {
    if (!cfg) return;
    doneRef.current = false;
    startedRef.current = false;
    let cancelled = false;

    (async () => {
      const ok = await loadIma();
      if (cancelled || doneRef.current) return;
      const ima = window.google?.ima;
      const root = rootRef.current;
      const adContainer = adContainerRef.current;
      const content = contentRef.current;
      if (!ok || !ima || !root || !adContainer || !content) {
        finish();
        return;
      }

      const dims = () => ({
        w: root.clientWidth || window.innerWidth,
        h: root.clientHeight || window.innerHeight,
      });

      const display = new ima.AdDisplayContainer(adContainer, content);
      display.initialize();

      const loader = new ima.AdsLoader(display);
      adsLoaderRef.current = loader;

      // Any load-time error (incl. no-fill 1009) -> reveal nothing.
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(), false);

      loader.addEventListener(
        ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (e: ImaAdsManagerLoadedEvent) => {
          if (cancelled || doneRef.current) {
            finish();
            return;
          }
          const rs = new ima.AdsRenderingSettings();
          rs.restoreCustomPlaybackStateOnAdBreakComplete = false;
          const mgr = e.getAdsManager(content, rs);
          adsManagerRef.current = mgr;

          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish());
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (doneRef.current) return;
            startedRef.current = true; // a REAL ad is playing
            setAdShowing(true); // -> reveal the overlay
            const skipAfter = Math.max(0, Number(cfg.skipAfter ?? 5));
            timersRef.current.push(
              setTimeout(() => setShowSkip(true), skipAfter * 1000)
            );
          });
          mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish());
          mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish());
          mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish());

          try {
            const { w, h } = dims();
            mgr.init(w, h, ima.ViewMode.NORMAL);
            mgr.setVolume(0); // muted start -> reliable autoplay (parity w/ old gate)
            mgr.start();
          } catch {
            finish();
          }
        },
        false
      );

      const req = new ima.AdsRequest();
      req.adTagUrl = cfg.vastTag;
      const { w, h } = dims();
      req.linearAdSlotWidth = w;
      req.linearAdSlotHeight = h;
      req.nonLinearAdSlotWidth = w;
      req.nonLinearAdSlotHeight = Math.floor(h / 3);
      try {
        req.setAdWillAutoPlay(true);
        req.setAdWillPlayMuted(true);
      } catch {
        /* older SDK -> ignore */
      }

      // No-fill backstop: if no real ad has started in time, give up cleanly.
      const waitMs = Math.max(2, Number(cfg.noFillTimeout ?? 3)) * 1000;
      timersRef.current.push(
        setTimeout(() => {
          if (!startedRef.current) finish();
        }, waitMs)
      );
      // Absolute safety net so a stuck ad can never hang the page.
      timersRef.current.push(setTimeout(() => finish(), 90_000));

      try {
        loader.requestAds(req);
      } catch {
        finish();
      }
    })();

    return () => {
      cancelled = true;
      finish();
    };
  }, [cfg, finish]);

  // Keep a running ad sized to its container.
  useEffect(() => {
    if (!adShowing) return;
    const onResize = () => {
      const root = rootRef.current;
      const mgr = adsManagerRef.current;
      const ima = window.google?.ima;
      if (!root || !mgr || !ima) return;
      try {
        mgr.resize(
          root.clientWidth || window.innerWidth,
          root.clientHeight || window.innerHeight,
          ima.ViewMode.NORMAL
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [adShowing]);

  // Nothing to render unless we're attempting or actually showing an ad.
  if (!cfg && !adShowing) return null;

  const isHome = page === "home";
  const wrap = isHome ? "fixed inset-0 z-[60]" : "absolute inset-0 z-30";

  // While merely attempting, the layer is transparent + non-interactive so the
  // page behind shows through (no black flash). It turns opaque black only when
  // a real ad is on screen.
  return (
    <div
      ref={rootRef}
      className={`${wrap} flex items-center justify-center`}
      style={{
        background: adShowing ? "#000" : "transparent",
        opacity: adShowing ? 1 : 0,
        pointerEvents: adShowing ? "auto" : "none",
      }}
      aria-hidden={!adShowing}
    >
      <div ref={adContainerRef} className="absolute inset-0" />
      <video
        ref={contentRef}
        className="absolute inset-0 h-full w-full opacity-0"
        muted
        playsInline
        preload="auto"
      />
      {adShowing && showSkip && (
        <button
          onClick={skip}
          className="absolute bottom-4 right-4 z-10 rounded-md bg-black/70 px-4 py-2 text-sm text-white hover:bg-black/80"
        >
          Skip Ad ▶
        </button>
      )}
    </div>
  );
}
