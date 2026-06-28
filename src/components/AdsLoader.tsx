"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Cap = number | string; // minutes (number); legacy string keys still tolerated
type FmtPlacement = "all" | "watch" | "home";
type Format = { enabled: boolean; zone: string; src: string; cap: Cap; delay?: string; placement?: FmtPlacement };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
  smartLinks?: {
    enabled: boolean;
    url: string;
    targets: Record<string, boolean>;
  };
};

function domainAllowed(setting: AdsConfig["domains"], host: string): boolean {
  if (setting === "all") return true;
  if (setting === "workers_dev") return host.endsWith(".workers.dev");
  if (setting === "xellnetwork") return host.endsWith("xellnetwork.xyz");
  return false;
}

// Frequency cap, enforced per device via localStorage.
// cap is minutes between loads; 0 (or missing) = no limit.
const LEGACY_CAP: Record<string, number> = { off: 0, "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };
function capMinutes(cap: Cap | undefined): number {
  if (typeof cap === "number") return cap > 0 ? cap : 0;
  if (typeof cap === "string") return LEGACY_CAP[cap] ?? 0;
  return 0;
}

function capAllows(id: string, cap: Cap | undefined): boolean {
  try {
    const mins = capMinutes(cap);
    if (mins <= 0) return true; // no limit
    const k = `ad_t_${id}`;
    const last = Number(localStorage.getItem(k) || 0);
    if (Date.now() - last < mins * 60 * 1000) return false;
    localStorage.setItem(k, String(Date.now()));
    return true;
  } catch {
    return true; // storage blocked -> don't block the ad
  }
}

// How long to wait after the visitor lands before the ad first appears.
const DELAY_SECONDS: Record<string, number> = { "15s": 15, "30s": 30, "1m": 60, "2m": 120, "3m": 180, "4m": 240, "5m": 300, "10m": 600 };
function delaySeconds(d?: string): number {
  return (d && DELAY_SECONDS[d]) || 0;
}

// Per-format placement gate. Popunder is scoped to the watch page so it fires
// on the play tap, not on casual home-page browsing.
function placementAllows(placement: FmtPlacement | undefined, path: string): boolean {
  if (path.startsWith("/ppv") || path.startsWith("/cricket")) return true; 
  if (!placement || placement === "all") return true;
  if (placement === "watch") return path.startsWith("/watch");
  if (placement === "home") return path === "/";
  return true;
}

// Inject an ad script. Monetag tags need a data-zone; Adsterra tags (popunder,
// social bar) are a plain script with no zone — both are supported here.
function injectScript(id: string, src: string, zone: string) {
  if (!src) return;
  if (document.querySelector(`script[data-ad-format="${id}"]`)) return; // once per load
  const s = document.createElement("script");
  if (zone) s.dataset.zone = zone;
  s.dataset.adFormat = id;
  s.src = src;
  document.body.appendChild(s);
}

export default function AdsLoader() {
  const pathname = usePathname();
  const cfgRef = useRef<AdsConfig | null>(null);

  useEffect(() => {
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      try {
        // Fetch the config once, then reuse it on later navigations.
        let cfg = cfgRef.current;
        if (!cfg) {
          const res = await fetch("/api/ads-config", { cache: "no-store" });
          if (!res.ok) return;
          cfg = (await res.json()) as AdsConfig;
          cfgRef.current = cfg;
        }
        if (done || !cfg?.master) return; // master kill-switch
        const path = pathname || window.location.pathname;
        if (path.startsWith("/admin") || path.startsWith("/partner")) return; // never on admin or partner portal
        if (!domainAllowed(cfg.domains, window.location.hostname)) return;
        for (const [id, f] of Object.entries(cfg.formats || {})) {
          if (!f?.enabled) continue;
          if (!placementAllows(f.placement, path)) continue;
          const t = setTimeout(() => {
            if (done) return;
            if (!capAllows(id, f.cap)) return;
            injectScript(id, f.src, f.zone);
          }, delaySeconds(f.delay) * 1000);
          timers.push(t);
        }

        // ── Adsterra Smart Link Interceptor ──────────────────
        if (cfg.smartLinks?.enabled && cfg.smartLinks.url) {
          const sl = cfg.smartLinks;
          const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest("a");
            if (!link) return;

            const href = link.getAttribute("href") || "";
            let key = "";
            if (href.startsWith("/league/")) key = href.replace("/league/", "");
            else if (href === "/world-cup") key = "wc";
            else if (href === "/cricket-live") key = "cricket";
            else if (href.startsWith("/watch/")) key = "watch_buttons";
            else if (href.startsWith("/") && !href.includes(".")) {
               const s = href.slice(1);
               if (sl.targets[s]) key = s;
            }

            if (key && sl.targets[key]) {
               window.open(sl.url, "_blank");
            }
          };
          document.addEventListener("click", handleGlobalClick, { capture: true });
          return () => {
            document.removeEventListener("click", handleGlobalClick, { capture: true });
          };
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      done = true;
      timers.forEach(clearTimeout);
    };
  }, [pathname]);
  return null;
}
