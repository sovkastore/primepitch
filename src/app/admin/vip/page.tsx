"use client";

import { useCallback, useEffect, useState } from "react";
import { VIP_PLANS, coinById } from "@/lib/vip";

type User = {
  id: string; email: string; vip_until: string | null; status: string; note: string | null;
  created_at: string; last_login_at: string | null; session_at: string | null; session_ua: string | null;
  paid_orders: number; paid_usd: number; vip: boolean; online: boolean;
};
type Order = {
  id: string; user_id: string; email: string | null; plan: string; months: number; price_usd: number;
  pay_currency: string; pay_amount: number | null; pay_address: string | null; payment_id: string | null;
  status: string; actually_paid: number | null; activated_at: string | null; created_at: string; updated_at: string;
};
type Stats = { users: number; active_vip: number; revenue_usd: number; open_orders: number };
type Data = { live: boolean; stats: Stats; users: User[]; orders: Order[] };

const DURATIONS: { label: string; hours: number }[] = [
  { label: "12 hours", hours: 12 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "1 month", hours: 24 * 30 },
  { label: "2 months", hours: 24 * VIP_PLANS["2m"].days },
  { label: "4 months", hours: 24 * VIP_PLANS["4m"].days },
];

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function left(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.round(ms / 3_600_000);
  if (h < 48) return `${h}h left`;
  return `${Math.round(h / 24)}d left`;
}

const STATUS_TONE: Record<string, string> = {
  finished: "bg-emerald-100 text-emerald-800", confirmed: "bg-emerald-100 text-emerald-800", sending: "bg-emerald-100 text-emerald-800",
  waiting: "bg-gray-100 text-gray-600", confirming: "bg-amber-100 text-amber-800", partially_paid: "bg-amber-100 text-amber-800",
  expired: "bg-gray-100 text-gray-400", failed: "bg-red-100 text-red-700", refunded: "bg-red-100 text-red-700",
};

