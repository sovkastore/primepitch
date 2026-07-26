import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
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
      const d1 = await getD1();
      if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

      const { results } = await d1.prepare(
        "SELECT id, amount, currency, from_address, to_address, status, proof_link, proof_image, note, fail_reason, created_at FROM d1_partner_payouts WHERE partner_id = ? ORDER BY created_at DESC"
      ).bind(bal.partnerId).all();
      
      payouts = results ?? [];
    }
    return NextResponse.json({
      balances: { earned: bal.earned, approved: bal.approved, hold: bal.hold, paid: bal.paid, balance: bal.balance },
      method: { currency: bal.payoutCurrency, address: bal.payoutAddress },
      payouts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
