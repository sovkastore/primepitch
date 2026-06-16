"use client";

import { useState, useEffect } from "react";

type Delay = "0" | "15s" | "30s" | "1m" | "2m" | "3m" | "4m" | "5m" | "10m";
type Unit = "off" | "minutes" | "hours";
type FmtPlacement = "all" | "watch" | "home";
type Format = {
  label: string;
  enabled: boolean;
  network: string;
  group: string;
  placement: FmtPlacement;
  zone: string;
  src: string;
  cap: number;
  delay: Delay;
};
type Trigger = "visit" | "interval" | "match" | "server";
type Placement = "watch" | "home" | "both";
type Mode = "silent" | "gate";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  placement: Placement;
  cap: number;
  skipAfter: number;
  noFillTimeout: number;
  mode: Mode;
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
    inpage_push: { label: "In-Page Push", enabled: false, network: "Monetag", group: "notification", placement: "all", zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: 60, delay: "0" },
    vignette: { label: "Vignette Banner", enabled: false, network: "Monetag", group: "interstitial", placement: "all", zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: 60, delay: "0" },
    social_bar: { label: "Social Bar", enabled: false, network: "Adsterra", group: "notification", placement: "all", zone: "", src: "", cap: 60, delay: "0" },
    popunder: { label: "Popunder", enabled: false, network: "Adsterra", group: "popunder", placement: "watch", zone: "", src: "", cap: 0, delay: "0" },
    monetag_popunder: { label: "Popunder", enabled: false, network: "Monetag", group: "popunder", placement: "home", zone: "11157914", src: "https://al5sm.com/tag.min.js", cap: 0, delay: "0" },
  },
  preroll: { enabled: false, vastTag: "", trigger: "interval", placement: "watch", cap: 5, skipAfter: 5, noFillTimeout: 3, mode: "silent" },
};

const TRIGGER_LABELS: Record<Trigger, string> = {
  visit: "Once per visit",
  interval: "Every X minutes",
  match: "Every match open",
  server: "Every server switch",
};

const PLACEMENT_LABELS: Record<Placement, string> = {
  watch: "Watch page only",
  home: "Home page only",
  both: "Home + Watch pages",
};

const MODE_LABELS: Record<Mode, string> = {
  silent: "Silent — only show a screen if a real ad plays (recommended)",
  gate: "Gate — show a black loading screen while checking for an ad",
};

// Ad categories — purely for organizing the page into sections.
const GROUP_LABELS: Record<string, string> = {
  notification: "Notification ads (in-page push / social bar)",
  interstitial: "Interstitial / Vignette",
  popunder: "Popunder",
  native: "Native banner",
  standalone: "Other",
};
const GROUP_OPTIONS = Object.keys(GROUP_LABELS);

const FMT_PLACEMENT_LABELS: Record<FmtPlacement, string> = {
  all: "All pages",
  watch: "Watch page only (fires on the play tap)",
  home: "Home page only",
};

