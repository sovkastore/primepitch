import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const CURRENCIES = ["usdt_trc20", "usdt_erc20", "usdt_bep20", "ton", "btc"];

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await getSupabaseAdmin()
    .from("partners").select("payout_currency, payout_address").eq("code", sess.code).maybeSingle();
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
    const { error } = await getSupabaseAdmin().from("partners")
      .update({ payout_currency: currency, payout_address: address, payout_updated_at: new Date().toISOString() })
      .eq("code", sess.code);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
