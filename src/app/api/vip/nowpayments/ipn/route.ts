import { NextResponse, type NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { npVerifyIpn } from "@/lib/nowpayments";
import { applyPaymentStatus, type OrderRow } from "@/lib/vip-orders";

export const dynamic = "force-dynamic";

// NOWPayments calls this whenever a payment changes state. The signature
// proves it really is NOWPayments; the order is found by our order_id (or the
// payment_id as a fallback) and VIP is switched on when it reads as paid.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const { ok, payload } = await npVerifyIpn(raw, request.headers.get("x-nowpayments-sig"));
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "db" }, { status: 503 });

  const orderId = String(payload?.order_id || "");
  const paymentId = String(payload?.payment_id || "");
  const status = String(payload?.payment_status || "");
  if (!status) return NextResponse.json({ error: "no status" }, { status: 400 });

  let order: OrderRow | null = null;
  if (orderId) order = await d1.prepare(`SELECT * FROM d1_vip_orders WHERE id = ?`).bind(orderId).first<OrderRow>();
  if (!order && paymentId) order = await d1.prepare(`SELECT * FROM d1_vip_orders WHERE payment_id = ?`).bind(paymentId).first<OrderRow>();
  if (!order) return NextResponse.json({ error: "unknown order" }, { status: 404 });

  await applyPaymentStatus(order, status, Number(payload?.actually_paid), payload);
  return NextResponse.json({ ok: true });
}

// NOWPayments' dashboard "test" button and curious browsers hit this with GET.
export function GET() {
  return NextResponse.json({ ok: true, endpoint: "nowpayments-ipn" });
}
