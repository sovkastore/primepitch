"use client";

import { SplitStat, type Split } from "@/components/partner/SplitStat";
import BreakdownList from "@/components/partner/BreakdownList";

interface NamedSplit { name?: string; title?: string; path?: string; source?: string; match_id?: string; total: number; his: number }
export interface AnalyticsData {
  unique?: Split; newVisitors?: Split; returning?: Split; pageViews?: Split;
  matchViews?: Split; uniqueWatchers?: Split; matchesWatched?: Split;
  liveViews?: Split; preViews?: Split; watchersLive?: Split;
  byDevice?: NamedSplit[]; topMatches?: NamedSplit[]; topPages?: NamedSplit[]; topReferrers?: NamedSplit[];
}

function host(s: string): string {
  if (!s || s === "(direct)") return "Direct / none";
  try { return new URL(s).hostname.replace(/^www\./, ""); } catch { return s; }
}

export default function AnalyticsPanel({ data, mine, solo }: { data: AnalyticsData | null; mine?: boolean; solo?: boolean }) {
  const uT = data?.unique?.total || 0, rT = data?.returning?.total || 0;
  const uH = data?.unique?.his || 0, rH = data?.returning?.his || 0;
  const uY = data?.unique?.yours || 0, rY = data?.returning?.yours || 0;
  const rate = (r: number, u: number) => (u ? Math.round((r / u) * 1000) / 10 : 0);

  const refMap: Record<string, { total: number; his: number }> = {};
  for (const r of data?.topReferrers ?? []) {
    const h = host(r.source || "");
    refMap[h] = refMap[h] || { total: 0, his: 0 };
    refMap[h].total += r.total; refMap[h].his += r.his;
  }
  const referrers = Object.entries(refMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8)
    .map(([label, v]) => ({ label, total: v.total, his: v.his }));

  return (
    <>
      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-2">People</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SplitStat label="Unique people" data={data?.unique} mine={mine} solo={solo} hint="distinct humans" />
        <SplitStat label="New" data={data?.newVisitors} mine={mine} solo={solo} hint="first time ever" />
        <SplitStat label="Returning" data={data?.returning} mine={mine} solo={solo} hint="joined earlier, active now" />
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 tracking-wider uppercase">Returning rate</p>
          <p className="text-2xl sm:text-3xl font-black mt-2 tabular-nums text-gray-900">{rate(rT, uT)}%</p>
          {!solo && (
            <div className="flex items-center gap-2.5 mt-2 text-[12px] font-bold">
              <span className="text-[#10b981]">{rate(rH, uH)}% {mine ? "me" : "his"}</span>
              <span className="text-gray-300">•</span>
              <span className="text-gray-500">{rate(rY, uY)}% {mine ? "others" : "yours"}</span>
            </div>
          )}
        </div>
      </div>

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Activity</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SplitStat label="Page views" data={data?.pageViews} mine={mine} solo={solo} />
        <SplitStat label="Match views" data={data?.matchViews} mine={mine} solo={solo}
          hint={`${data?.liveViews?.total ?? 0} live · ${data?.preViews?.total ?? 0} pre`} />
        <SplitStat label="Matches watched" data={data?.matchesWatched} mine={mine} solo={solo} hint="distinct matches" />
        <SplitStat label="Match watchers" data={data?.uniqueWatchers} mine={mine} solo={solo}
          hint={`${data?.watchersLive?.total ?? 0} watched live`} />
      </div>

      <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Breakdowns</h2>
      <p className="text-[11px] text-gray-400 font-medium mb-2">
        {solo ? "Each row is your own referred people." : <>Each row shows total then <span className="text-[#10b981] font-bold">{mine ? "me" : "his"}</span>.</>}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <BreakdownList title="Devices" solo={solo} rows={(data?.byDevice ?? []).map((d) => ({ label: d.name || "unknown", total: d.total, his: d.his }))} />
        <BreakdownList title="Top matches" solo={solo} rows={(data?.topMatches ?? []).map((m) => ({ label: m.title || m.match_id || "—", total: m.total, his: m.his }))} />
        <BreakdownList title="Top pages" solo={solo} rows={(data?.topPages ?? []).map((p) => ({ label: p.path || "—", total: p.total, his: p.his }))} />
        <BreakdownList title="Traffic sources" solo={solo} rows={referrers} empty="Direct / none recorded" />
      </div>
    </>
  );
}
