"use client";

import { useMemo } from "react";
import { SplitStat, type Split } from "@/components/partner/SplitStat";
import { useFeedStatus } from "@/components/partner/useFeedStatus";

interface ActiveMatch { match_id: string; total: number; his: number }
export interface OverviewData {
  onlineNow?: Split; liveNow?: Split; newToday?: Split; returnsToday?: Split;
  totalVisitors?: Split; pageViewsToday?: Split; matchViewsToday?: Split; activeMatches?: ActiveMatch[];
}

export default function OverviewPanel({ data, mine }: { data: OverviewData | null; mine?: boolean }) {
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
        <SplitStat label="Online now" data={data?.onlineNow} mine={mine} hint="on the site" />
        <SplitStat label="Watching live" data={split(liveT, liveH)} mine={mine} hint="live matches only" />
        <SplitStat label="On a match page" data={data?.liveNow} mine={mine} hint="live, upcoming or ended" />
      </div>
      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Today &amp; lifetime</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SplitStat label="Joined today" data={data?.newToday} mine={mine} />
        <SplitStat label="Returned today" data={data?.returnsToday} mine={mine} />
        <SplitStat label="Page views today" data={data?.pageViewsToday} mine={mine} />
        <SplitStat label="Match views today" data={data?.matchViewsToday} mine={mine} />
        <SplitStat label="Total members (all time)" data={data?.totalVisitors} mine={mine} />
      </div>
    </>
  );
}
