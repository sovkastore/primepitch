"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import { MeStat as SplitStat, type Split } from "@/components/partner/SplitStat";

interface PulseMatch {
  match_id: string; title: string; total: number; his: number; yours: number;
  peakTotal: number; peakHis: number; peakYours: number;
}
interface PulsePage { path: string; total: number; his: number; yours: number }
interface PulseData { onlineNow: Split; liveNow: Split; matches: PulseMatch[]; pages: PulsePage[] }

export default function PartnerPulse() {
  const { data, loading, error } = usePartnerData<PulseData>("/api/partner/pulse", 20000);
  const matches = data?.matches ?? [];
  const pages = data?.pages ?? [];
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Pulse</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Who is on the site right this moment. <span className="text-blue-600 font-bold">Blue = your people</span>. Refreshes automatically.
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <SplitStat label="Online now" data={data?.onlineNow} />
            <SplitStat label="Watching live now" data={data?.liveNow} />
          </div>

          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Live matches right now</h2>
          {matches.length === 0 ? (
            <p className="text-sm text-gray-400">No live matches at the moment.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Match</th>
                    <th className="text-right font-bold px-3 py-2">Watching now (total / me / others)</th>
                    <th className="text-right font-bold px-3 py-2">Peak (total / me / others)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matches.map((m) => (
                    <tr key={m.match_id}>
                      <td className="px-3 py-2.5 font-semibold text-gray-800">{m.title}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-bold text-gray-900">{m.total}</span>
                        <span className="text-blue-600 font-semibold ml-2">{m.his}</span>
                        <span className="text-gray-400 ml-1.5">/ {m.yours}</span>
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

          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Pages people are on now</h2>
          {pages.length === 0 ? (
            <p className="text-sm text-gray-400">Nobody online right now.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Page</th>
                    <th className="text-right font-bold px-3 py-2">Total / me / others</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pages.map((p) => (
                    <tr key={p.path}>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-gray-700 truncate max-w-[220px]">{p.path}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-bold text-gray-900">{p.total}</span>
                        <span className="text-blue-600 font-semibold ml-2">{p.his}</span>
                        <span className="text-gray-400 ml-1.5">/ {p.yours}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
