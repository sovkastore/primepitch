"use client";

import { useEffect, useState } from "react";

interface FallbackStream {
  source: string;
  title: string;
  embedUrl: string;
  server: string;
}

// Accept either a bare URL or a full <iframe ...> embed snippet: pull the src
// out of a tag, otherwise use the trimmed input as-is. So the admin can't break
// the override by pasting the whole embed code instead of just the URL.
function extractEmbedUrl(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/src\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : trimmed).trim();
}

// Shared modal: auto-searches the fallback providers for a match, lets the admin pick
// streams or paste a URL, and persists them as overrides (with match_data so the match
// can surface on the site even when streamed.pk omits it). Used by the Live Monitor and
// the Match Manager.
export default function StreamOverrideModal({
  matchId,
  matchTitle,
  sport = "football",
  matchData,
  appendMode = false,
  onClose,
  onApplied,
}: {
  matchId: string;
  matchTitle: string;
  sport?: string;
  matchData?: unknown;
  appendMode?: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [searching, setSearching] = useState(true);
  const [results, setResults] = useState<FallbackStream[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setSearching(true);
    fetch(`/api/admin/fallback-search?title=${encodeURIComponent(matchTitle)}&sport=${encodeURIComponent(sport)}`)
      .then((r) => r.json())
      .then((d) => { if (active) setResults(d.streams || []); })
      .catch(() => { if (active) setResults([]); })
      .finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [matchTitle, sport]);

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/admin/stream-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, match_title: matchTitle, match_data: matchData, replace_original: replaceOriginal, append: appendMode, ...body }),
      });
      onApplied();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function applySelected() {
    const streams = Array.from(selected).map((i) => ({
      embed_url: results[i].embedUrl,
      source: results[i].source,
      server_label: results[i].server,
    }));
    if (streams.length === 0) return;
    await post({ streams });
  }

  async function applyManual() {
    const url = extractEmbedUrl(manualUrl);
    if (!url) return;
    await post({ embed_url: url, source: "manual", server_label: "Manual" });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-gray-900">{appendMode ? "Add more streams" : "Add stream"}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-[12px] text-gray-500 mt-1 truncate">{matchTitle}</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Replace toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-[12px] font-bold text-gray-700">Replace original streams</p>
              <p className="text-[10px] text-gray-400">
                {replaceOriginal ? "Originals will be hidden from users" : "Fallbacks show alongside originals"}
              </p>
            </div>
            <button
              onClick={() => setReplaceOriginal(!replaceOriginal)}
              className={`relative w-10 rounded-full transition-colors ${replaceOriginal ? "bg-emerald-500" : "bg-gray-300"}`}
              style={{ height: 20 }}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${replaceOriginal ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Manual URL */}
          <div>
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Paste Embed URL or &lt;iframe&gt; code</label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://...  or  <iframe src=...>"
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                onClick={applyManual}
                disabled={!manualUrl || saving}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Fallback results */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Auto-Search Results</label>
              {selected.size > 0 && (
                <button
                  onClick={applySelected}
                  disabled={saving}
                  className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Add {selected.size} Selected
                </button>
              )}
            </div>

            {searching ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-400 ml-3">Searching fallback APIs...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-1.5 mt-2">
                {results.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => toggleSelect(i)}
                    className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border transition-colors text-left ${
                      selected.has(i) ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      selected.has(i) ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                    }`}>
                      {selected.has(i) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-[10px] text-gray-400">{s.server} &middot; {s.source}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-gray-400 text-center py-6">No matching streams found. Try pasting a URL manually.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
