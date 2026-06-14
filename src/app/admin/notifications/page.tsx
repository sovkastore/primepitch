"use client";

import { useState, useEffect } from "react";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
  reshowHours: number;
};

const DEFAULTS: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
  reshowHours: 0,
};

const RESHOW_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Don't show again (until I change the message)" },
  { value: 1, label: "After 1 hour" },
  { value: 3, label: "After 3 hours" },
  { value: 6, label: "After 6 hours" },
  { value: 24, label: "After 24 hours" },
];

const VARIANT_LABELS: Record<Variant, string> = {
  info: "Info (blue)",
  success: "Success (green)",
  warning: "Attention (amber)",
};

const VARIANT_PREVIEW: Record<Variant, string> = {
  info: "bg-blue-600 text-white",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-black",
};

export default function NotificationsPage() {
  const [cfg, setCfg] = useState<Announcement>(DEFAULTS);
  const [dismissCount, setDismissCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/announcement", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCfg({ ...DEFAULTS, ...d });
        setDismissCount(Number(d?.dismissCount) || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(patch: Partial<Announcement>) {
    setCfg((p) => ({ ...p, ...patch }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.config) setCfg({ ...DEFAULTS, ...data.config });
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

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
        <p className="text-[13px] text-gray-600 mt-1">
          Show a message bar across the top of the site &mdash; a welcome note, an
          announcement, a nudge to subscribe, anything. Turn it off when you&rsquo;re
          done. Visitors can dismiss it; choose below how long before it returns for
          them.
        </p>
      </div>

      {/* On/off */}
      <div className={`rounded-2xl border p-5 space-y-3 ${cfg.enabled ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-gray-900">Show the banner</span>
            <p className="text-[13px] text-gray-600 mt-0.5">
              {cfg.enabled ? "The banner is LIVE on the site." : "The banner is hidden."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => update({ enabled: !cfg.enabled })}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${cfg.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
            aria-label="Toggle banner"
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${cfg.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Message + link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">Message</label>
          <textarea
            value={cfg.message}
            onChange={(e) => update({ message: e.target.value })}
            rows={3}
            maxLength={500}
            placeholder="e.g. Welcome! Add us to your home screen to get live goal alerts."
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Link (optional)</label>
            <input
              value={cfg.linkUrl}
              onChange={(e) => update({ linkUrl: e.target.value })}
              placeholder="/subscribe  or  https://…"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <p className="text-[11px] text-gray-500">A page on your site (start with /) or a full https link.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Link text</label>
            <input
              value={cfg.linkLabel}
              onChange={(e) => update({ linkLabel: e.target.value })}
              maxLength={60}
              placeholder="Learn more"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">Color</label>
          <select
            value={cfg.variant}
            onChange={(e) => update({ variant: e.target.value as Variant })}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
              <option key={v} value={v}>{VARIANT_LABELS[v]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-gray-800">Show again after dismiss</label>
          <select
            value={cfg.reshowHours}
            onChange={(e) => update({ reshowHours: Number(e.target.value) })}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {RESHOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">
            If a visitor closes the banner, this is how long before it comes back for
            them. &ldquo;Don&rsquo;t show again&rdquo; keeps it hidden until you change the message.
          </p>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-1.5">
        <span className="text-[13px] font-semibold text-gray-800">Preview</span>
        <div className={`rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 text-center ${VARIANT_PREVIEW[cfg.variant]}`}>
          <span>{cfg.message || "Your message will appear here"}</span>
          {cfg.linkUrl && cfg.linkLabel && (
            <span className="underline font-semibold">{cfg.linkLabel}</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-700 shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">
            Dismissed by {dismissCount} {dismissCount === 1 ? "person" : "people"}
          </p>
          <p className="text-[12px] text-gray-600">
            Unique devices that closed the current message. Resets when you change the message.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-[13px] text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
