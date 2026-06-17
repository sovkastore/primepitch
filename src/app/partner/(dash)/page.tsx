"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import OverviewPanel, { type OverviewData } from "@/components/partner/OverviewPanel";

export default function PartnerOverview() {
  const { data, loading, error } = usePartnerData<OverviewData>("/api/partner/overview", 30000);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Overview</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Big number = everyone. <span className="text-blue-600 font-bold">Blue = me</span> (the people you brought). Grey = everyone else.
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? <p className="text-sm text-gray-400">Loading…</p> : <OverviewPanel data={data} mine />}
    </div>
  );
}
