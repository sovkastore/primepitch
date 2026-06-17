"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import { SplitStat, type Split } from "@/components/partner/SplitStat";

interface OverviewData {
  totalVisitors: Split; newToday: Split; returnsToday: Split;
  pageViewsToday: Split; matchViewsToday: Split; onlineNow: Split; liveNow: Split;
}

export default function PartnerOverview() {
  const { data, loading, error } = usePartnerData<OverviewData>("/api/partner/overview", 30000);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Overview</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Big number = everyone. <span className="text-blue-600 font-bold">Blue = your referred people</span>. Grey = everyone else.
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SplitStat label="Online now" data={data?.onlineNow} />
            <SplitStat label="Watching live now" data={data?.liveNow} />
            <SplitStat label="Joined today" data={data?.newToday} />
            <SplitStat label="Returned today" data={data?.returnsToday} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            <SplitStat label="Total members (all time)" data={data?.totalVisitors} />
            <SplitStat label="Page views today" data={data?.pageViewsToday} />
            <SplitStat label="Match views today" data={data?.matchViewsToday} />
          </div>
        </>
      )}
    </div>
  );
}
