"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import ChartWrapper from "@/components/admin/ChartWrapper";
import { useIsMobile } from "@/lib/use-is-mobile";

interface MatchRow {
  match_id: string;
  title: string;
  sport: string;
  views: number;
  unique_viewers: number;
  status?: "played" | "live" | "upcoming";
  avg_duration: number;
  last_viewed: string;
}

const SPORTS = [
  "", "football", "basketball", "american-football", "fight",
  "motor-sports", "tennis", "hockey", "baseball", "cricket",
  "rugby", "golf", "other",
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function MatchAnalyticsPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [sport, setSport] = useState("");
  const [sort, setSort] = useState<"views" | "recent">("views");
  const [status, setStatus] = useState<"played" | "live" | "upcoming" | "all">("played");
  const [day, setDay] = useState<string>(""); // "" = all time, else YYYY-MM-DD (UTC day)
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sport) params.set("sport", sport);
    params.set("sort", sort);
    params.set("status", status);
    if (day) {
      params.set("from", `${day}T00:00:00.000Z`);
      params.set("to", `${day}T23:59:59.999Z`);
    }
    params.set("page", String(page));

    fetch(`/api/admin/matches?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setMatches(data.matches || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sport, sort, status, day, page]);

  const chartData = matches.slice(0, 15).map((m) => ({
    name: m.title.length > 25 ? m.title.slice(0, 25) + "..." : m.title,
    views: m.views,
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Match Analytics</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
            {([
              { label: "All time", value: "" },
              { label: "Today", value: new Date().toISOString().slice(0, 10) },
              { label: "Yesterday", value: new Date(Date.now() - 864e5).toISOString().slice(0, 10) },
            ] as const).map((t) => (
              <button
                key={t.label}
                onClick={() => { setDay(t.value); setPage(1); }}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  day === t.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={day}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDay(e.target.value); setPage(1); }}
            className="text-[12px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-1.5"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
          {(["played", "live", "upcoming", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setStatus(t); setPage(1); }}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors capitalize ${
                status === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
          {(["views", "recent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setSort(t); setPage(1); }}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                sort === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {t === "views" ? "Top Views" : "Recent"}
            </button>
          ))}
        </div>
        <select
          value={sport}
          onChange={(e) => { setSport(e.target.value); setPage(1); }}
          className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="">All Sports</option>
          {SPORTS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Bar chart */}
      <ChartWrapper title="Top Matches by Views">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: isMobile ? 4 : 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={isMobile ? 96 : 120} tickFormatter={(v) => isMobile && v.length > 12 ? v.slice(0, 12) + "…" : v} />
              <Tooltip />
              <Bar dataKey="views" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">No match data yet</p>
        )}
      </ChartWrapper>

      {/* Table */}
      <ChartWrapper title={`All Matches (${total})`}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : matches.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-[11px] font-bold text-gray-400 uppercase pb-2">Match</th>
                    <th className="text-left text-[11px] font-bold text-gray-400 uppercase pb-2">Sport</th>
                    <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2">Views</th>
                    <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2 hidden sm:table-cell">Unique</th>
                    <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2 hidden md:table-cell">Avg Duration</th>
                    <th className="text-right text-[11px] font-bold text-gray-400 uppercase pb-2 hidden lg:table-cell">Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.match_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 text-[13px] font-medium text-gray-900 max-w-xs truncate">
                        {m.status === "live" && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded mr-1.5 align-middle">
                            <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />LIVE
                          </span>
                        )}
                        {m.status === "upcoming" && (
                          <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mr-1.5 align-middle">⏳ SOON</span>
                        )}
                        {m.title}
                      </td>
                      <td className="py-2.5 text-[11px] text-gray-500 font-medium">{m.sport}</td>
                      <td className="py-2.5 text-right text-[13px] font-bold text-gray-900 tabular-nums">{m.views}</td>
                      <td className="py-2.5 text-right text-[13px] text-gray-600 tabular-nums hidden sm:table-cell">{m.unique_viewers}</td>
                      <td className="py-2.5 text-right text-[12px] text-gray-500 hidden md:table-cell">{formatDuration(m.avg_duration)}</td>
                      <td className="py-2.5 text-right text-[12px] text-gray-400 hidden lg:table-cell">
                        {new Date(m.last_viewed).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <p className="text-[12px] text-gray-400">
                Page {page} of {Math.ceil(total / 20)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">No match data found</p>
        )}
      </ChartWrapper>
    </div>
  );
}
