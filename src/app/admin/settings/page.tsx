"use client";

import { useState, useEffect } from "react";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

export default function AdminSettingsPage() {
  const [aggregating, setAggregating] = useState(false);
  const [aggregateResult, setAggregateResult] = useState<string | null>(null);

  const [socials, setSocials] = useState<SocialLink[]>([]);
  const [savingSocials, setSavingSocials] = useState(false);
  const [socialsMsg, setSocialsMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/social-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSocials(Array.isArray(d.links) ? d.links : []))
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
