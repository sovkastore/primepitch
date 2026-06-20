"use client";

import { useMemo } from "react";
import { SplitStat, type Split } from "@/components/partner/SplitStat";
import { useFeedStatus } from "@/components/partner/useFeedStatus";

interface ActiveMatch { match_id: string; total: number; his: number }
export interface OverviewData {
  onlineNow?: Split; liveNow?: Split; newToday?: Split; returnsToday?: Split;
  totalVisitors?: Split; pageViewsToday?: Split; matchViewsToday?: Split; activeMatches?: ActiveMatch[];
  full_stats?: boolean;
  earnings?: { earned: number; paid: number; balance: number };
}

export default function OverviewPanel({ data, mine, solo }: { data: OverviewData | null; mine?: boolean; solo?: boolean }) {
  const { rowStatus } = useFeedStatus();
  const active = useMemo(() => data?.activeMatches ?? [], [data]);
  const live = active.filter((m) => rowStatus(m.match_id) === "live");
  const liveT = live.reduce((s, m) => s + (m.total || 0), 0);
  const liveH = live.reduce((s, m) => s + (m.his || 0), 0);
  const split = (t: number, h: number): Split => ({ total: t, his: h, yours: Math.max(0, t - h) });

  return (
    <>
      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-2">Live snapshot</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SplitStat label="Online Now" data={data?.onlineNow} mine={mine} solo={solo} hint="on the site" />
        <SplitStat label="Watching Live" data={split(liveT, liveH)} mine={mine} solo={solo} hint="live matches only" />
        <SplitStat label="On a Match Page" data={data?.liveNow} mine={mine} solo={solo} hint="live, upcoming or ended" />
      </div>
      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Today &amp; lifetime</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SplitStat label="New Visitors" data={data?.newToday} mine={mine} solo={solo} hint="first time ever" />
        <SplitStat label="Returning" data={data?.returnsToday} mine={mine} solo={solo} hint="came back today" />
        <SplitStat label="Page Views Today" data={data?.pageViewsToday} mine={mine} solo={solo} hint="incl. repeats" />
        <SplitStat label="Match Views Today" data={data?.matchViewsToday} mine={mine} solo={solo} hint="incl. repeats" />
        <SplitStat label="Total Visitors" data={data?.totalVisitors} mine={mine} solo={solo} hint="all-time, ever joined" />
      </div>
    </>
  );
}
