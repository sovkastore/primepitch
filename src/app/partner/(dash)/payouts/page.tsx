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
  completed: { label: "Completed", cls: "bg-[#3cac3b]/10 text-[#3cac3b]" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-600" },
};
const statusMeta = (s?: string) => STATUS[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-500" };

interface Payout {
  id: string; amount: number; currency: string | null; from_address: string | null; to_address: string | null;
  status: string; proof_link: string | null; proof_image: string | null; note: string | null; fail_reason: string | null; created_at: string;
}
interface PaymentsData {
  balances: { earned: number; hold: number; paid: number; balance: number };
  method: { currency: string | null; address: string | null };
  payouts: Payout[];
}

const short = (a?: string | null) => (!a ? "—" : a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

export default function PartnerPayouts() {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
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
    } catch { /* ignore */ } finally { setLoading(false); }
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
  const payouts = data?.payouts ?? [];
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
        Set the wallet we pay you to, and track your payment history.
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

      <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-2">Payment history</p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : payouts.length === 0 ? (
        <p className="text-sm text-gray-400">No payments yet. When we pay you, it’ll show up here.</p>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => {
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
                    {p.proof_link && <a href={p.proof_link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#3cac3b] hover:underline">View transaction ↗</a>}
                    {p.proof_image && <a href={p.proof_image} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#3cac3b] hover:underline">View screenshot ↗</a>}
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
