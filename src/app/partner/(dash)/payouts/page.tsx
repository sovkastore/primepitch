"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const money = (v: unknown) => "$" + (Number(v) || 0).toFixed(2);

const CURRENCIES: { id: string; label: string }[] = [
  { id: "usdt_trc20", label: "USDT · TRC20" },
  { id: "usdt_erc20", label: "USDT · ERC20" },
  { id: "usdt_bep20", label: "USDT · BEP20" },
  { id: "ton", label: "Toncoin (TON)" },
  { id: "btc", label: "Bitcoin (BTC)" },
];
const curLabel = (id?: string | null) => CURRENCIES.find((c) => c.id === id)?.label || id || "—";

interface Payout {
  id: string; amount: number; currency: string | null; from_address: string | null; to_address: string | null;
  status: string; proof_link: string | null; proof_image: string | null; note: string | null; fail_reason: string | null; created_at: string;
}
interface PaymentsData {
  balances: { earned: number; hold: number; paid: number; balance: number };
  method: { currency: string | null; address: string | null };
  payouts: Payout[];
}


export default function PartnerPayouts() {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [currency, setCurrency] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/partner/payments", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) {
        setData(j);
        setCurrency((c) => c || j.method?.currency || "");
        setAddress((a) => a || j.method?.address || "");
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveMethod() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/partner/payout-method", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, address: address.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: "err", text: j.error || "Couldn’t save" }); return; }
      setMsg({ type: "ok", text: "Payout wallet saved." });
      await load();
    } catch { setMsg({ type: "err", text: "Couldn’t save" }); }
    finally { setBusy(false); }
  }

  const b = data?.balances;
  const tiles: { v: unknown; l: string; muted?: boolean }[] = [
    { v: b?.balance, l: "Balance" },
    { v: b?.hold, l: "On hold" },
    { v: b?.earned, l: "Earned all-time" },
    { v: b?.paid, l: "Paid out", muted: true },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Payouts</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        Set the wallet we pay you to, and see how payouts work.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {tiles.map((t) => (
          <div key={t.l} className="bg-white rounded-2xl border border-gray-200 p-3">
            <p className={`text-[18px] font-black tabular-nums ${t.muted ? "text-gray-400" : "text-gray-900"}`}>{money(t.v)}</p>
            <p className="text-[11px] text-gray-400 font-semibold">{t.l}</p>
          </div>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 text-[13px] font-semibold px-3 py-2 rounded-xl ${msg.type === "ok" ? "bg-[#3cac3b]/10 text-[#2e8e2d]" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-5">
        <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-1">Payment method</p>
        <p className="text-[12px] text-gray-400 mb-3">Pick a cryptocurrency and paste the wallet address we should send your payouts to.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {CURRENCIES.map((c) => (
            <button key={c.id} onClick={() => setCurrency(c.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${currency === c.id ? "bg-[#3cac3b] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Wallet address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste your wallet address"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#3cac3b]" />
        <button onClick={saveMethod} disabled={busy || !currency || !address.trim()}
          className="mt-3 px-5 py-2.5 rounded-xl bg-[#3cac3b] text-white text-sm font-bold hover:bg-[#2e8e2d] disabled:opacity-60 transition-colors">
          {busy ? "Saving…" : "Save wallet"}
        </button>
        {data?.method?.address && (
          <p className="text-[11px] text-gray-400 mt-2 break-all">Saved: <span className="font-bold text-gray-600">{curLabel(data.method.currency)}</span> · <span className="font-mono">{data.method.address}</span></p>
        )}
      </div>

      <div className="bg-[#3cac3b]/5 border border-[#3cac3b]/20 rounded-2xl p-4 mb-5">
        <p className="text-[13px] font-black text-gray-800 uppercase tracking-wider mb-2">How payouts work</p>
        <ul className="space-y-2 text-[13px] text-gray-600 leading-relaxed">
          <li>Payouts go out twice a month — around the 15th and the end of the month.</li>
          <li>The minimum payout is {money(5)}. Anything below that rolls over into your next payment.</li>
          <li>You’re paid in cryptocurrency to the wallet you save above. The network has to match the address — USDT on TRC20 needs a TRC20 wallet, and so on.</li>
          <li className="text-red-600"><b>Double-check your wallet address.</b> Crypto transfers can’t be reversed. If you save a wrong or incompatible address, any funds sent there can be lost and are not recoverable — that is your responsibility, so please cross-check it before you save.</li>
          <li>If a payment fails, you’ll see the reason at the top of your dashboard and on the payment below. Fix the issue (usually the wallet) and we’ll retry it on the next cycle.</li>
        </ul>
      </div>

      <Link href="/partner/history" className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-200 p-4 hover:border-[#3cac3b]/40 transition-colors">
        <div>
          <p className="text-[13px] font-black text-gray-700">Payment history</p>
          <p className="text-[12px] text-gray-400">See every payout, status, address and proof in detail.</p>
        </div>
        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
