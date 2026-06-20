import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerBalances } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const bal = await partnerBalances(sess.code);
    const sb = getSupabaseAdmin();
    let failures: { id: string; amount: number; reason: string; at: string }[] = [];
    let supportUnread = 0;
    if (bal.partnerId) {
      const { data: fails } = await sb
        .from("partner_payouts")
        .select("id, amount, fail_reason, updated_at")
        .eq("partner_id", bal.partnerId)
        .eq("status", "failed")
        .not("fail_reason", "is", null)
        .order("updated_at", { ascending: false });
      failures = (fails ?? []).map((f) => {
        const r = f as { id: string; amount: number; fail_reason: string; updated_at: string };
        return { id: r.id, amount: Number(r.amount) || 0, reason: r.fail_reason, at: r.updated_at };
      });
      const { count } = await sb
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", bal.partnerId)
        .eq("partner_unread", true);
      supportUnread = count ?? 0;
    }
    return NextResponse.json({ failures, supportUnread });
  } catch {
    return NextResponse.json({ failures: [], supportUnread: 0 });
  }
}
