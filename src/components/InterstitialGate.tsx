"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Click-Triggered Interstitial Ad
//
// Intercepts the FIRST user click/tap on the page, plays a full-screen VAST
// video ad from ExoClick, then releases the click so the user can continue.
// Which pages this runs on is controlled by the admin `interstitial.pages`
// setting (comma-separated page IDs or "all").

type InterstitialConfig = {
  enabled: boolean;
  vastTag: string;
  pages: string; // comma-separated page ids or "all"
  cooldown: number; // minutes between interstitials (0 = every page load)
  noFillTimeout: number; // seconds to wait for VAST to return an ad
};

type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  interstitial?: InterstitialConfig;
};

// --- Minimal typings for the bits of the IMA SDK we use ---
type ImaEvent = { type: string };
interface ImaAdDisplayContainer { initialize(): void; }
interface ImaAdsRenderingSettings { restoreCustomPlaybackStateOnAdBreakComplete: boolean; }
interface ImaAdsManager {
  addEventListener(type: string, cb: (e: ImaEvent) => void): void;
  init(width: number, height: number, viewMode: string): void;
  start(): void;
  setVolume(volume: number): void;
  resize(width: number, height: number, viewMode: string): void;
  destroy(): void;
}
interface ImaAdsManagerLoadedEvent {
  getAdsManager(content: HTMLVideoElement, settings: ImaAdsRenderingSettings): ImaAdsManager;
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
  addEventListener(type: string, cb: (e: ImaAdsManagerLoadedEvent) => void, capture?: boolean): void;
  requestAds(req: ImaAdsRequest): void;
  destroy(): void;
}
interface ImaNamespace {
  AdDisplayContainer: new (el: HTMLElement, video: HTMLVideoElement) => ImaAdDisplayContainer;
  AdsLoader: new (c: ImaAdDisplayContainer) => ImaAdsLoader;
  AdsRequest: new () => ImaAdsRequest;
  AdsRenderingSettings: new () => ImaAdsRenderingSettings;
  ViewMode: { NORMAL: string };
  AdEvent: { Type: { STARTED: string; COMPLETE: string; ALL_ADS_COMPLETED: string; SKIPPED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
}


const IMA_SDK = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

// Map page IDs to path prefixes so we can match the current page.
const PAGE_MAP: Record<string, string> = {
  home: "/",
  football: "/football",
  basketball: "/basketball",
  nfl: "/american-football",
  ufc: "/ufc",
  wwe: "/wwe",
  boxing: "/boxing",
  motorsports: "/motor-sports",
  tennis: "/tennis",
  cricket: "/cricket",
  hockey: "/hockey",
  baseball: "/baseball",
  tv_channels: "/tv-channels",
  cricket_live: "/cricket-live",
  sports_live: "/sports-live",
  world_cup: "/world-cup",
  watch: "/watch/",
  leagues: "/league/",
  help: "/help",
  subscribe: "/subscribe",
};

function domainAllowed(setting: AdsConfig["domains"], host: string): boolean {
  if (setting === "all") return true;
  if (setting === "workers_dev") return host.endsWith(".workers.dev");
  if (setting === "xellnetwork") return host.endsWith("xellnetwork.xyz");
  return false;
}

function pageAllowed(pages: string, pathname: string): boolean {
  if (pages === "all") return true;
  const ids = pages.split(",").map(s => s.trim()).filter(Boolean);
  return ids.some(id => {
    const prefix = PAGE_MAP[id];
    if (!prefix) return false;
    if (prefix === "/") return pathname === "/";
    return pathname.startsWith(prefix);
  });
}

function cooldownOk(cooldown: number): boolean {
  if (cooldown <= 0) return true;
  try {
    const last = Number(localStorage.getItem("interstitial_t") || 0);
    if (Date.now() - last < cooldown * 60000) return false;
  } catch { /* ignore */ }
  return true;
}

function markCooldown() {
  try { localStorage.setItem("interstitial_t", String(Date.now())); } catch { /* ignore */ }
}

let imaLoader: Promise<boolean> | null = null;
function loadIma(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.ima) return Promise.resolve(true);
  if (imaLoader) return imaLoader;
  imaLoader = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-ima]");
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
    s.onerror = () => { imaLoader = null; resolve(false); };
    document.head.appendChild(s);
  });
  return imaLoader;
}

