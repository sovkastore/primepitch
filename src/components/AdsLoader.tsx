"use client";

import { useEffect } from "react";

type Cap = "off" | "30m" | "1h" | "2h" | "24h";
type Format = { enabled: boolean; zone: string; src: string; cap: Cap };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
};

function domainAllowed(setting: AdsConfig["domains"], host: string): boolean {
  if (setting === "all") return true;
  if (setting === "workers_dev") return host.endsWith(".workers.dev");
  if (setting === "xellnetwork") return host.endsWith("xellnetwork.xyz");
  return false;
}

// Frequency cap, enforced per device via localStorage.
// off -> always load. Otherwise load at most once per N minutes on this device.
const CAP_MINUTES: Record<string, number> = { "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };

function capAllows(id: string, cap: Cap): boolean {
  try {
    const mins = CAP_MINUTES[cap];
    if (!mins) return true; // "off" or anything unknown -> always load
    const k = `ad_t_${id}`;
    const last = Number(localStorage.getItem(k) || 0);
    if (Date.now() - last < mins * 60 * 1000) return false;
    localStorage.setItem(k, String(Date.now()));
    return true;
  } catch {
    return true; // storage blocked -> don't block the ad
  }
}

function injectMonetag(id: string, zone: string, src: string) {
  if (!zone || !src) return;
  if (document.querySelector(`script[data-ad-format="${id}"]`)) return; // once per load
  const s = document.createElement("script");
  s.dataset.zone = zone;
  s.dataset.adFormat = id;
  s.src = src;
  document.body.appendChild(s);
}

export default function AdsLoader() {
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const res = await fetch("/api/ads-config", { cache: "no-store" });
        if (!res.ok) return;
        const cfg = (await res.json()) as AdsConfig;
        if (done || !cfg?.master) return; // master kill-switch
        if (window.location.pathname.startsWith("/admin")) return; // never on admin
        if (!domainAllowed(cfg.domains, window.location.hostname)) return;
        for (const [id, f] of Object.entries(cfg.formats || {})) {
          if (!f?.enabled) continue;
          if (!capAllows(id, f.cap)) continue;
          injectMonetag(id, f.zone, f.src);
        }
      } catch {
        // network/parse failure -> show no ads
      }
    })();
    return () => {
      done = true;
    };
  }, []);
  return null;
}
