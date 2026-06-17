"use client";

import { useMemo, useState } from "react";
import { usePartnerData } from "@/components/partner/usePartnerData";
import { MeStat as SplitStat, type Split } from "@/components/partner/SplitStat";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

function rangeToQuery(key: string): string {
  const now = new Date();
  const end = now.toISOString();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  if (key === "today") return `start=${startToday}&end=${end}`;
  if (key === "7d") return `start=${new Date(now.getTime() - 7 * 864e5).toISOString()}&end=${end}`;
  if (key === "30d") return `start=${new Date(now.getTime() - 30 * 864e5).toISOString()}&end=${end}`;
  return `start=${new Date(0).toISOString()}&end=${end}`;
}

interface AData {
  pageViews: Split; unique: Split; newVisitors: Split; returning: Split;
  matchViews: Split; uniqueWatchers: Split;
}

export default function PartnerAnalytics() {
  const [range, setRange] = useState("7d");
  const url = useMemo(() => `/api/partner/analytics?${rangeToQuery(range)}`, [range]);
  const { data, loading, error } = usePartnerData<AData>(url);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Analytics</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        Totals for a time window. <span className="text-blue-600 font-bold">Blue = your people</span>.
      </p>
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
              range === r.key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <SplitStat label="Unique visitors" data={data?.unique} />
          <SplitStat label="Joined (new)" data={data?.newVisitors} />
          <SplitStat label="Returning" data={data?.returning} />
          <SplitStat label="Page views" data={data?.pageViews} />
          <SplitStat label="Match views" data={data?.matchViews} />
          <SplitStat label="Unique watchers" data={data?.uniqueWatchers} />
        </div>
      )}
    </div>
  );
}
