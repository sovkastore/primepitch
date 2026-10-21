"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { VIP_PLANS, VIP_COINS, VIP_CONTACT, VIP_COPY, type PlanId, type CoinId } from "@/lib/vip";
import { qrModules, qrPath } from "@/lib/qr";

type Me = { id: string; email: string; vip: boolean; vipUntil: string | null };
type Order = {
  id: string;
  status: string;
  address: string | null;
  amount: number | null;
  coin: string;
  symbol: string;
  network: string;
  priceUsd: number;
  actuallyPaid?: number | null;
  activatedAt?: string | null;
};

const PAID = new Set(["finished", "confirmed", "sending"]);
const DEAD = new Set(["failed", "refunded", "expired"]);

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

export default function VipClient() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading
  const [kicked, setKicked] = useState(false);

  // Account form
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Checkout
  const [plan, setPlan] = useState<PlanId>("4m");
  const [coin, setCoin] = useState<CoinId | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState<"address" | "amount" | null>(null);
  // "plans" until the visitor taps Continue; then the sign-in sheet if they
  // have no account, then "pay" (coins + address).
  const [step, setStep] = useState<"plans" | "pay">("plans");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // NOWPayments' smallest accepted payment per coin, in USD (null = unknown).
  const [minUsd, setMinUsd] = useState<Record<string, number | null>>({});

  useEffect(() => {
    fetch("/api/vip/coins").then((r) => r.json()).then((d) => {
      const m: Record<string, number | null> = {};
      for (const c of d?.coins || []) m[c.id] = c.minUsd ?? null;
      setMinUsd(m);
    }).catch(() => {});
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const r = await fetch("/api/vip/me", { cache: "no-store" });
      const d = await r.json();
      if (d?.me) {
        setMe(d.me);
        setKicked(false);
      } else {
        setMe(null);
        if (d?.reason === "replaced") setKicked(true);
      }
    } catch {
      setMe((m) => (m === undefined ? null : m));
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  // Heartbeat: notices when this account has been signed in somewhere else.
  useEffect(() => {
    if (!me) return;
    const t = setInterval(refreshMe, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") refreshMe(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [me, refreshMe]);

  async function submitAuth(e: FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const r = await fetch("/api/vip/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, email, password }),
      });
      const d = await r.json();
      if (!r.ok) { setAuthError(d?.error || "Something went wrong."); return; }
      setMe(d.me);
      setKicked(false);
      setPassword("");
      setSheetOpen(false);
      setStep("pay");
    } catch {
      setAuthError("Network error. Try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/vip/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => {});
    setMe(null);
    setOrder(null);
    setStep("plans");
  }

  function continueWithPlan() {
    setOrder(null);
    setCheckoutError(null);
    if (me) setStep("pay");
    else { setMode(kicked ? "login" : "signup"); setAuthError(null); setSheetOpen(true); }
  }

  async function startCheckout() {
    if (!coin) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const r = await fetch("/api/vip/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, coin }),
      });
      const d = await r.json();
      if (!r.ok) { setCheckoutError(d?.error || "Could not start the payment."); return; }
      setOrder(d.order);
    } catch {
      setCheckoutError("Network error. Try again.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  // Poll the order while we wait for the coins.
  const orderId = order?.id;
  const orderDone = !!order && (PAID.has(order.status) || DEAD.has(order.status));
  useEffect(() => {
    if (!orderId || orderDone) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/vip/order/${orderId}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (stop) return;
        if (d?.order) setOrder(d.order);
        if (d?.me) setMe(d.me);
      } catch { /* retry next tick */ }
    };
    const t = setInterval(tick, 10_000);
    tick();
    return () => { stop = true; clearInterval(t); };
  }, [orderId, orderDone]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function copy(text: string, what: "address" | "amount") {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(what);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }

  const selectedPlan = VIP_PLANS[plan];

  return (
    <div className="max-w-[720px] mx-auto px-4 lg:px-6 py-8 space-y-8">
      {/* ---- Pitch ---- */}
      <header className="space-y-5">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="font-semibold">Home</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide">
            <CrownIcon className="w-3.5 h-3.5" /> VIP
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">{VIP_COPY.headline}</h1>
        <ul className="space-y-4">
          {VIP_COPY.lines.map((l) => (
            <li key={l.title} className="flex gap-3">
              <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <div className="text-[14px] leading-relaxed text-gray-600">
                <span className="font-black text-gray-900">
                  {"href" in l && l.href ? <Link href={l.href} className="underline underline-offset-4 decoration-emerald-300 hover:decoration-emerald-500">{l.title}</Link> : l.title}
                </span>{" "}
                {l.body.split(/\*\*(.+?)\*\*/).map((part, i) => i % 2 === 1 ? <span key={i} className="font-black text-emerald-600">{part}</span> : part)}
                {"more" in l && l.more ? (
                  <>
                    {" "}
                    <button type="button" onClick={() => setMoreOpen(true)} className="font-bold text-emerald-700 underline underline-offset-4 decoration-emerald-300 hover:decoration-emerald-600">
                      Click to see more benefits
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </header>

      {moreOpen && (() => {
        const more = VIP_COPY.lines.find((l) => "more" in l && l.more)?.more;
        if (!more) return null;
        return (
          <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setMoreOpen(false)}>
            <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-black text-gray-900 leading-tight">{more.title}</h3>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[14px] text-gray-600 leading-relaxed">{more.intro}</p>
              <ul className="space-y-2.5">
                {more.items.map((it) => (
                  <li key={it} className="flex gap-2.5 text-[14px] text-gray-800 leading-snug">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                    {it}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-gray-500">{more.outro}</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="w-full h-11 rounded-2xl bg-gray-900 text-white font-black text-[14px]">Got it</button>
            </div>
          </div>
        );
      })()}

      {/* ---- Plans ---- */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-black text-gray-900">Plans</h2>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(VIP_PLANS) as PlanId[]).map((id) => {
            const p = VIP_PLANS[id];
            const active = plan === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setPlan(id); setOrder(null); setCheckoutError(null); if (coin && (minUsd[coin] ?? 0) > VIP_PLANS[id].priceUsd) setCoin(null); }}
                className={`relative text-left rounded-2xl border-2 p-4 transition-colors ${active ? "border-emerald-500 bg-emerald-50/60" : "border-gray-200 bg-white hover:border-gray-300"}`}
              >
                {id === "4m" && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-gray-900 text-white text-[10px] font-black uppercase tracking-wide px-2 py-0.5">Best value</span>
                )}
                <div className="text-[13px] font-bold text-gray-500">{p.label}</div>
                <div className="text-2xl font-black text-gray-900 mt-1">${p.priceUsd}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{id === "2m" ? "60 days · $5 / month" : "120 days · $3.75 / month"}</div>
              </button>
            );
          })}
        </div>
        {step === "plans" && (
          <button type="button" onClick={continueWithPlan} disabled={me === undefined} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 text-[15px] transition-colors disabled:opacity-60">
            Continue — {selectedPlan.label}, ${selectedPlan.priceUsd}
          </button>
        )}
        {me?.vip && (
          <p className="text-[12px] text-gray-500 text-center">Paying again adds time on top of your current VIP.</p>
        )}
      </section>

      {/* ---- Signed-in strip ---- */}
      {me && (
        <section className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${me.vip ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white" : "border-gray-200 bg-white"}`}>
          <div className="min-w-0">
            <div className="text-[12px] text-gray-500 truncate">{me.email}</div>
            {me.vip ? (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"><CrownIcon className="w-3 h-3" /> VIP active</span>
                <span className="text-[12px] font-semibold text-gray-700">{daysLeft(me.vipUntil)} days left · until {fmtDate(me.vipUntil)}</span>
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] font-bold text-gray-900">Not VIP yet</div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {me.vip && <Link href="/alt" className="text-[12px] font-bold text-emerald-700 underline underline-offset-4">VIP Streams</Link>}
            <button type="button" onClick={logout} className="text-[12px] font-bold text-gray-500 hover:text-gray-900 underline underline-offset-4">Log out</button>
          </div>
        </section>
      )}

      {/* ---- Pay ---- */}
      {me && step === "pay" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-black text-gray-900">Pay with crypto — {selectedPlan.label}, ${selectedPlan.priceUsd}</h2>
            {!order && <button type="button" onClick={() => setStep("plans")} className="text-[12px] font-bold text-gray-500 underline underline-offset-4">Change plan</button>}
          </div>

          {!order ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {VIP_COINS.map((c) => {
                  const active = coin === c.id;
                  const min = minUsd[c.id];
                  const tooSmall = min != null && min > selectedPlan.priceUsd;
                  return (
                    <button
                      key={c.id} type="button" disabled={tooSmall}
                      onClick={() => { setCoin(c.id); setCheckoutError(null); }}
                      className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${tooSmall ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed" : active ? "border-emerald-500 bg-emerald-50/60" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="text-[14px] font-black text-gray-900">{c.name} <span className="text-gray-400 font-bold">{c.symbol}</span></div>
                      <div className="text-[11px] text-gray-500">{c.network}</div>
                      {tooSmall && <div className="text-[10px] font-bold text-amber-700 mt-0.5">Min ${min.toFixed(0)} · {plan === "2m" ? "4-month plan only" : "not available"}</div>}
                    </button>
                  );
                })}
              </div>
              {VIP_COINS.some((c) => (minUsd[c.id] ?? 0) > selectedPlan.priceUsd) && (
                <p className="text-[12px] text-gray-500 leading-relaxed">Greyed-out coins have a network minimum above ${selectedPlan.priceUsd} — that&rsquo;s set by the payment network, not by us. {plan === "2m" ? "The 4-month plan works with all of them." : ""}</p>
              )}
              {checkoutError && <p className="text-[13px] font-semibold text-red-600 leading-relaxed">{checkoutError}</p>}
              <button type="button" onClick={startCheckout} disabled={!coin || checkoutBusy} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 text-[14px] disabled:opacity-50 transition-colors">
                {checkoutBusy ? "Getting your address…" : coin ? `Continue with ${VIP_COINS.find((c) => c.id === coin)?.symbol}` : "Pick a coin"}
              </button>
              <p className="text-[12px] text-gray-500 leading-relaxed">You get a payment address just for you. Send the exact amount and VIP switches on by itself, usually within a few minutes of the network confirming it.</p>
            </div>
          ) : PAID.has(order.status) ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-[15px]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Payment received — you&rsquo;re VIP.
              </div>
              <p className="text-[13px] text-emerald-900 leading-relaxed">Ads from PrimePitch are off on every page from your next load. <Link href="/alt" className="font-bold underline underline-offset-4">Open VIP Streams →</Link></p>
            </div>
          ) : DEAD.has(order.status) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
              <p className="text-[14px] font-black text-red-800">This payment {order.status === "expired" ? "expired" : "didn’t go through"}.</p>
              <p className="text-[13px] text-red-900 leading-relaxed">If you already sent coins, message us with your account email and we&rsquo;ll sort it out. Otherwise start again.</p>
              <button type="button" onClick={() => setOrder(null)} className="rounded-xl bg-gray-900 text-white font-black px-4 py-2.5 text-[13px]">Start again</button>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-bold uppercase tracking-wide text-gray-400">Send exactly</div>
                  <div className="text-xl font-black text-gray-900 break-all">{order.amount} {order.symbol}</div>
                  <div className="text-[12px] text-gray-500">{order.network} · ${order.priceUsd} plan + network &amp; processing fee</div>
                </div>
                <button type="button" onClick={() => copy(String(order.amount), "amount")} className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-bold text-gray-700">{copied === "amount" ? "Copied" : "Copy"}</button>
              </div>

              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide text-gray-400 mb-1">To this address</div>
                {order.address && <AddressQr text={order.address} />}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 font-mono text-[13px] break-all text-gray-900 leading-relaxed">{order.address}</div>
                <button type="button" onClick={() => order.address && copy(order.address, "address")} className="mt-2 w-full rounded-xl bg-gray-900 text-white font-black py-3 text-[14px]">{copied === "address" ? "Address copied" : "Copy address"}</button>
              </div>

              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" /></span>
                {order.status === "waiting" ? "Waiting for your payment…" : order.status === "partially_paid" ? "Received less than the amount — send the rest to the same address." : "Payment seen — waiting for the network to confirm…"}
              </div>

              <ul className="text-[12px] text-gray-500 leading-relaxed space-y-1 list-disc pl-4">
                <li>Send on the <strong>{order.network.split(" · ")[0]}</strong> network only. The wrong network loses the coins.</li>
                <li>Your wallet&rsquo;s network fee is separate — the amount above must arrive in full.</li>
                <li>This address is valid for about 20 minutes. Keep this page open, or come back and check your account.</li>
              </ul>

              <button type="button" onClick={() => setOrder(null)} className="text-[12px] font-bold text-gray-500 underline underline-offset-4">Choose a different coin</button>
            </div>
          )}
        </section>
      )}

      {/* ---- Sign-in sheet ---- */}
      {sheetOpen && !me && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setSheetOpen(false)}>
          <form onSubmit={submitAuth} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-black text-gray-900">{mode === "signup" ? "Create your account" : "Log in"}</h2>
                <p className="text-[12px] text-gray-500 mt-0.5">{selectedPlan.label} VIP · ${selectedPlan.priceUsd}. Your VIP lives on this account.</p>
              </div>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {kicked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 leading-relaxed">
                <strong>This account was signed in on another device.</strong> Only one person can use a VIP account at a time — logging in here signs that device out.
              </div>
            )}
            <div className="flex rounded-xl bg-gray-100 p-1 text-[13px] font-bold">
              {(["signup", "login"] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setMode(m); setAuthError(null); }} className={`flex-1 rounded-lg py-2 transition-colors ${mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
                  {m === "signup" ? "Create account" : "Log in"}
                </button>
              ))}
            </div>
            <input
              type="email" required autoComplete="email" inputMode="email" placeholder="Email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-emerald-500"
            />
            <input
              type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[15px] outline-none focus:border-emerald-500"
            />
            {authError && <p className="text-[13px] font-semibold text-red-600">{authError}</p>}
            <button type="submit" disabled={authBusy} className="w-full rounded-xl bg-gray-900 text-white font-black py-3 text-[14px] disabled:opacity-60">
              {authBusy ? "One moment…" : mode === "signup" ? "Create account & continue" : "Log in & continue"}
            </button>
            {mode === "login" ? (
              <p className="text-[12px] text-gray-500 leading-relaxed">
                Forgot your password? Message us on{" "}
                <a href={VIP_CONTACT.telegram} target="_blank" rel="noopener noreferrer" className="font-bold text-gray-800 underline underline-offset-4">Telegram</a>{" "}
                or{" "}
                <a href={VIP_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className="font-bold text-gray-800 underline underline-offset-4">WhatsApp</a>{" "}
                with your account email and we&rsquo;ll reset it.
              </p>
            ) : (
              <p className="text-[12px] text-gray-500 leading-relaxed">
                One person at a time: if someone else logs in with your account, the first device is signed out.
              </p>
            )}
          </form>
        </div>
      )}

      {/* ---- Contact ---- */}
      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
        <h2 className="text-[15px] font-black text-gray-900">Want to pay another way, or need help?</h2>
        <p className="text-[13px] text-gray-600 leading-relaxed">Message us and we&rsquo;ll sort it out. Include the email on your account.</p>
        <div className="grid grid-cols-2 gap-2">
          <a href={VIP_CONTACT.telegram} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] text-white font-black py-3 text-[13px]">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg>
            Telegram
          </a>
          <a href={VIP_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white font-black py-3 text-[13px]">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.3 5.3 0 0 0 3.2.6 2.7 2.7 0 0 0 1.8-1.3c.2-.4.2-.8.2-.9l-.3-.2Z" /></svg>
            WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}

// The address as a QR code so a phone wallet can scan it from a desktop screen.
function AddressQr({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    try { return qrPath(qrModules(text)); } catch { return { path: "", size: 0 }; }
  }, [text]);
  if (!path) return null;
  const quiet = 2;
  return (
    <div className="flex justify-center mb-3">
      <svg
        viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
        className="w-44 h-44 rounded-xl border border-gray-200 bg-white"
        shapeRendering="crispEdges"
        role="img"
        aria-label="Payment address QR code"
      >
        <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
        <path d={path} fill="#111827" />
      </svg>
    </div>
  );
}

function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
    </svg>
  );
}
