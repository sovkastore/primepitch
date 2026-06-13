"use client";

import { useEffect } from "react";

type Cap = "off" | "session" | "daily";
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
// off     -> always load
// session -> load once per page session (sessionStorage)
// daily   -> load at most once per 24h on this device
function capAllows(id: string, cap: Cap): boolean {
  try {
    if (cap === "off") return true;
    if (cap === "session") {
      const k = `ad_s_${id}`;
      if (sessionStorage.getItem(k)) return false;
      sessionStorage.setItem(k, "1");
      return true;
    }
    if (cap === "daily") {
      const k = `ad_d_${id}`;
      const last = Number(localStorage.getItem(k) || 0);
      if (Date.now() - last < 24 * 60 * 60 * 1000) return false;
      localStorage.setItem(k, String(Date.now()));
      return true;
    }
  } catch {
    return true; // storage blocked -> don't block the ad
  }
  return true;
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
