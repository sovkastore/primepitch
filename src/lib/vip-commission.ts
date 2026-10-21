import { getD1 } from "@/lib/d1";

// Partner commission on VIP sales: a VIP account created by a visitor who
// arrived through a partner link carries that partner's code for life. Each
// real payment on the account pays the partner VIP_COMMISSION_RATE of the
// plan price — straight into earned, balance AND approved, because the money
// is already in hand (unlike ad revenue, which waits for the network to pay).

export const VIP_COMMISSION_RATE = 0.2;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function commissionFor(priceUsd: number): number {
  return Math.round(priceUsd * VIP_COMMISSION_RATE * 100) / 100;
}

// Credit the partner for a paid order. Idempotent: one credit per order.
export async function creditVipCommission(order: { id: string; user_id: string; plan: string; price_usd: number }): Promise<void> {
  const d1 = await getD1();
  if (!d1) return;
  try {
    const already = await d1.prepare("SELECT order_id FROM d1_vip_commissions WHERE order_id = ?").bind(order.id).first();
    if (already) return;

    const u = await d1.prepare("SELECT ref_code FROM d1_users WHERE id = ?").bind(order.user_id).first<{ ref_code: string | null }>();
    const code = (u?.ref_code || "").trim().toLowerCase();
    if (!code) return;

    const p = await d1.prepare("SELECT id, active, banned FROM d1_partners WHERE code = ?").bind(code).first<{ id: string; active: number; banned: number }>();
    if (!p || !p.active || p.banned) return;

    const amount = commissionFor(num(order.price_usd));
    if (amount <= 0) return;
    const now = new Date().toISOString();

    await d1.prepare(
      "INSERT INTO d1_vip_commissions (order_id, partner_id, amount_usd, price_usd, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(order.id, p.id, amount, num(order.price_usd), order.plan, now).run();

    await d1.prepare("INSERT OR IGNORE INTO d1_partner_balances (partner_id, earned, approved, hold, paid, balance) VALUES (?, 0, 0, 0, 0, 0)").bind(p.id).run();
    await d1.prepare(
      "UPDATE d1_partner_balances SET earned = earned + ?, balance = balance + ?, approved = approved + ? WHERE partner_id = ?"
    ).bind(amount, amount, amount, p.id).run();

    await d1.prepare(
      "UPDATE d1_vip_orders SET commission_partner_id = ?, commission_usd = ?, commission_at = ? WHERE id = ?"
    ).bind(p.id, amount, now, order.id).run();
  } catch (e) {
    console.error("vip commission failed", e);
  }
}

// Totals for a partner's dashboard: how many VIP sales and how much earned.
export async function vipCommissionSummary(partnerId: string): Promise<{ sales: number; earned: number }> {
  const d1 = await getD1();
  if (!d1) return { sales: 0, earned: 0 };
  try {
    const r = await d1.prepare("SELECT COUNT(*) AS sales, COALESCE(SUM(amount_usd), 0) AS earned FROM d1_vip_commissions WHERE partner_id = ?")
      .bind(partnerId).first<{ sales: number; earned: number }>();
    return { sales: num(r?.sales), earned: num(r?.earned) };
  } catch {
    return { sales: 0, earned: 0 };
  }
}
