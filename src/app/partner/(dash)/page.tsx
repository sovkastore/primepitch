"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import OverviewPanel, { type OverviewData } from "@/components/partner/OverviewPanel";

const money = (v: number) => "$" + (Number(v) || 0).toFixed(2);

export default function PartnerOverview() {
  const { data, loading, error } = usePartnerData<OverviewData>("/api/partner/overview", 30000);
  const scoped = data?.full_stats === false;
  const e = data?.earnings;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Overview</h1>

      {e && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-3 mb-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Your earnings</p>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3 mt-2">
            <div>
              <p className="text-3xl font-black text-gray-900 tabular-nums">{money(e.balance)}</p>
              <p className="text-[11px] text-gray-400 font-semibold">available to be paid</p>
            </div>
            <div className="text-[13px] leading-relaxed">
              <p className="text-gray-500">On hold (being paid) <b className="text-gray-800">{money(e.hold)}</b></p>
              <p className="text-gray-500">Earned all-time <b className="text-gray-800">{money(e.earned)}</b></p>
              <p className="text-gray-400">Paid out <b className="text-gray-600">{money(e.paid)}</b></p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Payouts go out twice a month (around the 15th and the end of the month) in cryptocurrency to the wallet you set on the Payouts page. There’s a $5 minimum — anything under simply rolls into your next payout.
          </p>
        </div>
      )}

      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        {scoped ? (
          <>These are the people you brought — your own visitors.</>
        ) : (
          <>Big number = everyone. <span className="text-[#10b981] font-bold">Green = me</span> (the people you brought). Grey = everyone else.</>
        )}
      </p>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? <p className="text-sm text-gray-400">Loading…</p> : <OverviewPanel data={data} mine solo={scoped} />}
    </div>
  );
}
