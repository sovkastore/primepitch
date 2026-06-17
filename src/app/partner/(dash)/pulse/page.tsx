"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import PulsePanel from "@/components/partner/PulsePanel";

interface PulseMatch {
  match_id: string; title: string; total: number; his: number; yours: number;
  peakTotal: number; peakHis: number; peakYours: number;
}
interface PulsePage { path: string; total: number; his: number; yours: number }
interface Split { total: number; his: number; yours: number }
interface PulseData { onlineNow: Split; liveNow: Split; matches: PulseMatch[]; pages: PulsePage[] }

export default function PartnerPulse() {
  const { data, loading, error } = usePartnerData<PulseData>("/api/partner/pulse", 20000);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Pulse</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Live, right now. <span className="text-blue-600 font-bold">Blue = me</span> (the people you brought). Only people on a genuinely-live match count as &ldquo;watching live.&rdquo;
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <PulsePanel data={data} mine />
      )}
    </div>
  );
}
