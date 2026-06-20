"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import PulsePanel, { type PulseData } from "@/components/partner/PulsePanel";

export default function PartnerPulse() {
  const { data, loading, error } = usePartnerData<PulseData & { full_stats?: boolean }>("/api/partner/pulse", 20000);
  const scoped = data?.full_stats === false;
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Pulse</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        {scoped ? (
          <>Live, right now — your own people. Only people on a genuinely-live match count as “watching live.”</>
        ) : (
          <>Live, right now. <span className="text-[#10b981] font-bold">Green = me</span> (the people you brought). Only people on a genuinely-live match count as “watching live.”</>
        )}
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <PulsePanel data={data} mine solo={scoped} />
      )}
    </div>
  );
}
