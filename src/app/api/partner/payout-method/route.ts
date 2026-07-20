import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const CURRENCIES = ["usdt_trc20", "usdt_erc20", "usdt_bep20", "ton", "btc"];

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const data = await d1.prepare(
    "SELECT payout_currency, payout_address FROM d1_partners WHERE code = ?"
  ).bind(sess.code).first() as { payout_currency: string | null, payout_address: string | null } | null;
  
  return NextResponse.json({ currency: data?.payout_currency ?? null, address: data?.payout_address ?? null });
}

export async function POST(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const currency = String(body.currency || "");
    const address = String(body.address || "").trim();
    if (!CURRENCIES.includes(currency)) return NextResponse.json({ error: "Pick a valid currency" }, { status: 400 });
    if (address.length < 12 || address.length > 120) return NextResponse.json({ error: "That wallet address doesn’t look right" }, { status: 400 });
    
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    await d1.prepare(
      "UPDATE d1_partners SET payout_currency = ?, payout_address = ? WHERE code = ?"
    ).bind(currency, address, sess.code).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
