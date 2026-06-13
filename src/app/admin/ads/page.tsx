"use client";

import { useState, useEffect } from "react";

type Cap = "off" | "30m" | "1h" | "2h" | "24h";
type Format = { label: string; enabled: boolean; zone: string; src: string; cap: Cap };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
};

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: "1h" },
    vignette: { label: "Vignette Banner", enabled: false, zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: "1h" },
  },
};

export default function AdminAdsPage() {
  const [cfg, setCfg] = useState<AdsConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/ads-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AdsConfig) => {
        if (d && d.formats) setCfg({ ...d, formats: { ...DEFAULTS.formats, ...d.formats } });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateFormat(id: string, patch: Partial<Format>) {
    setCfg((prev) => ({
      ...prev,
      formats: { ...prev.formats, [id]: { ...prev.formats[id], ...patch } },
    }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/ads-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.config) setCfg(data.config);
      setMsg("Saved.");
    } catch {
      setMsg("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const formatIds = Object.keys(cfg.formats);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ads</h1>
        <p className="text-[13px] text-gray-600 mt-1">
          Control which ads run on the site. Everything is off by default. The
          master switch below is a hard kill-switch &mdash; when it is off, no ad
          code loads anywhere, no matter what the individual toggles say.
        </p>
      </div>

      {/* Master kill-switch */}
      <div className={`rounded-2xl border p-5 space-y-3 ${cfg.master ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-gray-900">Master ads switch</span>
            <p className="text-[13px] text-gray-600 mt-0.5">
              {cfg.master ? "Ads are ALLOWED to run (subject to the toggles below)." : "All ads are OFF. Nothing loads."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCfg((p) => ({ ...p, master: !p.master }))}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${cfg.master ? "bg-emerald-500" : "bg-gray-300"}`}
            aria-label="Toggle master ads switch"
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${cfg.master ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Domain control */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
        <span className="text-sm font-bold text-gray-900">Where ads run</span>
        <p className="text-[13px] text-gray-600">
          The same site is served on more than one address. Choose where ads are allowed.
        </p>
        <select
          value={cfg.domains}
          onChange={(e) => setCfg((p) => ({ ...p, domains: e.target.value as AdsConfig["domains"] }))}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">All addresses</option>
          <option value="workers_dev">Only the .workers.dev address</option>
          <option value="xellnetwork">Only xellnetwork.xyz</option>
        </select>
      </div>

      {/* Per-format cards */}
      {formatIds.map((id) => {
        const f = cfg.formats[id];
        return (
          <div key={id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-gray-900">{f.label}</span>
                <p className="text-[13px] text-gray-600 mt-0.5">
                  Dismissible banner-style ad with a close button.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateFormat(id, { enabled: !f.enabled })}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${f.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                aria-label={`Toggle ${f.label}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${f.enabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">Zone ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={f.zone}
                onChange={(e) => updateFormat(id, { zone: e.target.value })}
                placeholder="e.g. 11143361"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">Script URL</label>
              <input
                type="text"
                value={f.src}
                onChange={(e) => updateFormat(id, { src: e.target.value })}
                placeholder="https://nap5k.com/tag.min.js"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">How often per visitor</label>
              <select
                value={f.cap}
                onChange={(e) => updateFormat(id, { cap: e.target.value as Cap })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="off">No limit</option>
                <option value="30m">Every 30 minutes</option>
                <option value="1h">Every hour</option>
                <option value="2h">Every 2 hours</option>
                <option value="24h">Once a day</option>
              </select>
              <p className="text-[12px] text-gray-500">
                The limit is per device (saved in the browser), so it is a best-effort cap, not exact.
              </p>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-[13px] text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
