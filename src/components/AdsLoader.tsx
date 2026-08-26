"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Cap = number | string; // minutes (number); legacy string keys still tolerated
type FmtPlacement = string; // Comma-separated page IDs or "all"
type Format = { enabled: boolean; zone: string; src: string; cap: Cap; delay?: string; placement?: FmtPlacement; type?: "script" | "direct_link"; targets?: Record<string, boolean>; rawScript?: string; };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
  smartLinks?: {
    enabled: boolean;
    url: string;
    targets: Record<string, boolean>;
  };
  popRotation?: {
    enabled: boolean;
    formats: string[];
  };
};

// Popunder rotation: every page view fires the NEXT network in the list, so
// each one gets to serve its high-value "first pop" for this visitor instead
// of a single network serving cheap repeats. Wraps back to the first after the
// last one. The counter lives in localStorage so it survives new tabs.
const ROTATION_KEY = "pp_pop_rot";

function nextRotationIndex(length: number): number {
  if (length <= 1) return 0;
  try {
    const raw = Number(window.localStorage.getItem(ROTATION_KEY));
    const idx = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) % length : 0;
    window.localStorage.setItem(ROTATION_KEY, String((idx + 1) % length));
    return idx;
  } catch {
    // Storage blocked (private mode / cookie walls) — fall back to the first.
    return 0;
  }
}

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

const PAGE_MAP = [
  { id: "home", path: "/" },
  { id: "football", path: "/football" },
  { id: "basketball", path: "/basketball" },
  { id: "nfl", path: "/american-football" },
  { id: "ufc", path: "/ufc" },
  { id: "wwe", path: "/wwe" },
  { id: "boxing", path: "/boxing" },
  { id: "motorsports", path: "/motor-sports" },
  { id: "tennis", path: "/tennis" },
  { id: "cricket", path: "/cricket" },
  { id: "hockey", path: "/hockey" },
  { id: "baseball", path: "/baseball" },
  { id: "rugby", path: "/rugby" },
  { id: "cricket_live", path: "/cricket-live" },
  { id: "world_cup", path: "/world-cup" },
  { id: "tv_channels", path: "/tv-channels" },
  { id: "help", path: "/help" },
  { id: "subscribe", path: "/subscribe" },
];

function getCurrentPageId(path: string): string {
  if (path === "/") return "home";
  if (path.startsWith("/watch/tv-")) return "tv_channels";
  if (path.startsWith("/watch/")) return "watch";
  if (path === "/alt" || path.startsWith("/alt/")) return "alt";
  if (path.startsWith("/league/")) return "leagues";
  if (path === "/tv-channels" || path === "/tv-channels/") return "tv_channels";
  const found = PAGE_MAP.find(p => path === p.path || path === p.path + "/");
  return found ? found.id : "other";
}

// Per-format placement gate. Check if current page is in the ad's allowed list.
function placementAllows(placement: FmtPlacement | undefined, path: string): boolean {
  if (!placement || placement === "all") return true;

  // Legacy support for simple strings
  if (placement === "home" && path === "/") return true;
  if (placement === "watch" && path.startsWith("/watch/")) return true;

  // Modern multi-select logic
  const allowedIds = placement.split(",").filter(Boolean);
  const currentId = getCurrentPageId(path);
  
  return allowedIds.includes(currentId);
}

