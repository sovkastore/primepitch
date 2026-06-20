"use client";

import { useMemo, useState } from "react";
import { usePartnerData } from "@/components/partner/usePartnerData";
import VisitorsPanel, { type VisitorsData } from "@/components/partner/VisitorsPanel";
import DayPicker from "@/components/partner/DayPicker";

export default function PartnerVisitors() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const url = useMemo(() => `/api/partner/visitors?date=${date || today}`, [date, today]);
  const { data, loading, error } = usePartnerData<VisitorsData & { full_stats?: boolean }>(url);
  const scoped = data?.full_stats === false;
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Visitors</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        {scoped ? (
          <>Your own people for a day, plus your lifetime and trend. Days are UTC.</>
        ) : (
          <>People for a day, plus lifetime and trend. <span className="text-[#10b981] font-bold">Green = me</span>. Days are UTC.</>
        )}
      </p>
      <DayPicker date={date} onChange={(d) => setDate(d || today)} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? <p className="text-sm text-gray-400">Loading…</p> : <VisitorsPanel data={data} mine solo={scoped} />}
    </div>
  );
}
