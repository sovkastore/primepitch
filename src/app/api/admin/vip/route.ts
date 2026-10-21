import { NextResponse, type NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";
import { grantVip, hashPassword, normalizeEmail, isValidEmail, vipActive } from "@/lib/user-auth";
import { VIP_COINS } from "@/lib/vip";
import { npConfigured, npCurrencies, npStatus, npGetPayment, npMinAmount } from "@/lib/nowpayments";
import { activateOrderManually, applyPaymentStatus, type OrderRow } from "@/lib/vip-orders";
import { isVipLive, setVipLive } from "@/lib/vip-live";

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;

// GET ?q=search&tab=users|orders   — lists
// GET ?action=np_check             — is NOWPayments reachable, which coins work
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const sp = request.nextUrl.searchParams;
  if (sp.get("action") === "np_check") {
    try {
      if (!(await npConfigured())) return NextResponse.json({ ok: false, error: "API key or IPN secret missing on the worker." });
      const [st, cur] = await Promise.all([npStatus(), npCurrencies()]);
      const have = new Set((cur.currencies || []).map((c) => String(c).toLowerCase()));
      // Each coin's smallest accepted payment (same-coin payout), in USD, so
      // it is obvious which coins can take the $5 plan.
      const mins = await Promise.all(VIP_COINS.map(async (c) => {
        try { return await npMinAmount(c.id); } catch { return { min: NaN, usd: NaN }; }
      }));
      const coins = VIP_COINS.map((c, i) => ({
        id: c.id, symbol: c.symbol, network: c.network, available: have.has(c.id),
        min: Number.isFinite(mins[i].min) ? mins[i].min : null,
        minUsd: Number.isFinite(mins[i].usd) ? mins[i].usd : null,
      }));
      return NextResponse.json({ ok: true, status: st?.message || "OK", coins });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "NOWPayments error" });
    }
  }

  const q = (sp.get("q") || "").trim().toLowerCase();
  const like = `%${q}%`;

  const users = await d1.prepare(
    `SELECT u.id, u.email, u.vip_until, u.status, u.note, u.created_at, u.last_login_at, u.session_at, u.session_ua,
            (SELECT COUNT(*) FROM d1_vip_orders o WHERE o.user_id = u.id AND o.activated_at IS NOT NULL) AS paid_orders,
            (SELECT COALESCE(SUM(price_usd),0) FROM d1_vip_orders o WHERE o.user_id = u.id AND o.activated_at IS NOT NULL) AS paid_usd
       FROM d1_users u
      WHERE (? = '' OR u.email LIKE ?)
      ORDER BY u.created_at DESC LIMIT 200`
  ).bind(q, like).all();

  const orders = await d1.prepare(
    `SELECT o.id, o.user_id, u.email, o.plan, o.months, o.price_usd, o.pay_currency, o.pay_amount, o.pay_address, o.payment_id,
            o.status, o.actually_paid, o.activated_at, o.created_at, o.updated_at,
            o.commission_usd, u.ref_code, (SELECT code FROM d1_partners p WHERE p.id = o.commission_partner_id) AS commission_partner
       FROM d1_vip_orders o LEFT JOIN d1_users u ON u.id = o.user_id
      WHERE (? = '' OR u.email LIKE ? OR o.payment_id LIKE ? OR o.id LIKE ?)
      ORDER BY o.created_at DESC LIMIT 200`
  ).bind(q, like, like, like).all();

  const stats = await d1.prepare(
    `SELECT
       (SELECT COUNT(*) FROM d1_users) AS users,
       (SELECT COUNT(*) FROM d1_users WHERE vip_until > ?) AS active_vip,
       (SELECT COALESCE(SUM(price_usd),0) FROM d1_vip_orders WHERE activated_at IS NOT NULL) AS revenue_usd,
       (SELECT COUNT(*) FROM d1_vip_orders WHERE status IN ('waiting','confirming','partially_paid')) AS open_orders`
  ).bind(new Date().toISOString()).first();

  const now = Date.now();
  return NextResponse.json({
    live: await isVipLive(),
    stats,
    users: (users.results || []).map((u: any) => ({ ...u, vip: vipActive(u.vip_until), online: !!u.session_at && now - Date.parse(u.session_at) < 7 * 24 * HOUR_MS })),
    orders: orders.results || [],
  });
}

