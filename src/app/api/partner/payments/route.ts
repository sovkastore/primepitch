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
    let payouts: unknown[] = [];
    if (bal.partnerId) {
      const { data } = await getSupabaseAdmin().from("partner_payouts")
        .select("id, amount, currency, from_address, to_address, status, proof_link, proof_image, note, created_at")
        .eq("partner_id", bal.partnerId)
        .order("created_at", { ascending: false });
      payouts = data ?? [];
    }
    return NextResponse.json({
      balances: { earned: bal.earned, hold: bal.hold, paid: bal.paid, balance: bal.balance },
      method: { currency: bal.payoutCurrency, address: bal.payoutAddress },
      payouts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
