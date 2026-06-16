"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// --- Minimal IMA SDK typings (same subset PreRollGate uses) ---
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
      LOADED: string;
    };
  };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
}

// Window.google is already augmented in PreRollGate; read it via a cast here.
function getIma(): ImaNamespace | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { google?: { ima?: ImaNamespace } }).google?.ima;
}

const IMA_SDK = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

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

let imaLoader: Promise<boolean> | null = null;
function loadIma(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (getIma()) return Promise.resolve(true);
  if (imaLoader) return imaLoader;
  imaLoader = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = IMA_SDK;
    s.async = true;
    s.onload = () => resolve(!!getIma());
    s.onerror = () => {
      imaLoader = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return imaLoader;
}

export default function AdTestPage() {
  const [tag, setTag] = useState("");
  const [waitS, setWaitS] = useState(8);
  const [muted, setMuted] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const [log, setLog] = useState<string[]>([]);

  const boxRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const loaderRef = useRef<ImaAdsLoader | null>(null);
  const managerRef = useRef<ImaAdsManager | null>(null);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const note = useCallback((m: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((l) => [...l, `${t}  ${m}`]);
  }, []);

  // Preload the IMA SDK + prefill the tag from the saved pre-roll config.
  useEffect(() => {
    loadIma().then((ok) => setSdkReady(ok));
    fetch("/api/ads-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const v = c?.preroll?.vastTag;
        if (typeof v === "string" && v) setTag(v);
      })
      .catch(() => {});
  }, []);

  const teardown = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    try {
      managerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    try {
      loaderRef.current?.destroy();
    } catch {
      /* ignore */
    }
    managerRef.current = null;
    loaderRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Runs INSIDE the button click (a real user gesture) — this is the whole point.
  const play = useCallback(() => {
    if (!tag.trim()) {
      note("⚠ no tag entered");
      return;
    }
    const ima = getIma();
    if (!ima) {
      note("IMA SDK not ready yet — tap again in a second");
      loadIma().then((ok) => setSdkReady(ok));
      return;
    }
    teardown();
    startedRef.current = false;
    setLog([]);
    setStatus("loading");
    note("tap received — requesting ad (user gesture)");

    const box = boxRef.current;
    const adContainer = adContainerRef.current;
    const video = videoRef.current;
    if (!box || !adContainer || !video) {
      note("internal: missing container");
      return;
    }

    const w = box.clientWidth || 320;
    const h = box.clientHeight || 180;

    const display = new ima.AdDisplayContainer(adContainer, video);
    display.initialize(); // must happen within the gesture for mobile autoplay
    note("display initialized");

    const loader = new ima.AdsLoader(display);
    loaderRef.current = loader;

    loader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      (e) => {
        note("LOADER ERROR " + adErrText(e));
        setStatus("idle");
        teardown();
      },
      false
    );

    loader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (e) => {
        note("response received — building player");
        const rs = new ima.AdsRenderingSettings();
        rs.restoreCustomPlaybackStateOnAdBreakComplete = false;
        const mgr = e.getAdsManager(video, rs);
        managerRef.current = mgr;

        mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (ev) => {
          note("PLAY ERROR " + adErrText(ev));
          setStatus("idle");
          teardown();
        });
        mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
          startedRef.current = true;
          setStatus("playing");
          note("✅ AD STARTED — it fired!");
        });
        mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () =>
          note("ad complete")
        );
        mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          note("all ads completed");
          setStatus("idle");
          teardown();
        });

        try {
          mgr.init(w, h, ima.ViewMode.NORMAL);
          mgr.setVolume(muted ? 0 : 1);
          mgr.start();
          note("started playback");
        } catch (err) {
          note("start threw: " + String(err));
          setStatus("idle");
          teardown();
        }
      },
      false
    );

    const req = new ima.AdsRequest();
    req.adTagUrl = tag.trim();
    req.linearAdSlotWidth = w;
    req.linearAdSlotHeight = h;
    req.nonLinearAdSlotWidth = w;
    req.nonLinearAdSlotHeight = Math.floor(h / 3);
    try {
      req.setAdWillAutoPlay(true);
      req.setAdWillPlayMuted(muted);
    } catch {
      /* older SDK */
    }

    timerRef.current = setTimeout(() => {
      if (!startedRef.current) {
        note(`⏱ no ad started within ${waitS}s — no-fill (network had nothing)`);
        setStatus("idle");
        teardown();
      }
    }, Math.max(2, waitS) * 1000);

    try {
      loader.requestAds(req);
      note("request sent to ad network…");
    } catch (err) {
      note("requestAds threw: " + String(err));
      setStatus("idle");
      teardown();
    }
  }, [tag, waitS, muted, note, teardown]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ad Tester</h1>
        <p className="mt-1 text-sm text-gray-600">
          Paste any VAST tag and tap <b>Play</b>. The ad is requested on your tap
          (a real user gesture), which often fills when page-load autoplay won&apos;t.
          Watch the log to see exactly what happens. Admin-only.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[13px] font-semibold text-gray-800">
          VAST tag URL
        </label>
        <textarea
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          rows={3}
          placeholder="https://… paste a VAST tag here"
          className="w-full rounded-lg border border-gray-300 p-3 font-mono text-[12px]"
        />
        <p className="text-[12px] text-gray-500">
          Prefilled with your saved pre-roll tag. Replace it to test a different ad.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px] text-gray-800">
          Wait
          <input
            type="number"
            min={2}
            max={30}
            value={waitS}
            onChange={(e) => setWaitS(Number(e.target.value) || 8)}
            className="w-16 rounded border border-gray-300 px-2 py-1"
          />
          sec
        </label>
        <label className="flex items-center gap-2 text-[13px] text-gray-800">
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => setMuted(e.target.checked)}
          />
          muted
        </label>
        <span className="text-[12px] text-gray-500">
          SDK: {sdkReady ? "ready ✓" : "loading…"}
        </span>
      </div>

      <button
        onClick={play}
        disabled={status === "loading"}
        className="rounded-xl bg-emerald-600 px-6 py-3 text-[15px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {status === "loading"
          ? "Requesting…"
          : status === "playing"
          ? "Playing ▶"
          : "▶ Play ad (tap)"}
      </button>

      {/* Ad render area */}
      <div
        ref={boxRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      >
        <div ref={adContainerRef} className="absolute inset-0" />
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          playsInline
          muted={muted}
          preload="auto"
        />
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
            ad will appear here
          </div>
        )}
      </div>

      {/* Log */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-gray-800">Log</span>
          <button
            onClick={() => setLog([])}
            className="text-[12px] text-gray-500 hover:text-gray-700"
          >
            clear
          </button>
        </div>
        <div className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-gray-700">
          {log.length === 0 ? (
            <div className="text-gray-400">no events yet — tap Play</div>
          ) : (
            log.map((l, i) => <div key={i}>• {l}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
