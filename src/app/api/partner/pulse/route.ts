import { NextRequest, NextResponse } from "next/server";
import { getPartnerPulseD1 } from "@/lib/partner-engine";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const d1 = await getD1();
    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const { fullStats } = await partnerFlags(sess.code);
    
    // Fetch metrics from D1
    const d1Pulse = await getPartnerPulseD1(d1, sess.code);
    
    const scoped = fullStats ? d1Pulse : scopeToOwn(d1Pulse);
    return NextResponse.json({ full_stats: fullStats, ...scoped });
  } catch (e) {
    console.error("Partner Pulse D1 error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
