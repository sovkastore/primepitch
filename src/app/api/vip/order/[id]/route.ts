import { NextResponse, type NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { USER_COOKIE, resolveUser, toMe } from "@/lib/user-auth";
import { coinById } from "@/lib/vip";
import { npGetPayment } from "@/lib/nowpayments";
import { applyPaymentStatus, type OrderRow } from "@/lib/vip-orders";

export const dynamic = "force-dynamic";

// The page polls this while the person is on the "send the coins" screen. If
// NOWPayments' webhook hasn't reached us yet, we ask NOWPayments directly, so
// the person is never stuck waiting on a delayed callback.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await resolveUser(request.cookies.get(USER_COOKIE)?.value);
  if (!r.ok) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const { id } = await ctx.params;

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  let order = await d1.prepare(`SELECT * FROM d1_vip_orders WHERE id = ? AND user_id = ?`).bind(id, r.user.id).first<OrderRow>();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const terminal = ["finished", "failed", "refunded", "expired"];
  if (!terminal.includes(order.status) && order.payment_id) {
    try {
      const p = await npGetPayment(order.payment_id);
      if (p.payment_status && p.payment_status !== order.status) {
        order = await applyPaymentStatus(order, p.payment_status, Number(p.actually_paid), p);
      }
    } catch { /* keep what we have */ }
  }

  // Fresh user row so vipUntil reflects an activation that just happened.
  const user = await d1.prepare(`SELECT id, email, vip_until FROM d1_users WHERE id = ?`).bind(r.user.id).first<{ id: string; email: string; vip_until: string | null }>();
  const coin = coinById(order.pay_currency);
  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      address: order.pay_address,
      amount: order.pay_amount,
      coin: order.pay_currency,
      symbol: coin?.symbol || order.pay_currency.toUpperCase(),
      network: coin?.network || "",
      priceUsd: order.price_usd,
      actuallyPaid: order.actually_paid,
      activatedAt: order.activated_at,
      createdAt: order.created_at,
    },
    me: user ? toMe(user) : toMe(r.user),
  }, { headers: { "Cache-Control": "no-store" } });
}
