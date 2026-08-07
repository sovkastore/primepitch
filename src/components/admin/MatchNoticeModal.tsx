"use client";

import { useState } from "react";

const PRESETS = [
  "Recommend: Use SD under Echo stream!",
  "Prime stream is best for this match (HD & stable)",
  "Switch to SD if experiencing buffering",
  "Server 2 has English commentary",
  "If player doesn't start, tap refresh ↻ or switch to Server 2",
];

export default function MatchNoticeModal({
  matchId,
  matchTitle,
  matchData,
  currentNotice = "",
  onClose,
  onSaved,
}: {
  matchId: string;
  matchTitle: string;
  matchData?: unknown;
  currentNotice?: string;
  onClose: () => void;
  onSaved: (notice: string | null) => void;
}) {
  const [notice, setNotice] = useState(currentNotice);
  const [saving, setSaving] = useState(false);

  async function handleSave(newNotice: string | null) {
    setSaving(true);
    try {
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          match_data: matchData,
          custom_notice: newNotice ? newNotice.trim() : null,
        }),
      });
      onSaved(newNotice ? newNotice.trim() : null);
      onClose();
    } catch {
      alert("Failed to save notice. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-left relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              <h3 className="text-base font-bold text-gray-900">
                Match Notice / Recommendation
              </h3>
            </div>
            <p className="text-[12px] text-gray-500 mt-1 font-medium line-clamp-1">
              {matchTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-[12px] text-gray-600 leading-relaxed bg-amber-50/80 border border-amber-200/70 rounded-xl p-3">
          💡 This message appears as a <strong>prominent banner on this specific match&apos;s watch page</strong> and in the stream picker. Leave blank or clear to remove it.
        </p>

        {/* Text Area */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
            Notice Text
          </label>
          <textarea
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder="e.g. Recommend: Use SD under Echo stream!"
            rows={3}
            autoFocus
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Quick 1-Click Templates
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setNotice(p)}
                className="text-[11px] font-medium text-gray-600 hover:text-emerald-700 bg-gray-100 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 rounded-lg px-2.5 py-1 text-left transition-all"
              >
                + {p}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          {currentNotice ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(null)}
              className="text-[12px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              Clear Notice
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-[12px] font-bold text-gray-500 hover:text-gray-800 px-3.5 py-2 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(notice)}
              className="text-[12px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-5 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Notice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
