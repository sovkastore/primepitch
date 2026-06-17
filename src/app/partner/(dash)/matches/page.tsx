"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";

interface MatchRow {
  match_id: string; title: string; sport: string | null;
  views: number; uniqueTotal: number; uniqueHis: number; uniqueYours: number;
  peakTotal: number; peakHis: number; peakYours: number; lastViewed: string;
}

export default function PartnerMatches() {
  const { data, loading, error } = usePartnerData<{ matches: MatchRow[] }>("/api/partner/matches");
  const matches = data?.matches ?? [];
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Matches</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Every match people watched. <span className="text-blue-600 font-bold">Blue = your people</span>. Most recent first.
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-gray-400">No match data yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-3 py-2">Match</th>
                <th className="text-right font-bold px-3 py-2">Unique watchers (total / his / yours)</th>
                <th className="text-right font-bold px-3 py-2">Peak (total / his / yours)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matches.map((m) => (
                <tr key={m.match_id}>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-gray-800">{m.title}</span>
                    {m.sport && <span className="text-[10px] text-gray-400 ml-2 uppercase">{m.sport}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{m.uniqueTotal}</span>
                    <span className="text-blue-600 font-semibold ml-2">{m.uniqueHis}</span>
                    <span className="text-gray-400 ml-1.5">/ {m.uniqueYours}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-bold text-gray-900">{m.peakTotal}</span>
                    <span className="text-blue-600 font-semibold ml-2">{m.peakHis}</span>
                    <span className="text-gray-400 ml-1.5">/ {m.peakYours}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