// POST { action, ... }
//   set_live     { live }                     launch switch
//   grant        { userId, hours }            add time (any amount)
//   set_until    { userId, until }            set the exact expiry (ISO) or null
//   revoke       { userId }                   VIP off now
//   kick         { userId }                   sign the account out everywhere
//   disable / enable { userId }
//   note         { userId, note }
//   set_password { userId, password }
//   create_user  { email, password, hours? }
//   activate_order { orderId }                treat as paid, switch VIP on
//   recheck_order  { orderId }                ask NOWPayments for the latest status
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  let b: any = {};
  try { b = await request.json(); } catch { /* empty */ }
  const action = String(b?.action || "");
  const userId = String(b?.userId || "");

  try {
    switch (action) {
      case "set_live": {
        await setVipLive(b?.live === true);
        return NextResponse.json({ ok: true, live: b?.live === true });
      }
      case "grant": {
        const hours = Number(b?.hours);
        if (!userId || !Number.isFinite(hours) || hours <= 0) return NextResponse.json({ error: "Need userId and hours > 0" }, { status: 400 });
        const until = await grantVip(userId, hours * HOUR_MS);
        return NextResponse.json({ ok: true, until });
      }
      case "set_until": {
        const until = b?.until ? new Date(String(b.until)) : null;
        if (!userId || (until && Number.isNaN(until.getTime()))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
        await d1.prepare(`UPDATE d1_users SET vip_until = ? WHERE id = ?`).bind(until ? until.toISOString() : null, userId).run();
        return NextResponse.json({ ok: true });
      }
      case "revoke": {
        await d1.prepare(`UPDATE d1_users SET vip_until = NULL WHERE id = ?`).bind(userId).run();
        return NextResponse.json({ ok: true });
      }
      case "kick": {
        await d1.prepare(`UPDATE d1_users SET session_id = NULL WHERE id = ?`).bind(userId).run();
        return NextResponse.json({ ok: true });
      }
      case "disable":
      case "enable": {
        await d1.prepare(`UPDATE d1_users SET status = ?, session_id = CASE WHEN ? = 'disabled' THEN NULL ELSE session_id END WHERE id = ?`)
          .bind(action === "disable" ? "disabled" : "active", action === "disable" ? "disabled" : "active", userId).run();
        return NextResponse.json({ ok: true });
      }
      case "note": {
        await d1.prepare(`UPDATE d1_users SET note = ? WHERE id = ?`).bind(String(b?.note || "").slice(0, 500), userId).run();
        return NextResponse.json({ ok: true });
      }
      case "set_password": {
        const pw = String(b?.password || "");
        if (pw.length < 6) return NextResponse.json({ error: "Password must be 6+ characters" }, { status: 400 });
        const { hash, salt } = await hashPassword(pw);
        await d1.prepare(`UPDATE d1_users SET password_hash = ?, salt = ?, session_id = NULL WHERE id = ?`).bind(hash, salt, userId).run();
        return NextResponse.json({ ok: true });
      }
      case "create_user": {
        const email = normalizeEmail(b?.email);
        const pw = String(b?.password || "");
        if (!isValidEmail(email)) return NextResponse.json({ error: "Bad email" }, { status: 400 });
        if (pw.length < 6) return NextResponse.json({ error: "Password must be 6+ characters" }, { status: 400 });
        const exists = await d1.prepare(`SELECT id FROM d1_users WHERE email = ?`).bind(email).first();
        if (exists) return NextResponse.json({ error: "That email already has an account" }, { status: 409 });
        const { hash, salt } = await hashPassword(pw);
        const id = crypto.randomUUID();
        await d1.prepare(`INSERT INTO d1_users (id, email, password_hash, salt, note) VALUES (?, ?, ?, ?, 'created by admin')`).bind(id, email, hash, salt).run();
        const hours = Number(b?.hours);
        if (Number.isFinite(hours) && hours > 0) await grantVip(id, hours * HOUR_MS);
        return NextResponse.json({ ok: true, id });
      }
      case "activate_order":
      case "recheck_order": {
        const orderId = String(b?.orderId || "");
        const order = await d1.prepare(`SELECT * FROM d1_vip_orders WHERE id = ?`).bind(orderId).first<OrderRow>();
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (action === "activate_order") {
          if (order.activated_at) return NextResponse.json({ ok: true, already: true });
          await activateOrderManually(order);
          return NextResponse.json({ ok: true });
        }
        if (!order.payment_id) return NextResponse.json({ error: "No payment id on this order" }, { status: 400 });
        const p = await npGetPayment(order.payment_id);
        const updated = await applyPaymentStatus(order, p.payment_status, Number(p.actually_paid), p);
        return NextResponse.json({ ok: true, status: updated.status, activated: !!updated.activated_at });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
