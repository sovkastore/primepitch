"use client";

import { useEffect, useState } from "react";

export default function AdminMaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/admin/maintenance", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setOn(d.on === true);
        setMessage(typeof d.message === "string" ? d.message : "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(nextOn: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: nextOn, message }),
      });
      if (!res.ok) throw new Error();
      setOn(nextOn);
      setStatus(
        nextOn
          ? "Maintenance is ON. Visitors now see the maintenance page (takes up to ~15s to apply everywhere)."
          : "Maintenance is OFF. The site is live again (takes up to ~15s to apply everywhere)."
      );
    } catch {
      setStatus("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (busy) return;
    if (!on) {
      const ok = window.confirm(
        "Turn ON maintenance? Every normal visitor will be blocked from the site and shown the maintenance page. You (admin) will still get through."
      );
      if (!ok) return;
      void save(true);
    } else {
      void save(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Maintenance</h1>

      {/* Status banner */}
      <div
        className={`rounded-2xl border p-4 ${
          on
            ? "bg-amber-50 border-amber-200"
            : "bg-emerald-50 border-emerald-200"
        }`}
      >
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : on ? (
          <p className="text-sm font-semibold text-amber-700">
            Maintenance is ON — visitors can’t access the site right now. Only you (admin) can get in.
          </p>
        ) : (
          <p className="text-sm font-semibold text-emerald-700">
            Site is live — visitors can access it normally.
          </p>
        )}
      </div>

      {/* The switch */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-gray-900">Maintenance mode</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Block the public and show a “We’ll be right back” page.
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={loading || busy}
            aria-pressed={on}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              on ? "bg-amber-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${
                on ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="space-y-2 pt-1">
          <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
            Message shown to visitors (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="We’re doing some quick maintenance and will be back shortly. Please check back in a little while."
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
          />
          <button
            type="button"
            onClick={() => save(on)}
            disabled={busy || loading}
            className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {busy ? "Saving…" : "Save message"}
          </button>
        </div>

        {status && (
          <p
            className={`text-[12px] font-medium ${
              status.includes("wrong") ? "text-red-500" : "text-emerald-600"
            }`}
          >
            {status}
          </p>
        )}
      </div>

      <p className="text-[12px] text-gray-500 leading-relaxed">
        Only the <span className="font-semibold">/admin</span> area and signed-in admins
        stay reachable while maintenance is on, so you can keep working and switch it
        back off here. Changes take up to ~15 seconds to apply across the site.
      </p>
    </div>
  );
}
