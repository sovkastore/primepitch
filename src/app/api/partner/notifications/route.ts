import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

type Item = { id: string; kind: string; title: string; body: string; at: string; href: string };

const money = (n: unknown) => "$" + (Number(n) || 0).toFixed(2);

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB");

    const [failsRes, ticketsRes, dbNotifs] = await Promise.all([
      d1.prepare("SELECT id, amount, fail_reason, updated_at FROM d1_partner_payouts WHERE partner_id = ? AND status = 'failed' AND fail_reason IS NOT NULL ORDER BY updated_at DESC").bind(sess.pid).all(),
      d1.prepare("SELECT id, subject, updated_at as last_message_at FROM d1_support_tickets WHERE requester_type = 'partner' AND requester_id = ? AND status = 'answered' ORDER BY updated_at DESC").bind(sess.pid).all(),
      d1.prepare("SELECT id, type, title, message as body, created_at as at, read FROM d1_partner_notifications WHERE partner_id = ? ORDER BY created_at DESC").bind(sess.pid).all()
    ]);

    const items: Item[] = [];
    
    for (const f of failsRes.results ?? []) {
      const r = f as any;
      items.push({
        id: `payout_${r.id}`,
        kind: "payout_failed",
        title: `Payout of ${money(r.amount)} couldn’t be sent`,
        body: r.fail_reason,
        at: r.updated_at,
        href: "/partner/history",
      });
    }
    
    for (const t of ticketsRes.results ?? []) {
      const r = t as any;
      items.push({
        id: `ticket_${r.id}`,
        kind: "support",
        title: "Support replied to your ticket",
        body: r.subject,
        at: r.last_message_at,
        href: "/partner/support",
      });
    }
    
    let unreadCount = 0;
    for (const n of dbNotifs.results ?? []) {
      const r = n as any;
      items.push({
        id: `notif_${r.id}`,
        kind: r.type,
        title: r.title,
        body: r.body,
        at: r.at,
        href: r.type === "support" ? "/partner/support" : "/partner",
      });
      if (!r.read) unreadCount++;
    }
    
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const supportUnread = (ticketsRes.results ?? []).length;
    const unread = unreadCount + supportUnread; 

    return NextResponse.json({ items, unread, supportUnread });
  } catch {
    return NextResponse.json({ items: [], unread: 0, supportUnread: 0 });
  }
}

export async function POST(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const d1 = await getD1();
    if (d1) {
      await d1.prepare("UPDATE d1_partner_notifications SET read = 1 WHERE partner_id = ?").bind(sess.pid).run();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
