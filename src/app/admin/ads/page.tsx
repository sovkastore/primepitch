"use client";

import { useState, useEffect } from "react";

type Delay = "0" | "1m" | "2m" | "3m" | "5m" | "10m";
type Unit = "off" | "minutes" | "hours";
type Format = { label: string; enabled: boolean; zone: string; src: string; cap: number; delay: Delay };
type Trigger = "visit" | "interval" | "match" | "server";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  cap: number;
  skipAfter: number;
  noFillTimeout: number;
};
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
  preroll: Preroll;
};

const MAX_CAP_MIN = 10080; // 7 days

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: 60, delay: "0" },
    vignette: { label: "Vignette Banner", enabled: false, zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: 60, delay: "0" },
  },
  preroll: { enabled: false, vastTag: "", trigger: "interval", cap: 5, skipAfter: 5, noFillTimeout: 3 },
};

const TRIGGER_LABELS: Record<Trigger, string> = {
  visit: "Once per visit",
  interval: "Every X minutes",
  match: "Every match open",
  server: "Every server switch",
};

// Legacy string caps -> minutes (for configs saved before numeric caps).
function toMinutes(v: unknown): number {
  const legacy: Record<string, number> = { off: 0, "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };
  const n = typeof v === "string" && v in legacy ? legacy[v] : Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CAP_MIN);
}

export default function AdminAdsPage() {
  const [cfg, setCfg] = useState<AdsConfig>(DEFAULTS);
  const [units, setUnits] = useState<Record<string, Unit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/ads-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AdsConfig) => {
        if (d && d.formats) {
          const formats: Record<string, Format> = { ...DEFAULTS.formats, ...d.formats };
          const u: Record<string, Unit> = {};
          for (const [id, f] of Object.entries(formats)) {
            const m = toMinutes(f.cap);
            formats[id] = { ...f, cap: m };
            u[id] = m === 0 ? "off" : m % 60 === 0 ? "hours" : "minutes";
          }
          setCfg({ ...d, formats, preroll: { ...DEFAULTS.preroll, ...(d.preroll ?? {}) } });
          setUnits(u);
        }
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

  function updatePreroll(patch: Partial<Preroll>) {
    setCfg((prev) => ({ ...prev, preroll: { ...prev.preroll, ...patch } }));
  }

  // Change the unit (No limit / Minutes / Hours), keeping a sensible value.
  function changeUnit(id: string, unit: Unit) {
    setUnits((prev) => ({ ...prev, [id]: unit }));
    const cur = cfg.formats[id]?.cap || 0;
    if (unit === "off") updateFormat(id, { cap: 0 });
    else if (unit === "hours") updateFormat(id, { cap: (cur === 0 ? 1 : Math.max(1, Math.round(cur / 60))) * 60 });
    else updateFormat(id, { cap: cur === 0 ? 30 : cur }); // minutes
  }

  // Change the typed number, interpreted in the current unit.
  function changeValue(id: string, raw: string) {
    const unit = units[id] ?? "minutes";
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) n = 1;
    const mins = Math.min(unit === "hours" ? n * 60 : n, MAX_CAP_MIN);
    updateFormat(id, { cap: mins });
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
              <label className="text-[13px] font-semibold text-gray-800">Delay before first show</label>
              <select
                value={f.delay}
                onChange={(e) => updateFormat(id, { delay: e.target.value as Delay })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="0">No delay (show right away)</option>
                <option value="1m">After 1 minute</option>
                <option value="2m">After 2 minutes</option>
                <option value="3m">After 3 minutes</option>
                <option value="5m">After 5 minutes</option>
                <option value="10m">After 10 minutes</option>
              </select>
              <p className="text-[12px] text-gray-500">
                How long a visitor must be on the site before this ad first appears.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">How often per visitor</label>
              <div className="flex gap-2">
                {(units[id] ?? "off") !== "off" && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={(units[id] === "hours" ? Math.max(1, Math.round((f.cap || 0) / 60)) : (f.cap || 0)) || ""}
                    onChange={(e) => changeValue(id, e.target.value)}
                    className="w-24 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                )}
                <select
                  value={units[id] ?? "off"}
                  onChange={(e) => changeUnit(id, e.target.value as Unit)}
                  className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="off">No limit</option>
                  <option value="minutes">Every … minutes</option>
                  <option value="hours">Every … hours</option>
                </select>
              </div>
              <p className="text-[12px] text-gray-500">
                {(units[id] ?? "off") === "off"
                  ? "Shows as often as the network allows."
                  : `Shows at most once every ${f.cap || 0} minute${(f.cap || 0) === 1 ? "" : "s"} per device.`}
                {" "}Saved in the browser, so it is a best-effort cap, not exact.
              </p>
            </div>
          </div>
        );
      })}

      {/* ── Pre-roll Video (VAST) ───────────────────────── */}
      <div className={`rounded-2xl border p-5 space-y-4 ${cfg.preroll.enabled ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">Pre-roll Video</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Plays a short video ad before the stream on the watch page. If no ad is available, the stream shows immediately.
            </p>
          </div>
          <button
            onClick={() => updatePreroll({ enabled: !cfg.preroll.enabled })}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${cfg.preroll.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
            aria-label="Toggle pre-roll"
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${cfg.preroll.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">VAST tag URL</label>
          <input
            type="text"
            value={cfg.preroll.vastTag}
            onChange={(e) => updatePreroll({ vastTag: e.target.value })}
            placeholder="https://…"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <p className="text-[12px] text-gray-500">Paste the VAST link from your ad network. Must start with https://</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">When to show it</label>
          <select
            value={cfg.preroll.trigger}
            onChange={(e) => updatePreroll({ trigger: e.target.value as Trigger })}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {(Object.keys(TRIGGER_LABELS) as Trigger[]).map((t) => (
              <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {cfg.preroll.trigger === "interval" && (
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Minutes between plays</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={cfg.preroll.cap || ""}
              onChange={(e) => {
                let n = Math.floor(Number(e.target.value));
                if (!Number.isFinite(n) || n < 1) n = 1;
                updatePreroll({ cap: Math.min(n, MAX_CAP_MIN) });
              }}
              className="w-32 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <p className="text-[12px] text-gray-500">A device won’t see another pre-roll until this many minutes pass.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Skip after (sec)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={cfg.preroll.skipAfter}
              onChange={(e) => updatePreroll({ skipAfter: Math.max(0, Math.min(60, Math.floor(Number(e.target.value)) || 0)) })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">No-ad wait (sec)</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={15}
              value={cfg.preroll.noFillTimeout}
              onChange={(e) => updatePreroll({ noFillTimeout: Math.max(1, Math.min(15, Math.floor(Number(e.target.value)) || 1)) })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </div>
        <p className="text-[12px] text-gray-500">
          “Skip after” is best-effort — the ad’s own skip timer can override it. “No-ad wait” is how long to wait for an ad before giving up and showing the stream.
        </p>
      </div>

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
