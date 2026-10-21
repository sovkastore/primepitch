import { getD1 } from "@/lib/d1";
import { grantVip } from "@/lib/user-auth";
import { planById } from "@/lib/vip";
import { npIsPaid } from "@/lib/nowpayments";

export type OrderRow = {
  id: string;
  user_id: string;
  plan: string;
  months: number;
  price_usd: number;
  pay_currency: string;
  pay_amount: number | null;
  pay_address: string | null;
  payment_id: string | null;
  status: string;
  actually_paid: number | null;
  activated_at: string | null;
  raw: string | null;
  created_at: string;
  updated_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Record a status NOWPayments reported for an order, and switch VIP on the
// first time it reads as paid. Safe to call repeatedly (IPN retries, polling).
export async function applyPaymentStatus(order: OrderRow, status: string, actuallyPaid?: number | null, raw?: unknown): Promise<OrderRow> {
  const d1 = await getD1();
  if (!d1) return order;
  const now = new Date().toISOString();
  const paidNow = npIsPaid(status) && !order.activated_at;

  let activatedAt = order.activated_at;
  if (paidNow) {
    const plan = planById(order.plan);
    const days = plan?.days ?? order.months * 30;
    await grantVip(order.user_id, days * DAY_MS);
    activatedAt = now;
  }

  // Never let a later, weaker status (e.g. a stray "confirming" after
  // "finished") undo an activation — keep the strongest status seen.
  const nextStatus = order.activated_at && !npIsPaid(status) ? order.status : status;

  await d1.prepare(
    `UPDATE d1_vip_orders SET status = ?, actually_paid = COALESCE(?, actually_paid), activated_at = ?, raw = COALESCE(?, raw), updated_at = ? WHERE id = ?`
  ).bind(
    nextStatus,
    typeof actuallyPaid === "number" && Number.isFinite(actuallyPaid) ? actuallyPaid : null,
    activatedAt,
    raw ? JSON.stringify(raw).slice(0, 4000) : null,
    now,
    order.id,
  ).run();

  return { ...order, status: nextStatus, activated_at: activatedAt, actually_paid: actuallyPaid ?? order.actually_paid };
}

// Admin: treat an order as paid by hand (e.g. partially paid but close enough).
export async function activateOrderManually(order: OrderRow): Promise<OrderRow> {
  return applyPaymentStatus(order, "finished", order.actually_paid, { manual: true, at: new Date().toISOString() });
}
