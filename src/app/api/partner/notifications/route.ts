import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

type Item = { id: string; kind: string; title: string; body: string; at: string; href: string };

const money = (n: unknown) => "$" + (Number(n) || 0).toFixed(2);

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabaseAdmin();
    const [failsRes, ticketsRes, partnerRes] = await Promise.all([
      sb.from("partner_payouts").select("id, amount, fail_reason, updated_at")
        .eq("partner_id", sess.pid).eq("status", "failed").not("fail_reason", "is", null)
        .order("updated_at", { ascending: false }),
      sb.from("support_tickets").select("id, subject, last_message_at")
        .eq("partner_id", sess.pid).eq("partner_unread", true)
        .order("last_message_at", { ascending: false }),
      sb.from("partners").select("notifications_seen_at").eq("id", sess.pid).single(),
    ]);

    const items: Item[] = [];
    for (const f of failsRes.data ?? []) {
      const r = f as { id: string; amount: number; fail_reason: string; updated_at: string };
      items.push({
        id: `payout_${r.id}`,
        kind: "payout_failed",
        title: `Payout of ${money(r.amount)} couldn’t be sent`,
        body: r.fail_reason,
        at: r.updated_at,
        href: "/partner/history",
      });
    }
    for (const t of ticketsRes.data ?? []) {
      const r = t as { id: string; subject: string; last_message_at: string };
      items.push({
        id: `ticket_${r.id}`,
        kind: "support",
        title: "Support replied to your ticket",
        body: r.subject,
        at: r.last_message_at,
        href: "/partner/support",
      });
    }
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const seenAt = (partnerRes.data as { notifications_seen_at: string | null } | null)?.notifications_seen_at || null;
    const unread = items.filter((i) => !seenAt || i.at > seenAt).length;
    const supportUnread = (ticketsRes.data ?? []).length;

    return NextResponse.json({ items, unread, supportUnread });
  } catch {
    return NextResponse.json({ items: [], unread: 0, supportUnread: 0 });
  }
}

export async function POST(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getSupabaseAdmin().from("partners").update({ notifications_seen_at: new Date().toISOString() }).eq("id", sess.pid);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