// Inject an ad script. Monetag tags need a data-zone; Adsterra tags (popunder,
// social bar) are a plain script with no zone; ExoClick tags use ad-provider.js + ins.
function injectScript(id: string, src: string, zone: string, rawScript?: string) {
  if (!src && !rawScript) return;
  if (document.querySelector(`[data-ad-format="${id}"]`)) return; // once per load

  // If a rawScript is configured (for ExoClick popunder, Monetag, or any custom tag)
  if (rawScript && rawScript.trim()) {
    let jsContent = rawScript.trim();
    // Strip outer <script...> and </script> tags if user pasted full HTML tags
    jsContent = jsContent.replace(/^<script[\s\S]*?>/i, "").replace(/<\/script>[\s\S]*$/i, "").trim();

    // Critical SPA fix for ExoClick popMagic:
    // ExoClick checks if document.readyState === "complete" ? preparePopWait() : window.addEventListener("load", preparePop)
    // In React SPA / Next.js client navigation, the window "load" event has already fired,
    // so waiting for "load" causes it to hang indefinitely. We force immediate execution.
    jsContent = jsContent.replace(/["']complete["']\s*===?\s*document\.readyState/g, "true");
    jsContent = jsContent.replace(/document\.readyState\s*===?\s*["']complete["']/g, "true");

    const script = document.createElement("script");
    script.type = "application/javascript";
    script.dataset.adFormat = id;
    if (zone) script.dataset.exoZone = zone;
    script.text = jsContent;
    document.head.appendChild(script);
    return;
  }

  // ExoClick Mobile Popunder fallback (if no raw script provided)
  if (id.includes("exoclick") && id.toLowerCase().includes("popunder")) {
    const zoneId = zone || "5997602";
    if (document.querySelector(`script[data-exo-zone="${zoneId}"]`)) return;
    const s = document.createElement("script");
    s.type = "application/javascript";
    s.async = true;
    s.src = "https://a.pemsrv.com/popunder1000.js";
    s.dataset.exoZone = zoneId;
    s.dataset.adFormat = id;
    s.setAttribute("data-exo-idzone", zoneId);
    document.body.appendChild(s);
    return;
  }

  // ExoClick Display / Interstitial Tags (ad-provider.js + <ins> tag + AdProvider push)
  if (src.includes("ad-provider.js") || src.includes("pemsrv.com")) {
    if (!document.querySelector(`script[src*="ad-provider.js"]`)) {
      const s = document.createElement("script");
      s.async = true;
      s.type = "application/javascript";
      s.src = src;
      document.body.appendChild(s);
    }
    if (zone && !document.querySelector(`ins[data-zoneid="${zone}"]`)) {
      const ins = document.createElement("ins");
      ins.className = "eas6a97888e33";
      ins.dataset.zoneid = zone;
      ins.dataset.adFormat = id;
      document.body.appendChild(ins);

      const run = document.createElement("script");
      run.dataset.adFormat = `${id}-run`;
      run.innerHTML = `(window.AdProvider = window.AdProvider || []).push({"serve": {}});`;
      document.body.appendChild(run);
    }
    return;
  }

  const s = document.createElement("script");
  s.async = true;
  if (zone) s.dataset.zone = zone;
  s.dataset.adFormat = id;
  s.src = src;

  // Adsterra scripts (no zone) often perform better when loaded in the head
  if (!zone) {
    document.head.appendChild(s);
  } else {
    document.body.appendChild(s);
  }
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
        // Formats taking part in the popunder rotation are driven by the block
        // below instead of their own enabled flag, so they never double-fire.
        const rotation = cfg.popRotation;
        const rotationIds =
          rotation?.enabled && Array.isArray(rotation.formats)
            ? rotation.formats.filter((rid) => !!cfg.formats?.[rid])
            : [];
        const rotating = new Set(rotationIds);

        const eligibleRotation = rotationIds.filter((rid) =>
          placementAllows(cfg.formats[rid].placement, path)
        );
        if (eligibleRotation.length > 0) {
          const pickedId = eligibleRotation[nextRotationIndex(eligibleRotation.length)];
          const picked = cfg.formats[pickedId];
          const rt = setTimeout(() => {
            if (done) return;
            injectScript(pickedId, picked.src, picked.zone, picked.rawScript);
          }, delaySeconds(picked.delay) * 1000);
          timers.push(rt);
        }

        for (const [id, f] of Object.entries(cfg.formats || {})) {
          if (rotating.has(id)) continue;
          if (!f?.enabled) continue;
          if (!placementAllows(f.placement, path)) continue;

          // Skip custom frequency cap for popunders (allow network to handle it)
          const isPopunder = id.toLowerCase().includes("popunder");

          const t = setTimeout(() => {
            if (done) return;
            if (!isPopunder && !capAllows(id, f.cap)) return;
            injectScript(id, f.src, f.zone, f.rawScript);
          }, delaySeconds(f.delay) * 1000);
          timers.push(t);
        }

        // ── Direct Link / Smart Link Interceptor ──────────────────
        const directLinks: { url: string; targets: Record<string, boolean> }[] = [];
        if (cfg.smartLinks?.enabled && cfg.smartLinks.url) {
          directLinks.push({ url: cfg.smartLinks.url, targets: cfg.smartLinks.targets });
        }
        for (const f of Object.values(cfg.formats || {})) {
          if (f?.enabled && f.type === "direct_link" && f.src) {
            directLinks.push({ url: f.src, targets: f.targets || {} });
          }
        }

        if (directLinks.length > 0) {
          const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest("a");
            const btn = target.closest("button");
            
            if (!link && !btn) return;

            // Handle Buttons (like on /cricket-live)
            if (btn && path === "/cricket-live") {
              const text = btn.innerText?.toUpperCase() || "";
              if (text.includes("WATCH")) {
                for (const sl of directLinks) {
                  if (sl.targets["cricket_watch"]) {
                    window.open(sl.url, "_blank");
                    return; // only open the first matched direct link
                  }
                }
              }
            }

            if (!link) return;

            const href = link.getAttribute("href") || "";
            let key = "";
            if (href.startsWith("/league/")) key = href.replace("/league/", "");
            else if (href === "/world-cup") key = "wc";
            else if (href === "/cricket-live") key = "cricket";
            else if (href === "/tv-channels") key = "tv_channels";
            else if (href.startsWith("/watch/")) key = "watch_buttons";
            else if (href.startsWith("/") && !href.includes(".")) {
               const s = href.slice(1);
               // We need to check if ANY direct link targets this 's' to assign it as the key
               if (directLinks.some(sl => sl.targets[s])) key = s;
            }

            if (key) {
               for (const sl of directLinks) {
                  if (sl.targets[key]) {
                     window.open(sl.url, "_blank");
                     return; // only open the first matched direct link
                  }
               }
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
