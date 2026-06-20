"use client";

import { useCallback, useEffect, useState } from "react";

const money = (v: unknown) => "$" + (Number(v) || 0).toFixed(2);

const CURRENCIES: { id: string; label: string }[] = [
  { id: "usdt_trc20", label: "USDT · TRC20" },
  { id: "usdt_erc20", label: "USDT · ERC20" },
  { id: "usdt_bep20", label: "USDT · BEP20" },
  { id: "ton", label: "Toncoin (TON)" },
  { id: "btc", label: "Bitcoin (BTC)" },
];
const curLabel = (id?: string | null) => CURRENCIES.find((c) => c.id === id)?.label || id || "—";

const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", cls: "bg-violet-50 text-violet-700" },
  completed: { label: "Completed", cls: "bg-[#10b981]/10 text-[#10b981]" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-600" },
};
const statusMeta = (s?: string) => STATUS[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-500" };

interface Payout {
  id: string; amount: number; currency: string | null; from_address: string | null; to_address: string | null;
  status: string; proof_link: string | null; proof_image: string | null; note: string | null; fail_reason: string | null; created_at: string;
}

const short = (a?: string | null) => (!a ? "—" : a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In progress" },
  { id: "sent", label: "Sent" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

export default function PartnerHistory() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [paid, setPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/partner/payments", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) { setPayouts(j.payouts ?? []); setPaid(Number(j.balances?.paid) || 0); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = filter === "all" ? payouts : payouts.filter((p) => p.status === filter);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Payment history</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        Every payout we’ve recorded for you — amounts, status, addresses and proof.
      </p>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-3">
          <p className="text-[18px] font-black text-gray-900 tabular-nums">{money(paid)}</p>
          <p className="text-[11px] text-gray-400 font-semibold">Paid out all-time</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-3">
          <p className="text-[18px] font-black text-gray-900 tabular-nums">{payouts.length}</p>
          <p className="text-[11px] text-gray-400 font-semibold">Total payments</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors ${filter === f.id ? "bg-[#10b981] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : payouts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">No payments yet.</p>
          <p className="text-[12px] text-gray-400 mt-1">When we pay you, every payout will show up here in detail.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400">No {statusMeta(filter).label.toLowerCase()} payments.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => {
            const st = statusMeta(p.status);
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-black text-gray-900 tabular-nums">{money(p.amount)}</p>
                    <p className="text-[11px] text-gray-400">{curLabel(p.currency)} · {fmtDate(p.created_at)}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${st.cls}`}>{st.label}</span>
                </div>
                {(p.from_address || p.to_address) && (
                  <p className="text-[11px] text-gray-400 font-mono mt-2 break-all">{short(p.from_address)} → {short(p.to_address)}</p>
                )}
                {p.note && <p className="text-[12px] text-gray-500 mt-1">{p.note}</p>}
                {p.status === "failed" && p.fail_reason && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">
                    <p className="text-[12px] font-bold text-red-700">Why this failed</p>
                    <p className="text-[12px] text-red-600 mt-0.5">{p.fail_reason}</p>
                  </div>
                )}
                {(p.proof_link || p.proof_image) && (
                  <div className="flex items-center gap-4 mt-2">
                    {p.proof_link && <a href={p.proof_link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#10b981] hover:underline">View transaction ↗</a>}
                    {p.proof_image && <a href={p.proof_image} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#10b981] hover:underline">View screenshot ↗</a>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
