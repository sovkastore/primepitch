"use client";

import { useEffect, useState } from "react";

interface Row {
  league_id: number;
  label: string;
  enabled: boolean;
  display_order: number;
  has_table: boolean;
  default_tab: "auto" | "results" | "fixtures" | "table";
}

const TAB_OPTIONS: Row["default_tab"][] = ["auto", "results", "fixtures", "table"];

export default function AdminLeaguesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/leagues", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.leagues) ? d.leagues : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function edit(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.league_id === id ? { ...r, ...patch } : r)));
    setSavedId(null);
  }

  async function save(row: Row) {
    setSavingId(row.league_id);
    setSavedId(null);
    try {
      const res = await fetch("/api/admin/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error();
      setSavedId(row.league_id);
    } catch {
      alert("Save failed — please try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Leagues</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          Controls the football sub-nav and each competition page. Turn a cup on here once its data is populated.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.league_id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <input
                value={r.label}
                onChange={(e) => edit(r.league_id, { label: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => edit(r.league_id, { enabled: !r.enabled })}
                aria-pressed={r.enabled}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                  r.enabled ? "bg-emerald-500" : "bg-gray-300"
                }`}
                title={r.enabled ? "Enabled (shown in nav)" : "Disabled"}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${
                    r.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Order</span>
                <input
                  type="number"
                  value={r.display_order}
                  onChange={(e) => edit(r.league_id, { display_order: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>

              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Default tab</span>
                <select
                  value={r.default_tab}
                  onChange={(e) => edit(r.league_id, { default_tab: e.target.value as Row["default_tab"] })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {TAB_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => edit(r.league_id, { has_table: !r.has_table })}
                className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors ${
                  r.has_table
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                {r.has_table ? "Has table ✓" : "No table"}
              </button>

              <button
                type="button"
                onClick={() => save(r)}
                disabled={savingId === r.league_id}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
              >
                {savingId === r.league_id ? "Saving…" : savedId === r.league_id ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
