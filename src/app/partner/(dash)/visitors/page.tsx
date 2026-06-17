"use client";

import { useMemo, useState } from "react";
import { usePartnerData } from "@/components/partner/usePartnerData";
import { MeStat as SplitStat, type Split } from "@/components/partner/SplitStat";

interface RosterRow {
  visitor_id: string; first_seen: string; last_seen: string;
  visit_count: number; device_type: string | null;
}
interface VData {
  date: string; unique: Split; newToday: Split; returning: Split;
  totalVisitors: Split; hisRoster: RosterRow[];
}

function fmt(ts: string): string {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function PartnerVisitors() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const url = useMemo(() => `/api/partner/visitors?date=${date}`, [date]);
  const { data, loading, error } = usePartnerData<VData>(url);
  const roster = data?.hisRoster ?? [];
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Visitors</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        People for a day. <span className="text-blue-600 font-bold">Blue = your people</span>. The roster lists your referred members.
      </p>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => setDate(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] mb-5"
      />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SplitStat label="Unique that day" data={data?.unique} />
            <SplitStat label="Joined that day" data={data?.newToday} />
            <SplitStat label="Returning" data={data?.returning} />
            <SplitStat label="Total members (all time)" data={data?.totalVisitors} />
          </div>

          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Your referred members (latest 50)</h2>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-400">No referred members yet — they appear here once people join through your link.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-[13px] min-w-[520px]">
                <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Member</th>
                    <th className="text-left font-bold px-3 py-2">Joined</th>
                    <th className="text-left font-bold px-3 py-2">Last seen</th>
                    <th className="text-right font-bold px-3 py-2">Visits</th>
                    <th className="text-left font-bold px-3 py-2">Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roster.map((r) => (
                    <tr key={r.visitor_id}>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-blue-600">{r.visitor_id}…</td>
                      <td className="px-3 py-2.5 text-gray-600">{fmt(r.first_seen)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{fmt(r.last_seen)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900">{r.visit_count}</td>
                      <td className="px-3 py-2.5 text-gray-500 capitalize">{r.device_type || "—"}</td>
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
