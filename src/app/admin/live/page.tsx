"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import ChartWrapper from "@/components/admin/ChartWrapper";

interface LiveData {
  totalActive: number;
  activeMatches: { match_id: string; viewers: number }[];
  activePages: { path: string; viewers: number }[];
  recentActivity: { path: string; device_type: string; created_at: string }[];
}

export default function LiveMonitorPage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    function fetchData() {
      fetch("/api/admin/live-stats")
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLastUpdated(new Date());
        })
        .catch(console.error);
    }

    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Live Monitor</h1>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Big number */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-6xl font-black text-gray-900 tabular-nums">{data.totalActive}</p>
        <p className="text-sm text-gray-500 mt-2 font-medium">Active Viewers Right Now</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active matches */}
        <ChartWrapper title="Active Matches">
          {data.activeMatches.length > 0 ? (
            <div className="space-y-2">
              {data.activeMatches.map((m) => (
                <div key={m.match_id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-[13px] text-gray-700 truncate max-w-[70%]">
                    {m.match_id.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[13px] font-bold text-gray-900 tabular-nums">{m.viewers}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No one watching matches right now</p>
          )}
        </ChartWrapper>

        {/* Viewers by page */}
        <ChartWrapper title="Viewers by Page">
          {data.activePages.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.activePages.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="path"
                  tick={{ fontSize: 10 }}
                  width={80}
                  tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + "..." : v}
                />
                <Tooltip />
                <Bar dataKey="viewers" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No active viewers</p>
          )}
        </ChartWrapper>
      </div>

      {/* Recent activity */}
      <ChartWrapper title="Recent Activity">
        {data.recentActivity.length > 0 ? (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">
                    {a.device_type === "mobile" ? "📱" : a.device_type === "tablet" ? "📱" : "💻"}
                  </span>
                  <span className="text-gray-700 font-mono">{a.path}</span>
                </div>
                <span className="text-gray-400 shrink-0">
                  {new Date(a.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
        )}
      </ChartWrapper>
    </div>
  );
}