export default function AdminVipPage() {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"users" | "orders">("users");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [np, setNp] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);

  // New account form
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newHours, setNewHours] = useState<number>(0);

  const load = useCallback(async (query = q) => {
    try {
      const r = await fetch(`/api/admin/vip?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    }
  }, [q]);

  useEffect(() => { load(""); }, [load]);

  async function act(body: Record<string, unknown>, okMsg: string) {
    setBusy(String(body.action) + (body.userId || body.orderId || ""));
    setMsg(null); setErr(null);
    try {
      const r = await fetch("/api/admin/vip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Failed");
      setMsg(okMsg);
      await load();
      return d;
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function checkNp() {
    setNp({ loading: true });
    try {
      const r = await fetch("/api/admin/vip?action=np_check", { cache: "no-store" });
      setNp(await r.json());
    } catch (e: any) {
      setNp({ ok: false, error: e?.message });
    }
  }

  const s = data?.stats;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900">VIP</h1>
        <p className="text-[13px] text-gray-500">Accounts, payments, and who gets the ad-free site. Payments come in through NOWPayments and switch VIP on by themselves; everything here is for the exceptions.</p>
      </div>

      {/* Launch switch */}
      <section className={`rounded-2xl border p-4 shadow-sm flex items-center justify-between gap-3 ${data?.live ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">{data?.live ? "VIP is LIVE" : "VIP is hidden"}</h2>
          <p className="text-[12px] text-gray-600">
            {data?.live
              ? "Visitors can see /vip, the menu and footer links, and pay."
              : "Visitors get a 404 on /vip and see no links. You (admin) can still open /vip and test the whole flow. Flip this on when the NOWPayments wallets are in."}
          </p>
        </div>
        <button
          disabled={!data || !!busy}
          onClick={() => { const next = !data?.live; if (confirm(next ? "Make VIP visible to everyone now?" : "Hide VIP from visitors?")) act({ action: "set_live", live: next }, next ? "VIP is live" : "VIP hidden"); }}
          className={`shrink-0 rounded-xl px-4 py-2 text-[13px] font-black text-white ${data?.live ? "bg-gray-900" : "bg-emerald-600"} disabled:opacity-50`}
        >{data?.live ? "Hide" : "Go live"}</button>
      </section>

      {err && <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-[13px] text-red-700">{err}</div>}
      {msg && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-800">{msg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Accounts" value={s?.users ?? "—"} />
        <Tile label="Active VIP" value={s?.active_vip ?? "—"} />
        <Tile label="Revenue" value={s ? `$${Number(s.revenue_usd).toFixed(2)}` : "—"} sub="confirmed payments" />
        <Tile label="Open orders" value={s?.open_orders ?? "—"} sub="waiting / confirming" />
      </div>

      {/* NOWPayments check */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-gray-900">NOWPayments</h2>
            <p className="text-[12px] text-gray-500">Checks the API key works, which coins NOWPayments offers, and each coin&rsquo;s smallest accepted payment. Amber = too small for the $10 plan (the $15 plan still works).</p>
          </div>
          <button onClick={checkNp} className="rounded-xl bg-gray-900 text-white text-[12px] font-bold px-3 py-2">Check</button>
        </div>
        {np?.loading && <p className="text-[12px] text-gray-400">Checking…</p>}
        {np && !np.loading && (
          np.ok ? (
            <div className="flex flex-wrap gap-1.5">
              {np.coins.map((c: any) => (
                <span key={c.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${!c.available ? "bg-red-100 text-red-700" : c.minUsd != null && c.minUsd > VIP_PLANS["2m"].priceUsd ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {c.symbol} · {c.network.split(" · ")[0]}{c.minUsd != null ? ` · min $${c.minUsd.toFixed(2)}` : ""}
                </span>
              ))}
            </div>
          ) : <p className="text-[12px] font-semibold text-red-600">{np.error}</p>
        )}
      </section>

      {/* Create account */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-[14px] font-bold text-gray-900">Create an account by hand</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email" className="rounded-xl border border-gray-200 px-3 py-2 text-[13px]" />
          <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="password (6+)" className="rounded-xl border border-gray-200 px-3 py-2 text-[13px]" />
          <select value={newHours} onChange={(e) => setNewHours(Number(e.target.value))} className="rounded-xl border border-gray-200 px-3 py-2 text-[13px]">
            <option value={0}>No VIP</option>
            {DURATIONS.map((d) => <option key={d.hours} value={d.hours}>VIP {d.label}</option>)}
          </select>
          <button
            disabled={!newEmail || newPw.length < 6 || !!busy}
            onClick={async () => { const d = await act({ action: "create_user", email: newEmail, password: newPw, hours: newHours }, "Account created"); if (d?.ok) { setNewEmail(""); setNewPw(""); setNewHours(0); } }}
            className="rounded-xl bg-emerald-600 text-white text-[13px] font-bold px-3 py-2 disabled:opacity-50"
          >Create</button>
        </div>
      </section>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(q); }}
          placeholder="Search email, payment id…" className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[13px]"
        />
        <button onClick={() => load(q)} className="rounded-xl bg-gray-900 text-white text-[12px] font-bold px-3 py-2">Search</button>
        <div className="flex rounded-xl bg-gray-100 p-1 text-[12px] font-bold">
          {(["users", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg ${tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
              {t === "users" ? `Accounts (${data?.users.length ?? 0})` : `Payments (${data?.orders.length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {tab === "users" && (
        <div className="space-y-2">
          {!data && <p className="text-[13px] text-gray-400">Loading…</p>}
          {data?.users.length === 0 && <p className="text-[13px] text-gray-400">No accounts yet.</p>}
          {data?.users.map((u) => {
            const isOpen = open === u.id;
            return (
              <div key={u.id} className={`rounded-2xl border bg-white shadow-sm ${u.status !== "active" ? "border-red-200" : u.vip ? "border-amber-300" : "border-gray-200"}`}>
                <button onClick={() => setOpen(isOpen ? null : u.id)} className="w-full text-left p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-gray-900 truncate">{u.email}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Joined {fmt(u.created_at)}</span>
                      <span>Last login {fmt(u.last_login_at)}</span>
                      {u.paid_orders > 0 && <span>Paid ${Number(u.paid_usd).toFixed(2)} · {u.paid_orders}×</span>}
                      {u.note && <span className="text-gray-400 italic">{u.note}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {u.status !== "active" ? (
                      <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-bold">disabled</span>
                    ) : u.vip ? (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">VIP · {left(u.vip_until)}</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px] font-bold">not VIP</span>
                    )}
                    {u.vip && <div className="text-[11px] text-gray-400 mt-1">until {fmt(u.vip_until)}</div>}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 p-4 space-y-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Give VIP (adds on top of what&rsquo;s left)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATIONS.map((d) => (
                          <button key={d.hours} disabled={!!busy} onClick={() => act({ action: "grant", userId: u.id, hours: d.hours }, `Added ${d.label} to ${u.email}`)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-bold text-gray-800 hover:border-emerald-400 disabled:opacity-50">+{d.label}</button>
                        ))}
                        <CustomHours disabled={!!busy} onGrant={(h) => act({ action: "grant", userId: u.id, hours: h }, `Added ${h}h to ${u.email}`)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {u.vip && <button disabled={!!busy} onClick={() => { if (confirm(`Remove VIP from ${u.email} now?`)) act({ action: "revoke", userId: u.id }, "VIP removed"); }} className="rounded-xl bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 text-[12px] font-bold">Remove VIP</button>}
                      <button disabled={!!busy} onClick={() => act({ action: "kick", userId: u.id }, "Signed out everywhere")} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700">Sign out everywhere</button>
                      {u.status === "active"
                        ? <button disabled={!!busy} onClick={() => { if (confirm(`Disable ${u.email}? They won't be able to log in.`)) act({ action: "disable", userId: u.id }, "Account disabled"); }} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700">Disable account</button>
                        : <button disabled={!!busy} onClick={() => act({ action: "enable", userId: u.id }, "Account enabled")} className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-[12px] font-bold">Enable account</button>}
                      <button disabled={!!busy} onClick={() => { const pw = prompt("New password (6+ characters):"); if (pw) act({ action: "set_password", userId: u.id, password: pw }, "Password changed — they'll need to log in again"); }} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700">Set password</button>
                      <button disabled={!!busy} onClick={() => { const n = prompt("Note on this account:", u.note || ""); if (n !== null) act({ action: "note", userId: u.id, note: n }, "Note saved"); }} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700">Note</button>
                    </div>
                    <p className="text-[11px] text-gray-400">Last device: {u.session_ua || "—"} · session {fmt(u.session_at)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-2">
          {data?.orders.length === 0 && <p className="text-[13px] text-gray-400">No payments yet.</p>}
          {data?.orders.map((o) => {
            const coin = coinById(o.pay_currency);
            const pending = ["waiting", "confirming", "partially_paid"].includes(o.status);
            return (
              <div key={o.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-gray-900 truncate">{o.email || o.user_id}</div>
                    <div className="text-[12px] text-gray-500">
                      {VIP_PLANS[o.plan as keyof typeof VIP_PLANS]?.label || o.plan} · ${o.price_usd} · {o.pay_amount} {coin?.symbol || o.pay_currency.toUpperCase()} ({coin?.network.split(" · ")[0]})
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{fmt(o.created_at)} · payment {o.payment_id || "—"}{o.actually_paid != null ? ` · received ${o.actually_paid}` : ""}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[o.status] || "bg-gray-100 text-gray-600"}`}>{o.status.replace("_", " ")}</span>
                </div>
                {o.pay_address && <div className="font-mono text-[11px] text-gray-500 break-all">{o.pay_address}</div>}
                <div className="flex flex-wrap gap-1.5">
                  {!o.activated_at && (
                    <button disabled={!!busy} onClick={() => { if (confirm(`Mark this order as paid and give ${o.email} ${o.months} month(s) VIP?`)) act({ action: "activate_order", orderId: o.id }, "Order activated"); }} className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-[12px] font-bold">Mark paid & activate</button>
                  )}
                  {pending && o.payment_id && (
                    <button disabled={!!busy} onClick={() => act({ action: "recheck_order", orderId: o.id }, "Checked with NOWPayments")} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700">Re-check</button>
                  )}
                  {o.activated_at && <span className="text-[11px] text-emerald-700 font-semibold self-center">activated {fmt(o.activated_at)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-[26px] font-extrabold tracking-tight text-gray-900">{value}</p>
      {sub && <p className="text-[12px] text-gray-500">{sub}</p>}
    </div>
  );
}

function CustomHours({ disabled, onGrant }: { disabled: boolean; onGrant: (hours: number) => void }) {
  const [v, setV] = useState("");
  const [unit, setUnit] = useState<"h" | "d">("d");
  const n = Number(v);
  const hours = unit === "d" ? n * 24 : n;
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="custom" className="w-20 rounded-xl border border-gray-200 px-2 py-1.5 text-[12px]" />
      <select value={unit} onChange={(e) => setUnit(e.target.value as "h" | "d")} className="rounded-xl border border-gray-200 px-2 py-1.5 text-[12px]">
        <option value="h">hours</option>
        <option value="d">days</option>
      </select>
      <button disabled={disabled || !(hours > 0)} onClick={() => { onGrant(hours); setV(""); }} className="rounded-xl bg-gray-900 text-white px-3 py-1.5 text-[12px] font-bold disabled:opacity-50">Add</button>
    </span>
  );
}
