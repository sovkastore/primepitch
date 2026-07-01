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
type Placement = "watch" | "home" | "both" | "sports-live";
type Page = "watch" | "home" | "sports-live";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  placement: Placement;
  cap: number; // minutes between plays, for "interval"
  skipAfter: number; // seconds until the Skip button appears
  noFillTimeout: number; // seconds to wait for an ad before giving up
  mode?: "silent" | "gate"; // "silent" = invisible until a real ad; "gate" = black screen while checking
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
    if ((page === "home" || page === "sports-live") && (trigger === "match" || trigger === "server"))
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
  if (placement === "both" && (page === "home" || page === "watch")) return true;
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

// Pull a human-readable reason out of an IMA error event (debug only).
function adErrText(e: unknown): string {
  try {
    const ev = e as { getError?: () => unknown };
    const err = ev.getError?.() as
      | {
          getErrorCode?: () => number;
          getVastErrorCode?: () => number;
          getMessage?: () => string;
        }
      | undefined;
    const code = err?.getErrorCode?.();
    const vast = err?.getVastErrorCode?.();
    const msg = err?.getMessage?.();
    return `code=${code ?? "?"} vast=${vast ?? "?"} ${msg ?? ""}`.trim();
  } catch {
    return "(error unreadable)";
  }
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

  // Debug mode: append ?addebug=1 to the URL to bypass timing/placement gates
  // and SEE the real reason an ad doesn't play, on screen.
  const debugOn =
    typeof window !== "undefined" &&
    window.location.search.includes("addebug=1");
  const debugRef = useRef(debugOn);
  debugRef.current = debugOn;
  const [log, setLog] = useState<string[]>([]);
  const note = useCallback((m: string) => {
    if (!debugRef.current) return;
    // eslint-disable-next-line no-console
    console.log("[preroll]", m);
    setLog((l) => [...l, m]);
  }, []);

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
    if (!debugRef.current) setCfg(null); // keep gate visible in debug mode
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
        if (!debugRef.current) {
          if (!placementAllows(p.placement ?? "watch", page)) return;
          if (!isDue(p, page)) return;
        }
        if (cancelled) return;
        note(`config OK — placement=${p.placement} trigger=${p.trigger}; requesting VAST`);
        setCfg(p);
      } catch {
        /* no config -> no ad */
      }
    })();
    return () => {
      cancelled = true;
    };
    // streamKey in deps so "server"/"match" modes re-evaluate on stream change
  }, [streamKey, page, note]);

  // Phase 2 — request + run the ad in the background; reveal only on real start.
  useEffect(() => {
    if (!cfg) return;
    doneRef.current = false;
    startedRef.current = false;
    let cancelled = false;

    (async () => {
      const ok = await loadIma();
      if (cancelled || doneRef.current) return;
      note(ok ? "IMA SDK loaded" : "IMA SDK FAILED to load");
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
      loader.addEventListener(
        ima.AdErrorEvent.Type.AD_ERROR,
        (e) => {
          note("loader AD_ERROR " + adErrText(e));
          finish();
        },
        false
      );

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
          note("ADS_MANAGER_LOADED — network returned a response");

          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (ev) => {
            note("manager AD_ERROR " + adErrText(ev));
            finish();
          });
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (doneRef.current) return;
            note("ad STARTED ✓ (a real video ad is playing)");
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
          if (!startedRef.current) {
            note(`no ad started within ${waitMs / 1000}s — giving up (no-fill)`);
            finish();
          }
        }, waitMs)
      );
      // Absolute safety net so a stuck ad can never hang the page.
      timersRef.current.push(setTimeout(() => finish(), 90_000));

      try {
        note("requesting ads from VAST tag…");
        loader.requestAds(req);
      } catch {
        note("requestAds threw immediately");
        finish();
      }
    })();

    return () => {
      cancelled = true;
      finish();
    };
  }, [cfg, finish, note]);

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

  // "gate" mode covers the page with black while it checks for an ad; "silent"
  // mode (default) stays invisible until a real ad actually starts.
  const showCover = adShowing || (!!cfg && cfg.mode === "gate") || debugOn;

  // While merely attempting in silent mode, the layer is transparent +
  // non-interactive so the page behind shows through (no black flash). It turns
  // opaque black when a real ad is on screen, or immediately in gate mode.
  return (
    <div
      ref={rootRef}
      className={`${wrap} flex items-center justify-center`}
      style={{
        background: showCover ? "#000" : "transparent",
        opacity: showCover ? 1 : 0,
        pointerEvents: showCover ? "auto" : "none",
      }}
      aria-hidden={!showCover}
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
      {debugOn && (
        <div className="absolute inset-x-2 top-2 z-20 max-h-[70%] overflow-auto rounded-lg bg-black/85 p-3 font-mono text-[11px] leading-snug text-emerald-300">
          <div className="mb-1 font-bold text-white">Pre-roll debug</div>
          {log.length === 0 ? (
            <div>starting…</div>
          ) : (
            log.map((l, i) => <div key={i}>• {l}</div>)
          )}
          <button
            onClick={() => {
              try {
                window.location.href = window.location.pathname;
              } catch {
                /* ignore */
              }
            }}
            className="mt-2 rounded bg-white/20 px-2 py-1 text-white"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
