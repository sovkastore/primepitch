import { NextResponse, type NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { USER_COOKIE, resolveUser } from "@/lib/user-auth";
import { planById, coinById } from "@/lib/vip";
import { NpError, npCreatePayment, npEstimate, npMinAmount } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";

const IPN_URL = "https://primepitchsports.cc/api/vip/nowpayments/ipn";

// POST { plan: "1m" | "3m", coin: "usdttrc20" | ... }
// Creates an order and asks NOWPayments for a fresh address for it.
export async function POST(request: NextRequest) {
  const r = await resolveUser(request.cookies.get(USER_COOKIE)?.value);
  if (!r.ok) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const plan = planById(body?.plan);
  const coin = coinById(body?.coin);
  if (!plan || !coin) return NextResponse.json({ error: "Pick a plan and a coin." }, { status: 400 });

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  // Reuse a live, unpaid order for the same plan + coin from the last 15 min so
  // a refresh doesn't mint a new address every time.
  const recent = await d1.prepare(
    `SELECT id, pay_address, pay_amount, pay_currency, payment_id, status, created_at
       FROM d1_vip_orders
      WHERE user_id = ? AND plan = ? AND pay_currency = ? AND status = 'waiting'
        AND created_at > datetime('now', '-15 minutes')
      ORDER BY created_at DESC LIMIT 1`
  ).bind(r.user.id, plan.id, coin.id).first<any>();
  if (recent?.pay_address) {
    return NextResponse.json({ order: shape(recent, plan.priceUsd) });
  }

  // Too small for this coin? Say so before NOWPayments does, with the number.
  try {
    const [min, est] = await Promise.all([npMinAmount(coin.id), npEstimate(plan.priceUsd, coin.id)]);
    if (Number.isFinite(min) && Number.isFinite(est) && est < min) {
      return NextResponse.json({
        error: `$${plan.priceUsd} is below the smallest ${coin.symbol} payment the network allows (${min} ${coin.symbol}). Choose USDT on TRC20, TRX or LTC instead.`,
        code: "TOO_SMALL",
      }, { status: 400 });
    }
  } catch { /* best-effort — NOWPayments will reject it anyway if too small */ }

  const id = crypto.randomUUID();
  let p;
  try {
    p = await npCreatePayment({
      priceUsd: plan.priceUsd,
      payCurrency: coin.id,
      orderId: id,
      description: `PrimePitch VIP ${plan.label}`,
      ipnUrl: IPN_URL,
    });
  } catch (e) {
    const msg = e instanceof NpError ? e.message : "Could not start the payment. Try again.";
    return NextResponse.json({ error: friendly(msg) }, { status: 502 });
  }

  await d1.prepare(
    `INSERT INTO d1_vip_orders (id, user_id, plan, months, price_usd, pay_currency, pay_amount, pay_address, payment_id, status, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, r.user.id, plan.id, plan.months, plan.priceUsd, coin.id,
    Number(p.pay_amount) || null, p.pay_address || null, String(p.payment_id || ""),
    p.payment_status || "waiting", JSON.stringify(p).slice(0, 4000),
  ).run();

  return NextResponse.json({
    order: shape({ id, pay_address: p.pay_address, pay_amount: p.pay_amount, pay_currency: coin.id, payment_id: p.payment_id, status: p.payment_status || "waiting", created_at: new Date().toISOString() }, plan.priceUsd),
  });
}

function shape(o: any, priceUsd: number) {
  const coin = coinById(o.pay_currency);
  return {
    id: o.id,
    address: o.pay_address,
    amount: Number(o.pay_amount),
    coin: o.pay_currency,
    symbol: coin?.symbol || String(o.pay_currency).toUpperCase(),
    network: coin?.network || "",
    priceUsd,
    status: o.status,
    createdAt: o.created_at,
  };
}

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("min") && m.includes("amount")) return "This amount is too small for that coin. Choose USDT on TRC20, TRX or LTC instead.";
  if (m.includes("currency") && (m.includes("not") || m.includes("unavailable"))) return "That coin isn't available right now. Pick another one.";
  return msg;
}