// Quick-pick frequencies (minutes). 0 = no limit.
const CAP_PRESETS: { label: string; m: number }[] = [
  { label: "No limit", m: 0 },
  { label: "1m", m: 1 },
  { label: "2m", m: 2 },
  { label: "5m", m: 5 },
  { label: "10m", m: 10 },
  { label: "15m", m: 15 },
  { label: "30m", m: 30 },
  { label: "1h", m: 60 },
  { label: "2h", m: 120 },
  { label: "6h", m: 360 },
  { label: "12h", m: 720 },
  { label: "24h", m: 1440 },
];

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
  // Which ad rows are expanded. Multiple can be open at once.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggleOpen = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    fetch("/api/admin/ads-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AdsConfig) => {
        if (d && d.formats) {
          const formats: Record<string, Format> = { ...DEFAULTS.formats, ...d.formats };
          const u: Record<string, Unit> = {};
          for (const [id, f] of Object.entries(formats)) {
            const seed = DEFAULTS.formats[id];
            const m = toMinutes(f.cap);
            formats[id] = {
              label: f.label ?? seed?.label ?? id,
              enabled: !!f.enabled,
              network: f.network ?? seed?.network ?? "",
              group: f.group ?? seed?.group ?? "standalone",
              placement: (f.placement ?? seed?.placement ?? "all") as FmtPlacement,
              zone: f.zone ?? seed?.zone ?? "",
              src: f.src ?? seed?.src ?? "",
              cap: m,
              delay: (f.delay ?? seed?.delay ?? "0") as Delay,
            };
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

  // Toggle an ad on/off. Independent — enabling one no longer affects any other.
  function setFormatEnabled(id: string, enabled: boolean) {
    updateFormat(id, { enabled });
  }

  // Master switch for a whole network category: turns every ad in that network
  // on or off at once.
  function setNetworkEnabled(net: string, enabled: boolean) {
    setCfg((prev) => {
      const formats = { ...prev.formats };
      for (const id of Object.keys(formats)) {
        if ((formats[id].network?.trim() || "Other") === net) {
          formats[id] = { ...formats[id], enabled };
        }
      }
      return { ...prev, formats };
    });
  }

  function addFormat() {
    const id = `ad_${Date.now().toString(36)}`;
    setCfg((prev) => ({
      ...prev,
      formats: {
        ...prev.formats,
        [id]: {
          label: "New ad",
          enabled: false,
          network: "",
          group: "standalone",
          placement: "all",
          zone: "",
          src: "",
          cap: 0,
          delay: "0",
        },
      },
    }));
    setUnits((prev) => ({ ...prev, [id]: "off" }));
    setOpen((prev) => ({ ...prev, [id]: true }));
  }

  function deleteFormat(id: string) {
    setCfg((prev) => {
      const formats = { ...prev.formats };
      delete formats[id];
      return { ...prev, formats };
    });
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

  // Set the cap directly in minutes (used by the quick-pick presets).
  function setCap(id: string, mins: number) {
    const m = Math.min(Math.max(0, Math.floor(mins)), MAX_CAP_MIN);
    setUnits((prev) => ({
      ...prev,
      [id]: m === 0 ? "off" : m % 60 === 0 ? "hours" : "minutes",
    }));
    updateFormat(id, { cap: m });
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

  // A tappable row header: title + status pill + isolated toggle + chevron.
  // Tapping the row expands/collapses; the toggle (stopPropagation) flips
  // on/off WITHOUT expanding. Used for every ad so the page stays compact.
  const headerRow = (
    keyId: string,
    title: string,
    subtitle: string,
    enabled: boolean,
    onToggle: () => void,
    network?: string
  ) => (
    <button
      type="button"
      onClick={() => toggleOpen(keyId)}
      className="w-full flex items-center gap-3 p-4 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900 truncate">{title}</span>
          {network ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              {network}
            </span>
          ) : null}
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="text-[12px] text-gray-500 mt-0.5 truncate">{subtitle}</p>
      </div>
      <span
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${title}`}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }
        }}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
          enabled ? "bg-emerald-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
            enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <svg
        className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
          open[keyId] ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const formatIds = Object.keys(cfg.formats);
  const grouped: Record<string, string[]> = {};
  for (const id of formatIds) {
    const net = cfg.formats[id].network?.trim() || "Other";
    if (!grouped[net]) grouped[net] = [];
    grouped[net].push(id);
  }
  const NETWORK_ORDER = ["Monetag", "Adsterra"];
  const orderedGroups = [
    ...NETWORK_ORDER.filter((n) => grouped[n]?.length),
    ...Object.keys(grouped).filter((n) => !NETWORK_ORDER.includes(n)).sort(),
  ];

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

      {/* Ads grouped by network, each with a master switch for the whole group */}
      {orderedGroups.map((net) => {
        const ids = formatIds.filter(
          (id) => (cfg.formats[id].network?.trim() || "Other") === net
        );
        const anyOn = ids.some((id) => cfg.formats[id].enabled);
        return (
        <div key={net} className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-gray-400">
              {net} <span className="normal-case text-gray-300">· {anyOn ? "on" : "off"}</span>
            </h2>
            <button
              type="button"
              onClick={() => setNetworkEnabled(net, !anyOn)}
              aria-label={`Toggle all ${net} ads`}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${anyOn ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${anyOn ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          {ids.map((id) => {
        const f = cfg.formats[id];
        const sub = f.src ? "Tag added" : "No tag yet";
        return (
          <div
            key={id}
            className={`rounded-2xl border overflow-hidden ${
              f.enabled ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 bg-white"
            }`}
          >
            {headerRow(
              id,
              f.label,
              sub,
              f.enabled,
              () => setFormatEnabled(id, !f.enabled),
              f.network
            )}
            {open[id] && (
              <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Ad name</label>
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => updateFormat(id, { label: e.target.value })}
                      placeholder="e.g. Popunder"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Network</label>
                    <input
                      type="text"
                      value={f.network}
                      onChange={(e) => updateFormat(id, { network: e.target.value })}
                      placeholder="Monetag / Adsterra"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-800">Show on</label>
                  <select
                    value={f.placement}
                    onChange={(e) => updateFormat(id, { placement: e.target.value as FmtPlacement })}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    {(Object.keys(FMT_PLACEMENT_LABELS) as FmtPlacement[]).map((p) => (
                      <option key={p} value={p}>{FMT_PLACEMENT_LABELS[p]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-800">Zone ID <span className="font-normal text-gray-400">(Monetag only — leave blank for Adsterra)</span></label>
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
                <option value="15s">After 15 seconds</option>
                <option value="30s">After 30 seconds</option>
                <option value="1m">After 1 minute</option>
                <option value="2m">After 2 minutes</option>
                <option value="3m">After 3 minutes</option>
                <option value="4m">After 4 minutes</option>
                <option value="5m">After 5 minutes</option>
              </select>
              <p className="text-[12px] text-gray-500">
                How long a visitor must be on the site before this ad first appears.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">How often per visitor</label>
              <div className="flex flex-wrap gap-1.5">
                {CAP_PRESETS.map((p) => {
                  const active = (f.cap || 0) === p.m;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setCap(id, p.m)}
                      className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
                        active
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-emerald-400"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
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

                {!["inpage_push", "vignette", "social_bar", "popunder"].includes(id) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => deleteFormat(id)}
                      className="text-[13px] font-semibold text-red-600 hover:text-red-700"
                    >
                      Delete this ad
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
          })}
        </div>
        );
      })}

      <button
        type="button"
        onClick={addFormat}
        className="w-full rounded-2xl border-2 border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
      >
        ＋ Add ad
      </button>

      {/* ── Pre-roll Video (VAST) ───────────────────────── */}
      <div className={`rounded-2xl border overflow-hidden ${cfg.preroll.enabled ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
        {headerRow(
          "preroll",
          "Pre-roll Video",
          "Short video ad before the stream (VAST).",
          cfg.preroll.enabled,
          () => updatePreroll({ enabled: !cfg.preroll.enabled })
        )}
        {open["preroll"] && (
          <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
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
          <label className="text-[13px] font-semibold text-gray-800">Where to show it</label>
          <select
            value={cfg.preroll.placement}
            onChange={(e) => updatePreroll({ placement: e.target.value as Placement })}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {(Object.keys(PLACEMENT_LABELS) as Placement[]).map((pl) => (
              <option key={pl} value={pl}>{PLACEMENT_LABELS[pl]}</option>
            ))}
          </select>
          <p className="text-[12px] text-gray-500">
            Watch page = before a live stream. Home page = a full-screen video when a visitor lands on the homepage.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">How it appears</label>
          <select
            value={cfg.preroll.mode}
            onChange={(e) => updatePreroll({ mode: e.target.value as Mode })}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
          <p className="text-[12px] text-gray-500">
            Silent: the page/stream loads normally and a screen only appears if an ad actually plays — no black flash on no-fill. Gate: viewers see a brief black loading screen first, then the ad (or the page if no ad).
          </p>
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
        )}
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
