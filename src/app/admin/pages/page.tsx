"use client";

import { useEffect, useState } from "react";
import ChartWrapper from "@/components/admin/ChartWrapper";
import MetricCard from "@/components/admin/MetricCard";
import { visibleInterval } from "@/lib/poll";

interface PageRow { path: string; views: number; uniques: number }
interface PagesData {
  date: string;
  pages: PageRow[];
  totalViews: number;
  totalUnique: number;
  onlineNow: number;
  viewingNow: { path: string; viewers: number }[];
}

const utcDate = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

function prettyPath(p: string): string {
  if (!p || p === "/") return "Home";
  if (p.startsWith("/watch/")) {
    const slug = decodeURIComponent(p.replace("/watch/", "")).split("--").pop() || "";
    return "▶ " + slug.replace(/^ppv-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (p === "/admin" || p.startsWith("/admin/")) return "Admin · " + (p.replace(/^\/admin\/?/, "") || "overview");
  if (p === "/world-cup") return "World Cup 2026";
  return p.slice(1).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PagesPage() {
  const today = utcDate(0);
  const yesterday = utcDate(1);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<PagesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`/api/admin/pages?date=${date}`)
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    setLoading(true);
    return visibleInterval(load, 60_000); // keep "viewing now" reasonably fresh
  }, [date]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pages</h1>
          <p className="text-[12px] text-gray-500">Which pages people are on now and which get the most views.</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard title="Online Now" value={data.onlineNow} color="emerald" />
            <MetricCard title="Total Views" value={data.totalViews} subtitle="this day" color="blue" />
            <MetricCard title="Unique Viewers" value={data.totalUnique} subtitle="this day" color="amber" />
            <MetricCard title="Pages Viewed" value={data.pages.length} subtitle="distinct pages" color="red" />
          </div>

          <ChartWrapper title="Viewing right now">
            {data.viewingNow.length > 0 ? (
              <div className="space-y-1">
                {data.viewingNow.map((v) => (
                  <div key={v.path} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50">
                    <span className="text-[13px] text-gray-700 truncate">{prettyPath(v.path)}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[13px] font-bold text-gray-900 tabular-nums">{v.viewers}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No one on the site right now.</p>
            )}
          </ChartWrapper>

          <ChartWrapper title="Pages — most viewed">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] sm:text-[13px]">
                <thead>
                  <tr className="text-gray-400 font-bold">
                    <th className="text-left py-2 pr-2">Page</th>
                    <th className="text-right py-2 px-2">Views</th>
                    <th className="text-right py-2 px-2">Unique</th>
                    <th className="text-right py-2 pl-2 whitespace-nowrap">Views / user</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.path} className="border-t border-gray-50">
                      <td className="py-2 pr-2">
                        <span className="block font-semibold text-gray-800 truncate max-w-[150px] sm:max-w-md">{prettyPath(p.path)}</span>
                        <span className="block text-[10px] text-gray-400 truncate max-w-[150px] sm:max-w-md">{p.path}</span>
                      </td>
                      <td className="text-right py-2 px-2 font-bold text-gray-900 tabular-nums">{p.views.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-gray-600 tabular-nums">{p.uniques.toLocaleString()}</td>
                      <td className="text-right py-2 pl-2 text-gray-600 tabular-nums">{p.uniques ? (p.views / p.uniques).toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.pages.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No page views on this day.</p>
              )}
            </div>
          </ChartWrapper>
        </>
      )}
    </div>
  );
}
