"use client";

import { SplitStat, type Split } from "@/components/partner/SplitStat";
import BreakdownList from "@/components/partner/BreakdownList";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface NamedSplit { name?: string; total: number; his: number }
interface TrendPt { date: string; total: number; his: number }
interface RosterRow { visitor_id: string; first_seen: string; last_seen: string; visit_count: number; device_type: string | null }
export interface VisitorsData {
  unique?: Split; pageViews?: Split; newToday?: Split; returning?: Split; totalVisitors?: Split;
  cameBack?: Split; oneTime?: Split; byDevice?: NamedSplit[]; trendUnique?: TrendPt[]; hisRoster?: RosterRow[];
}

function fmt(ts: string) { try { return new Date(ts).toLocaleString(); } catch { return ts; } }

export default function VisitorsPanel({ data, mine, solo }: { data: VisitorsData | null; mine?: boolean; solo?: boolean }) {
  const total = data?.totalVisitors?.total || 0;
  const cb = data?.cameBack?.total || 0;
  const rate = total ? Math.round((cb / total) * 1000) / 10 : 0;
  const roster = data?.hisRoster ?? [];
  const trend = (data?.trendUnique ?? []).map((p) => ({ date: p.date.slice(5), Total: p.total, Me: p.his }));
  const blue = mine ? "me" : "his";

  const Cell = ({ value, label, his }: { value: number; label: string; his: number }) => (
    <div>
      <p className="text-2xl font-black text-gray-900 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[10px] text-gray-400">
        {label}
        {!solo && <> · <span className="text-[#3cac3b] font-bold">{his.toLocaleString()} {blue}</span></>}
      </p>
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Overall · all time</p>
          <span className="text-[11px] font-bold text-emerald-600">{rate}% came back</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Cell value={total} label="total visitors" his={data?.totalVisitors?.his || 0} />
          <Cell value={cb} label="came back another day" his={data?.cameBack?.his || 0} />
          <Cell value={data?.oneTime?.total || 0} label="visited one day only" his={data?.oneTime?.his || 0} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SplitStat label="Unique Visitors" data={data?.unique} mine={mine} solo={solo} hint="distinct that day" />
        <SplitStat label="New Visitors" data={data?.newToday} mine={mine} solo={solo} hint="first time ever" />
        <SplitStat label="Returning" data={data?.returning} mine={mine} solo={solo} hint="seen before today" />
        <SplitStat label="Page Views" data={data?.pageViews} mine={mine} solo={solo} hint="incl. repeat pages" />
        <SplitStat label="Total Visitors" data={data?.totalVisitors} mine={mine} solo={solo} hint="all-time, ever joined" />
      </div>

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Visitors — last 30 days</h2>
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            {solo ? (
              <Line type="monotone" dataKey="Me" name="You" stroke="#3cac3b" strokeWidth={2} dot={false} />
            ) : (
              <>
                <Line type="monotone" dataKey="Total" stroke="#111827" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Me" stroke="#3cac3b" strokeWidth={2} dot={false} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <BreakdownList title="Devices (selected day)" solo={solo} rows={(data?.byDevice ?? []).map((d) => ({ label: d.name || "unknown", total: d.total, his: d.his }))} />
      </div>

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Latest visitors (who joined through {mine ? "you" : "them"})</h2>
      {roster.length === 0 ? (
        <p className="text-sm text-gray-400">No referred members yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[520px]">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-bold px-3 py-2">Member</th>
                <th className="text-left font-bold px-3 py-2">Joined</th>
                <th className="text-left font-bold px-3 py-2">Last seen</th>
                <th className="text-right font-bold px-3 py-2">Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.map((r) => (
                <tr key={r.visitor_id}>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[#3cac3b]">{r.visitor_id}…</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmt(r.first_seen)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmt(r.last_seen)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900">{r.visit_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
