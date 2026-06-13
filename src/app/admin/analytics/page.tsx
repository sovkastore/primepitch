"use client";

import { useEffect, useState, useCallback } from "react";
import MetricCard from "@/components/admin/MetricCard";

interface AnalyticsData {
  start: string;
  end: string;
  people: { unique: number; newVisitors: number; returning: number; returningRate: number };
  activity: {
    pageViews: number; matchViews: number; matchesWatched: number; uniqueWatchers: number;
    liveViews: number; preViews: number; watchersLive: number; watchersPreOnly: number; loadsPerPerson: number; matchLoadsPerWatcher: number;
  };
  byDevice: Record<string, number>;
  topMatches: { match_id: string; title: string; views: number }[];
  topPages: { path: string; views: number }[];
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "all" | "date";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function rangeFor(preset: Preset, dateStr: string): { start: string; end: string } {
  const now = new Date();
  const todayStart = utcMidnight(now);
  switch (preset) {
    case "today": return { start: iso(todayStart), end: iso(now) };
    case "yesterday": {
      const y = new Date(todayStart.getTime() - DAY);
      return { start: iso(y), end: iso(new Date(todayStart.getTime() - 1)) };
    }
    case "7d": return { start: iso(new Date(now.getTime() - 7 * DAY)), end: iso(now) };
    case "30d": return { start: iso(new Date(now.getTime() - 30 * DAY)), end: iso(now) };
    case "month": return { start: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), end: iso(now) };
    case "all": return { start: "2000-01-01T00:00:00.000Z", end: iso(now) };
    case "date": {
      const s = `${dateStr}T00:00:00.000Z`;
      const e = `${dateStr}T23:59:59.999Z`;
      return { start: s, end: e };
    }
  }
}

const fmtLabel = (start: string, end: string) => {
  const s = new Date(start), e = new Date(end);
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return sameDay ? s.toLocaleDateString("en-US", opt) : `${s.toLocaleDateString("en-US", opt)} – ${e.toLocaleDateString("en-US", opt)}`;
};

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = rangeFor(preset, dateStr);
    try {
      const res = await fetch(`/api/admin/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      setData(await res.json());
    } catch { setData(null); }
    setLoading(false);
  }, [preset, dateStr]);

  useEffect(() => { load(); }, [load]);

  const totalDevice = data ? Object.values(data.byDevice).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900">Analytics</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Everything that happened in a window — pick the range.</p>
      </div>

      {/* Date-range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
              preset === p.key ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-bold border ${
          preset === "date" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
        }`}>
          <input
            type="date"
            value={dateStr}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDateStr(e.target.value); setPreset("date"); }}
            className="bg-transparent outline-none text-inherit"
          />
        </div>
      </div>

      {loading || !data ? (
        <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">
            Showing: {fmtLabel(data.start, data.end)}
          </p>

          {/* People */}
          <section>
            <h2 className="text-[12px] font-extrabold text-gray-900 uppercase tracking-wider mb-2">People</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard title="Unique people" value={data.people.unique} subtitle="distinct humans" color="emerald" />
              <MetricCard title="New" value={data.people.newVisitors} subtitle="first time ever" color="blue" />
              <MetricCard title="Returning" value={data.people.returning} subtitle="joined earlier, active now" color="amber" />
              <MetricCard title="Returning rate" value={`${data.people.returningRate}%`} subtitle="of this window" color="amber" />
            </div>
            {data.people.unique > 0 && (
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden flex">
                <div className="h-full bg-amber-400" style={{ width: `${data.people.returningRate}%` }} />
                <div className="h-full bg-blue-300" style={{ width: `${100 - data.people.returningRate}%` }} />
              </div>
            )}
          </section>

          {/* Activity */}
          <section>
            <h2 className="text-[12px] font-extrabold text-gray-900 uppercase tracking-wider mb-2">Activity (loads, repeats included)</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard title="Page views" value={data.activity.pageViews} subtitle={`${data.activity.loadsPerPerson} per person`} color="red" />
              <MetricCard title="Match views" value={data.activity.matchViews} subtitle={`${data.activity.liveViews} live · ${data.activity.preViews} pre`} color="red" />
              <MetricCard title="Matches watched" value={data.activity.matchesWatched} subtitle="distinct matches" color="emerald" />
              <MetricCard title="Match watchers" value={data.activity.uniqueWatchers} subtitle={`${data.activity.watchersLive} watched live · ${data.activity.watchersPreOnly} only pre`} color="blue" />
            </div>
          </section>

          {/* Breakdowns */}
          <section className="grid lg:grid-cols-3 gap-4">
            {/* Devices */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3">Devices</h3>
              {Object.entries(data.byDevice).sort(([, a], [, b]) => b - a).map(([dev, n]) => (
                <div key={dev} className="flex items-center justify-between text-[13px] py-1">
                  <span className="capitalize text-gray-700">{dev}</span>
                  <span className="font-bold text-gray-900 tabular-nums">{n}{totalDevice ? ` · ${Math.round((n / totalDevice) * 100)}%` : ""}</span>
                </div>
              ))}
              {Object.keys(data.byDevice).length === 0 && <p className="text-[12px] text-gray-400">No data</p>}
            </div>
            {/* Top matches */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3">Top matches</h3>
              {data.topMatches.map((m) => (
                <div key={m.match_id} className="flex items-center justify-between text-[13px] py-1 gap-2">
                  <span className="text-gray-700 truncate">{m.title}</span>
                  <span className="font-bold text-gray-900 tabular-nums shrink-0">{m.views}</span>
                </div>
              ))}
              {data.topMatches.length === 0 && <p className="text-[12px] text-gray-400">No data</p>}
            </div>
            {/* Top pages */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3">Top pages</h3>
              {data.topPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between text-[13px] py-1 gap-2">
                  <span className="text-gray-700 truncate">{p.path}</span>
                  <span className="font-bold text-gray-900 tabular-nums shrink-0">{p.views}</span>
                </div>
              ))}
              {data.topPages.length === 0 && <p className="text-[12px] text-gray-400">No data</p>}
            </div>
          </section>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            &ldquo;Unique people&rdquo; counts distinct browsers; views count every load including refreshes and
            re-opens, so views are always higher. New = first ever visit landed in this window; Returning =
            active now but first joined before it. Windows are UTC days.
          </p>
        </>
      )}
    </div>
  );
}
