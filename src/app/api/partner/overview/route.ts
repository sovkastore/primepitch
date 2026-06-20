import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { fullStats, earned, paid } = await partnerFlags(sess.code);
    const { data, error } = await getSupabaseAdmin().rpc("partner_overview", { p_ref: sess.code });
    if (error) throw error;
    const scoped = fullStats ? data : scopeToOwn(data);
    return NextResponse.json({
      partner: sess.code,
      name: sess.name,
      full_stats: fullStats,
      earnings: { earned, paid, balance: earned - paid },
      ...scoped,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
