"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type VpnConfig = {
  enabled: boolean;
  name: string;
  description: string;
  downloadUrl: string;
  recommendedServer: string;
  fileSize: string;
  version: string;
};

const STEPS = [
  {
    num: "01",
    title: "Download the VPN",
    desc: "Tap the button below to download the APK file directly to your device.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Install the APK",
    desc: 'Open the downloaded file and tap "Install". Allow installation from unknown sources if prompted.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Connect to Singapore",
    desc: "Open the VPN app, select Singapore as your server location, and tap Connect.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "Watch & enjoy",
    desc: "Come back, refresh the match page and press play. No buffering, no blocks.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const FEATURES = [
  { icon: "🚀", title: "Fast Connection", desc: "Optimised for HD video streaming with minimal lag" },
  { icon: "🔒", title: "Secure & Private", desc: "Your IP is hidden — no one can track what you watch" },
  { icon: "🌍", title: "Bypass Blocks", desc: "Stream from any country without restrictions" },
  { icon: "📱", title: "Android Ready", desc: "Works on all Android devices — phones and tablets" },
];

export default function VpnPage() {
  const [cfg, setCfg] = useState<VpnConfig | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    fetch("/api/vpn-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => {});
  }, []);

  // Pulse animation on btn every 3s
  useEffect(() => {
    const id = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 700);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  function handleDownload() {
    if (!cfg?.downloadUrl) return;
    setDownloading(true);
    window.open(cfg.downloadUrl, "_blank");
    setTimeout(() => setDownloading(false), 2000);
  }

  const hasLink = !!cfg?.downloadUrl;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1a1a2e 50%, #0f2027 100%)" }}>
      {/* Back nav */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to PrimePitch
        </Link>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-12 pb-8 text-center">
        {/* Shield icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
          style={{ background: "linear-gradient(135deg, #3cac3b22, #22c55e33)", border: "1px solid #3cac3b44" }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10" style={{ color: "#3cac3b" }}>
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
              fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4"
          style={{ background: "#3cac3b22", border: "1px solid #3cac3b44", color: "#4ade80" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          FREE · NO SIGN-UP REQUIRED
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
          Watch Every Match,<br />
          <span style={{ background: "linear-gradient(135deg, #3cac3b, #22c55e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Anywhere in the World
          </span>
        </h1>

        <p className="text-lg text-white/60 max-w-xl mx-auto mb-8 leading-relaxed">
          {cfg?.description || "Watch every match with no buffering, no blocks, and no ads slowing you down. Takes 2 minutes to set up."}
        </p>

        {/* Download button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleDownload}
            disabled={!hasLink || downloading}
            className="relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: hasLink ? "linear-gradient(135deg, #3cac3b, #22c55e)" : "#374151",
              boxShadow: hasLink ? `0 0 ${pulse ? "40px" : "20px"} #3cac3b55, 0 8px 32px #3cac3b44` : "none",
              transform: pulse && hasLink ? "scale(1.02)" : "scale(1)",
              transition: "all 0.3s ease",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloading ? "Opening download…" : `Download ${cfg?.name || "VPN"} APK`}
          </button>

          {cfg?.fileSize && (
            <p className="text-xs text-white/30">
              {cfg.fileSize} · Android APK · {cfg.version || "Latest Version"}
            </p>
          )}

          {!hasLink && cfg && (
            <p className="text-xs text-yellow-400/70 mt-1">Download link not yet configured — check back soon.</p>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-xl font-bold text-white text-center mb-8">
          Set up in 4 simple steps
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STEPS.map((step) => (
            <div key={step.num} className="flex gap-4 p-5 rounded-2xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #3cac3b22, #22c55e22)", color: "#4ade80" }}>
                {step.icon}
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: "#3cac3b" }}>
                  STEP {step.num}
                </div>
                <div className="text-white font-semibold text-sm mb-1">{step.title}</div>
                <div className="text-white/50 text-sm leading-relaxed">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended server callout */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <div className="rounded-2xl p-6 text-center"
          style={{ background: "linear-gradient(135deg, #3cac3b15, #22c55e10)", border: "1px solid #3cac3b33" }}>
          <div className="text-3xl mb-2">🇸🇬</div>
          <h3 className="text-white font-bold text-lg mb-1">
            Best server: <span style={{ color: "#4ade80" }}>{cfg?.recommendedServer || "Singapore"}</span>
          </h3>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            After installing, always connect to <strong className="text-white/70">{cfg?.recommendedServer || "Singapore"}</strong> for the fastest, most reliable stream. If one server doesn't work, try another location nearby.
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-4 rounded-2xl text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-white font-semibold text-sm mb-1">{f.title}</div>
              <div className="text-white/40 text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-4xl mx-auto px-4 pb-16 text-center">
        <button
          onClick={handleDownload}
          disabled={!hasLink || downloading}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: hasLink ? "linear-gradient(135deg, #3cac3b, #22c55e)" : "#374151",
            boxShadow: hasLink ? "0 8px 32px #3cac3b44" : "none",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {downloading ? "Opening download…" : `Download ${cfg?.name || "VPN"} — It's Free`}
        </button>
        <p className="text-white/30 text-xs mt-4">
          Free to use · No account needed · Android only
        </p>
      </div>
    </div>
  );
}
