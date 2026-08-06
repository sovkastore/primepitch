"use client";

import { useState, useEffect } from "react";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

type VpnConfig = {
  enabled: boolean;
  name: string;
  description: string;
  downloadUrl: string;
  recommendedServer: string;
  fileSize: string;
  version: string;
};

const VPN_DEFAULTS: VpnConfig = {
  enabled: false,
  name: "Proton VPN",
  description: "Watch every match with no buffering, no blocks, and no ads slowing you down. Takes 2 minutes to set up.",
  downloadUrl: "",
  recommendedServer: "Singapore",
  fileSize: "52 MB",
  version: "Latest",
};

export default function AdminSettingsPage() {
  const [aggregating, setAggregating] = useState(false);
  const [aggregateResult, setAggregateResult] = useState<string | null>(null);

  const [socials, setSocials] = useState<SocialLink[]>([]);
  const [savingSocials, setSavingSocials] = useState(false);
  const [socialsMsg, setSocialsMsg] = useState("");

  const [vpn, setVpn] = useState<VpnConfig>(VPN_DEFAULTS);
  const [savingVpn, setSavingVpn] = useState(false);
  const [vpnMsg, setVpnMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/social-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSocials(Array.isArray(d.links) ? d.links : []))
      .catch(() => {});
    fetch("/api/admin/vpn-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setVpn({ ...VPN_DEFAULTS, ...d }))
      .catch(() => {});
  }, []);

  function updateSocial(id: string, patch: Partial<SocialLink>) {
    setSocials((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveSocials() {
    setSavingSocials(true);
    setSocialsMsg("");
    try {
      const res = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: socials }),
      });
      if (!res.ok) throw new Error();
      setSocialsMsg("Saved.");
    } catch {
      setSocialsMsg("Failed to save.");
    } finally {
      setSavingSocials(false);
    }
  }

  async function saveVpn() {
    setSavingVpn(true);
    setVpnMsg("");
    try {
      const res = await fetch("/api/admin/vpn-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vpn),
      });
      if (!res.ok) throw new Error();
      setVpnMsg("Saved.");
    } catch {
      setVpnMsg("Failed to save.");
    } finally {
      setSavingVpn(false);
    }
  }

  async function runAggregation() {
    setAggregating(true);
    setAggregateResult(null);
    try {
      // Run for today and yesterday
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const [r1, r2] = await Promise.all([
        fetch("/api/admin/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: yesterday }),
        }).then((r) => r.json()),
        fetch("/api/admin/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today }),
        }).then((r) => r.json()),
      ]);

      setAggregateResult(
        `Done! Yesterday: ${r1.total_views || 0} views, ${r1.unique_visitors || 0} unique. Today: ${r2.total_views || 0} views, ${r2.unique_visitors || 0} unique.`
      );
    } catch {
      setAggregateResult("Failed to run aggregation.");
    } finally {
      setAggregating(false);
    }
  }
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Data management */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Data Management
        </h2>
        <div>
          <p className="text-[13px] text-gray-600 mb-3">
            Run daily aggregation to populate charts and stats. This processes raw page views and match views into daily summaries.
          </p>
          <button
            onClick={runAggregation}
            disabled={aggregating}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {aggregating ? "Running..." : "Run Daily Aggregation"}
          </button>
          {aggregateResult && (
            <p className="text-[12px] text-gray-600 mt-3 bg-gray-50 p-3 rounded-xl">
              {aggregateResult}
            </p>
          )}
        </div>
      </div>

      {/* Connection info */}
      {/* Connect / social links */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Connect Links
        </h2>
        <p className="text-[13px] text-gray-600">
          Toggle each one on or off and set where it points. Only the ones turned
          on (with a link) show in the site menu under &ldquo;Connect with us.&rdquo;
        </p>
        <div className="space-y-4">
          {socials.map((s) => (
            <div key={s.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-800">{s.label}</span>
                <button
                  type="button"
                  onClick={() => updateSocial(s.id, { enabled: !s.enabled })}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${s.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                  aria-label={`Toggle ${s.label}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              <input
                type="url"
                value={s.url}
                onChange={(e) => updateSocial(s.id, { url: e.target.value })}
                placeholder={
                  s.id === "telegram" ? "https://t.me/yourchannel"
                  : s.id === "x" ? "https://x.com/yourhandle"
                  : s.id === "whatsapp" ? "https://wa.me/234XXXXXXXXXX"
                  : "https://..."
                }
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveSocials}
            disabled={savingSocials}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {savingSocials ? "Saving..." : "Save links"}
          </button>
          {socialsMsg && (
            <span className={`text-[12px] font-medium ${socialsMsg === "Saved." ? "text-emerald-600" : "text-red-500"}`}>
              {socialsMsg}
            </span>
          )}
        </div>
      </div>

      {/* VPN Download Config */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">VPN Download Page (/vpn)</h2>
          <button
            type="button"
            onClick={() => setVpn((v) => ({ ...v, enabled: !v.enabled }))}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${vpn.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${vpn.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <p className="text-[13px] text-gray-500">
          Paste the APK download link below (Google Drive, Telegram file link, etc.). The /vpn page will show a download button for users.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">APK Download URL *</label>
            <input
              type="url"
              value={vpn.downloadUrl}
              onChange={(e) => setVpn((v) => ({ ...v, downloadUrl: e.target.value }))}
              placeholder="https://drive.google.com/... or https://t.me/..."
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">VPN Name</label>
              <input
                type="text"
                value={vpn.name}
                onChange={(e) => setVpn((v) => ({ ...v, name: e.target.value }))}
                placeholder="Proton VPN"
                className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Recommended Server</label>
              <input
                type="text"
                value={vpn.recommendedServer}
                onChange={(e) => setVpn((v) => ({ ...v, recommendedServer: e.target.value }))}
                placeholder="Singapore"
                className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">File Size</label>
              <input
                type="text"
                value={vpn.fileSize}
                onChange={(e) => setVpn((v) => ({ ...v, fileSize: e.target.value }))}
                placeholder="52 MB"
                className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Version</label>
              <input
                type="text"
                value={vpn.version}
                onChange={(e) => setVpn((v) => ({ ...v, version: e.target.value }))}
                placeholder="Latest"
                className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Page Description</label>
            <textarea
              value={vpn.description}
              onChange={(e) => setVpn((v) => ({ ...v, description: e.target.value }))}
              rows={2}
              placeholder="Watch every match with no buffering..."
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveVpn}
            disabled={savingVpn}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {savingVpn ? "Saving..." : "Save VPN settings"}
          </button>
          {vpn.downloadUrl && (
            <a
              href="/vpn"
              target="_blank"
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
            >
              Preview page →
            </a>
          )}
          {vpnMsg && (
            <span className={`text-[12px] font-medium ${vpnMsg === "Saved." ? "text-emerald-600" : "text-red-500"}`}>
              {vpnMsg}
            </span>
          )}
        </div>
      </div>

      {/* Connection info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Connection Status
        </h2>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Database</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-600 font-medium">Cloudflare D1</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