export default function InterstitialGate() {
  const pathname = usePathname();
  const [cfg, setCfg] = useState<InterstitialConfig | null>(null);
  const [adShowing, setAdShowing] = useState(false);
  const triggered = useRef(false);
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
    try { adsManagerRef.current?.destroy(); } catch { /* ignore */ }
    try { adsLoaderRef.current?.destroy(); } catch { /* ignore */ }
    adsManagerRef.current = null;
    adsLoaderRef.current = null;
    setAdShowing(false);
    setCfg(null);
  }, []);

  // Phase 1 — Fetch config and check if interstitial is due on this page.
  useEffect(() => {
    triggered.current = false;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ads-config", { cache: "no-store" });
        if (!res.ok) return;
        const c = (await res.json()) as AdsConfig;
        const i = c.interstitial;
        if (!c.master || !i?.enabled || !i.vastTag) return;
        if (typeof window === "undefined") return;
        if (window.location.pathname.startsWith("/admin")) return;
        if (!domainAllowed(c.domains, window.location.hostname)) return;
        if (!pageAllowed(i.pages, pathname)) return;
        if (!cooldownOk(i.cooldown)) return;
        if (cancelled) return;
        setCfg(i);
      } catch { /* no config -> no ad */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  // Phase 2 — Listen for the first click/tap on the page to trigger the ad.
  useEffect(() => {
    if (!cfg) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      // Don't intercept clicks on the admin panel or on the interstitial overlay itself.
      const target = e.target as HTMLElement;
      if (target.closest("[data-interstitial-overlay]")) return;
      if (triggered.current) return;
      triggered.current = true;
      // Don't prevent default — let the click happen naturally after the ad.
      // But show the interstitial overlay.
      markCooldown();
      playAd();
    };
    document.addEventListener("click", handler, { capture: true, once: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [cfg]);

  // Phase 3 — Play the ad.
  const playAd = useCallback(async () => {
    if (!cfg) return;
    doneRef.current = false;
    startedRef.current = false;
    setAdShowing(true);

    const ok = await loadIma();
    if (doneRef.current) return;
    const ima = window.google?.ima;
    const root = rootRef.current;
    const adContainer = adContainerRef.current;
    const content = contentRef.current;
    if (!ok || !ima || !root || !adContainer || !content) {
      finish();
      return;
    }

    const dims = () => ({
      w: window.innerWidth,
      h: window.innerHeight,
    });

    const display = new ima.AdDisplayContainer(adContainer, content);
    display.initialize();

    const loader = new ima.AdsLoader(display);
    adsLoaderRef.current = loader;

    loader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      () => finish(),
      false
    );

    loader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (e: ImaAdsManagerLoadedEvent) => {
        if (doneRef.current) { finish(); return; }
        const rs = new ima.AdsRenderingSettings();
        rs.restoreCustomPlaybackStateOnAdBreakComplete = false;
        const mgr = e.getAdsManager(content, rs);
        adsManagerRef.current = mgr;

        mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish());
        mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
          if (doneRef.current) return;
          startedRef.current = true;
        });
        mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish());
        mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish());
        mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish());

        try {
          const { w, h } = dims();
          mgr.init(w, h, ima.ViewMode.NORMAL);
          mgr.setVolume(0);
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
    } catch { /* older SDK */ }

    // No-fill backstop
    const waitMs = Math.max(2, Number(cfg.noFillTimeout ?? 5)) * 1000;
    timersRef.current.push(
      setTimeout(() => {
        if (!startedRef.current) finish();
      }, waitMs)
    );
    // Absolute safety net
    timersRef.current.push(setTimeout(() => finish(), 90_000));

    try {
      loader.requestAds(req);
    } catch {
      finish();
    }
  }, [cfg, finish]);

  // Resize handler
  useEffect(() => {
    if (!adShowing) return;
    const onResize = () => {
      const mgr = adsManagerRef.current;
      const ima = window.google?.ima;
      if (!mgr || !ima) return;
      try {
        mgr.resize(window.innerWidth, window.innerHeight, ima.ViewMode.NORMAL);
      } catch { /* ignore */ }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [adShowing]);

  if (!adShowing) return null;

  return (
    <div
      ref={rootRef}
      data-interstitial-overlay
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "#000" }}
    >
      <div ref={adContainerRef} className="absolute inset-0" />
      <video
        ref={contentRef}
        className="absolute inset-0 h-full w-full opacity-0"
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
