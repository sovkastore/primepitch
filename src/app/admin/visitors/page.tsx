"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import ChartWrapper from "@/components/admin/ChartWrapper";
import MetricCard from "@/components/admin/MetricCard";
import { useIsMobile } from "@/lib/use-is-mobile";

interface RosterRow {
  visitor_id: string; first_seen: string; last_seen: string;
  visit_count: number; device_type: string | null; referrer: string | null;
}
interface VisitorData {
  date: string;
  unique: number;
  new: number | null;
  returning: number | null;
  pageviews: number;
  totalVisitors: number | null;
  byDevice: Record<string, number>;
  byHour: { hour: number; views: number; visitors: number }[];
  trend: { date: string; unique: number; new: number }[];
  roster: RosterRow[];
  overall: { total: number; returning: number; oneTime: number; returningRate: number } | null;
}

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#10b981", desktop: "#6366f1", tablet: "#f59e0b", unknown: "#9ca3af",
};

const utcDate = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const host = (u: string | null) => {
  if (!u) return "Direct";
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
};
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function VisitorsPage() {
  const today = utcDate(0);
  const yesterday = utcDate(1);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/visitors?date=${date}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  const deviceData = data
    ? Object.entries(data.byDevice).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visitors</h1>
          <p className="text-[12px] text-gray-500">Everyone who has visited the site — separate from match views.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
            <button onClick={() => setDate(today)} className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors ${date === today ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Today</button>
            <button onClick={() => setDate(yesterday)} className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors ${date === yesterday ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>Yesterday</button>
          </div>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {data.overall && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-extrabold text-gray-900 tracking-wider uppercase">Overall · all time</h3>
                <span className="text-[11px] font-bold text-emerald-600">{data.overall.returningRate}% return</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-2xl font-black text-gray-900 tabular-nums">{data.overall.total}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-0.5">total visitors</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-amber-600 tabular-nums">{data.overall.returning}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-0.5">returning (came back)</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-blue-500 tabular-nums">{data.overall.oneTime}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-0.5">one-time only</p>
                </div>
              </div>
              {/* Returning-rate bar */}
              <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden flex">
                <div className="h-full bg-amber-400" style={{ width: `${data.overall.returningRate}%` }} />
                <div className="h-full bg-blue-300" style={{ width: `${100 - data.overall.returningRate}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <MetricCard title="Unique Visitors" value={data.unique} subtitle={`${data.pageviews} page views`} color="emerald" />
            <MetricCard title="New Visitors" value={data.new ?? "—"} subtitle="first time ever" color="blue" />
            <MetricCard title="Returning" value={data.returning ?? "—"} subtitle="seen before today" color="amber" />
            <MetricCard title="Page Views" value={data.pageviews} subtitle="incl. repeat pages" color="red" />
            <MetricCard title="Total Visitors" value={data.totalVisitors ?? "—"} subtitle="all-time, ever joined" color="emerald" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <ChartWrapper title="Visitors — last 30 days" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtDay} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip labelFormatter={(label) => fmtDay(String(label))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="unique" name="Unique" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="new" name="New" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartWrapper>

            <ChartWrapper title="Devices (selected day)">
              {deviceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {deviceData.map((d) => (
                        <Cell key={d.name} fill={DEVICE_COLORS[d.name] || "#9ca3af"} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-16">No visits this day</p>
              )}
            </ChartWrapper>
          </div>

          <ChartWrapper title="Activity by hour (UTC)">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.byHour}>
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}`} interval={isMobile ? 3 : 1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                <Tooltip labelFormatter={(h) => `${h}:00 UTC`} />
                <Bar dataKey="visitors" name="Unique visitors" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>

          <ChartWrapper title="Latest Visitors (who joined)">
            {data.roster.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-100">
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Joined</th>
                      <th className="py-2 pr-3 font-semibold hidden sm:table-cell">Last seen</th>
                      <th className="py-2 pr-3 font-semibold hidden md:table-cell">Device</th>
                      <th className="py-2 pr-3 font-semibold hidden md:table-cell">Came from</th>
                      <th className="py-2 pr-3 font-semibold text-right">Page views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roster.map((r) => {
                      const isNew = r.first_seen.slice(0, 10) === data.date;
                      return (
                        <tr key={r.visitor_id} className="border-b border-gray-50">
                          <td className="py-2 pr-3">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isNew ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                              {isNew ? "NEW" : "RETURNING"}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-gray-700">{ago(r.first_seen)}</td>
                          <td className="py-2 pr-3 text-gray-500 hidden sm:table-cell">{ago(r.last_seen)}</td>
                          <td className="py-2 pr-3 text-gray-600 capitalize hidden md:table-cell">{r.device_type || "unknown"}</td>
                          <td className="py-2 pr-3 text-gray-600 hidden md:table-cell">{host(r.referrer)}</td>
                          <td className="py-2 pr-3 text-gray-900 font-bold tabular-nums text-right">{r.visit_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                No visitors yet — run the <code className="text-gray-500">visitors</code> migration if this stays empty.
              </p>
            )}
          </ChartWrapper>

          <p className="text-[11px] text-gray-400">
            &ldquo;Unique&rdquo; is a per-browser estimate — incognito, clearing cache, or a second device each count as a new visitor. Days are UTC.
          </p>
        </>
      )}
    </div>
  );
}
