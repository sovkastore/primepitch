import { NextRequest, NextResponse } from "next/server";
import { getPartnerOverviewD1 } from "@/lib/partner-engine";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerBalances, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;
    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const { fullStats, earned, hold, paid, balance } = await partnerBalances(sess.code);
    
    // Fetch metrics from D1
    const d1Overview = await getPartnerOverviewD1(d1, sess.code);
    
    // Apply granular partner level scoping / censorship
    const scoped = fullStats ? d1Overview : scopeToOwn(d1Overview);

    return NextResponse.json({
      partner: sess.code,
      name: sess.name,
      full_stats: fullStats,
      earnings: { earned, hold, paid, balance },
      ...scoped,
    });
  } catch (e) {
    console.error("Partner Overview D1 API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
