"use client";

import { useEffect, useState } from "react";

// Shown only to a logged-in admin or partner: they get the VIP (no-ads)
// experience by default, and this lets them switch PrimePitch's ads back on
// to see what visitors see. Invisible to everyone else.
export default function StaffAdsToggle() {
  const [staff, setStaff] = useState<"admin" | "partner" | null>(null);
  const [showAds, setShowAds] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/vip/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setStaff(d?.staff || null); setShowAds(d?.staffAds === true); })
      .catch(() => {});
  }, []);

  if (!staff) return null;

  async function flip() {
    setBusy(true);
    try {
      const r = await fetch("/api/vip/staff-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showAds: !showAds }),
      });
      if (r.ok) window.location.reload(); // ad scripts load once per page — a reload applies it cleanly
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 mt-3">
      <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 ${showAds ? "border-gray-200 bg-gray-50" : "border-amber-300 bg-amber-50"}`}>
        <div className="min-w-0">
          <p className="text-[12px] font-black text-gray-900">
            {showAds ? "Ads ON — you see what visitors see" : "VIP mode — no ads for you"}
          </p>
          <p className="text-[11px] text-gray-500">
            {staff === "admin" ? "Admin" : "Partner"} perk. Only you see this switch.
          </p>
        </div>
        <button
          type="button"
          onClick={flip}
          disabled={busy}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-black ${showAds ? "bg-amber-500 text-white" : "bg-gray-900 text-white"} disabled:opacity-60`}
        >
          {busy ? "…" : showAds ? "Turn ads off" : "Turn ads on"}
        </button>
      </div>
    </div>
  );
}
