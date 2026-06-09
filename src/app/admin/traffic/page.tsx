"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import ChartWrapper from "@/components/admin/ChartWrapper";

interface TrafficData {
  dailyStats: { date: string; total_views: number; unique_visitors: number; match_views: number }[];
  topPages: { path: string; views: number }[];
  deviceBreakdown: Record<string, number>;
  topReferrers: { source: string; views: number }[];
}

const DEVICE_COLORS = {
  mobile: "#10b981",
  desktop: "#6366f1",
  tablet: "#f59e0b",
  unknown: "#9ca3af",
};

export default function TrafficPage() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/traffic?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const devicePie = Object.entries(data.deviceBreakdown).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Traffic Analytics</h1>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                days === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Daily visitors chart */}
      <ChartWrapper title={`Daily Visitors (${days}d)`}>
        {data.dailyStats.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.dailyStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                labelFormatter={(v) => new Date(v).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              />
              <Line type="monotone" dataKey="unique_visitors" stroke="#10b981" strokeWidth={2} dot={false} name="Unique Visitors" />
              <Line type="monotone" dataKey="total_views" stroke="#6366f1" strokeWidth={2} dot={false} name="Page Views" />
              <Line type="monotone" dataKey="match_views" stroke="#f59e0b" strokeWidth={2} dot={false} name="Match Views" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">No aggregated data yet. Run daily aggregation from Settings.</p>
        )}
      </ChartWrapper>

      {/* Device + Referrers */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartWrapper title="Device Breakdown">
          {devicePie.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={devicePie} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value">
                    {devicePie.map((entry) => (
                      <Cell key={entry.name} fill={DEVICE_COLORS[entry.name as keyof typeof DEVICE_COLORS] || "#9ca3af"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {devicePie.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: DEVICE_COLORS[d.name as keyof typeof DEVICE_COLORS] || "#9ca3af" }}
                    />
                    <span className="text-[12px] text-gray-600 capitalize">{d.name}</span>
                    <span className="text-[12px] font-bold text-gray-900 tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          )}
        </ChartWrapper>

        <ChartWrapper title="Top Referrers">
          {data.topReferrers.length > 0 ? (
            <div className="space-y-2">
              {data.topReferrers.map((r) => (
                <div key={r.source} className="flex items-center justify-between py-1.5">
                  <span className="text-[13px] text-gray-700 truncate max-w-[60%]">{r.source}</span>
                  <span className="text-[13px] font-bold text-gray-900 tabular-nums">{r.views}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No referrer data yet</p>
          )}
        </ChartWrapper>
      </div>

      {/* Top pages */}
      <ChartWrapper title="Top Pages">
        {data.topPages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase pb-2">Path</th>
                  <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2">Views</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages.map((p) => (
                  <tr key={p.path} className="border-b border-gray-50">
                    <td className="py-2 text-[13px] text-gray-700 font-mono">{p.path}</td>
                    <td className="py-2 text-right text-[13px] font-bold text-gray-900 tabular-nums">{p.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No page view data yet</p>
        )}
      </ChartWrapper>
    </div>
  );
}
