"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import MetricCard from "@/components/admin/MetricCard";
import ChartWrapper from "@/components/admin/ChartWrapper";

interface OverviewData {
  todayViews: number;
  uniqueToday: number;
  liveViewers: number;
  matchViewsToday: number;
  weekViews: number;
  dailyStats: { date: string; total_views: number; unique_visitors: number }[];
  sportBreakdown: Record<string, number>;
  topMatches: { match_id: string; title: string; sport: string; views: number }[];
}

const SPORT_COLORS: Record<string, string> = {
  football: "#10b981",
  basketball: "#f59e0b",
  "american-football": "#6366f1",
  fight: "#ef4444",
  "motor-sports": "#8b5cf6",
  tennis: "#06b6d4",
  hockey: "#3b82f6",
  baseball: "#ec4899",
  cricket: "#14b8a6",
  rugby: "#f97316",
  other: "#6b7280",
};

const PIE_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444", "#8b5cf6", "#06b6d4", "#3b82f6", "#ec4899"];

function WorldCupCountdown() {
  const target = new Date("2026-06-11T00:00:00Z").getTime();
  const now = Date.now();
  const diff = target - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const started = diff <= 0;

  return (
    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
      <p className="text-[11px] font-bold tracking-wider uppercase opacity-80">
        FIFA World Cup 2026
      </p>
      {started ? (
        <p className="text-2xl font-black mt-2">LIVE NOW</p>
      ) : (
        <>
          <p className="text-4xl font-black mt-2 tabular-nums">{days}</p>
          <p className="text-sm font-medium opacity-80 mt-1">days until kickoff</p>
        </>
      )}
      <p className="text-[11px] opacity-60 mt-2">June 11, 2026</p>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pieData = Object.entries(data.sportBreakdown).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-xl font-bold text-gray-900">Overview</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Today's Visitors"
          value={data.uniqueToday}
          subtitle={`${data.todayViews} page views`}
          color="emerald"
        />
        <MetricCard
          title="Live Viewers"
          value={data.liveViewers}
          color="red"
        />
        <MetricCard
          title="Match Views Today"
          value={data.matchViewsToday}
          color="blue"
        />
        <MetricCard
          title="Total Views (7d)"
          value={data.weekViews}
          color="amber"
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ChartWrapper title="Daily Visitors (30d)" className="lg:col-span-2">
          {data.dailyStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
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
                <Line type="monotone" dataKey="total_views" stroke="#6366f1" strokeWidth={2} dot={false} name="Total Views" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">
              No data yet. Run daily aggregation to populate charts.
            </p>
          )}
        </ChartWrapper>

        <div className="space-y-4">
          <ChartWrapper title="Sport Breakdown (7d)">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No match data yet</p>
            )}
          </ChartWrapper>
          <WorldCupCountdown />
        </div>
      </div>

      {/* Top matches table */}
      <ChartWrapper title="Top Matches Today">
        {data.topMatches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase pb-2">Match</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase pb-2">Sport</th>
                  <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2">Views</th>
                </tr>
              </thead>
              <tbody>
                {data.topMatches.map((m, i) => (
                  <tr key={m.match_id} className="border-b border-gray-50">
                    <td className="py-2.5 text-[13px] font-medium text-gray-900">
                      <span className="text-gray-400 mr-2">{i + 1}.</span>
                      {m.title}
                    </td>
                    <td className="py-2.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: `${SPORT_COLORS[m.sport] || SPORT_COLORS.other}15`,
                          color: SPORT_COLORS[m.sport] || SPORT_COLORS.other,
                        }}
                      >
                        {m.sport}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[13px] font-bold text-gray-900 tabular-nums">
                      {m.views}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No match views yet today</p>
        )}
      </ChartWrapper>
    </div>
  );
}
