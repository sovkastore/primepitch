"use client";

import { useMemo, useState } from "react";
import { usePartnerData } from "@/components/partner/usePartnerData";
import AnalyticsPanel, { type AnalyticsData } from "@/components/partner/AnalyticsPanel";
import RangePicker from "@/components/partner/RangePicker";
import { rangeFor, type Preset } from "@/components/partner/rangePresets";

export default function PartnerAnalytics() {
  const [preset, setPreset] = useState<Preset>("today");
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const url = useMemo(() => {
    const { start, end } = rangeFor(preset, dateStr);
    return `/api/partner/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  }, [preset, dateStr]);
  const { data, loading, error } = usePartnerData<AnalyticsData & { full_stats?: boolean }>(url);
  const scoped = data?.full_stats === false;
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Analytics</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        {scoped ? (
          <>Your own numbers for the chosen window. Windows are UTC days.</>
        ) : (
          <>Totals for a time window. <span className="text-[#3cac3b] font-bold">Green = me</span>. Windows are UTC days.</>
        )}
      </p>
      <RangePicker preset={preset} dateStr={dateStr} onPreset={setPreset}
        onDate={(d) => { setDateStr(d); setPreset("date"); }} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? <p className="text-sm text-gray-400">Loading…</p> : <AnalyticsPanel data={data} mine solo={scoped} />}
    </div>
  );
}
