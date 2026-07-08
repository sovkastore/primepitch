import { NextRequest, NextResponse } from "next/server";
import { getPartnerVisitorsD1 } from "@/lib/partner-engine";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const { searchParams } = new URL(request.url);
    const d1 = await getD1();
    if (!d1) {
      return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
    }

    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { fullStats } = await partnerFlags(sess.code);
    
    // Query D1 instead of Supabase RPC
    const d1Visitors = await getPartnerVisitorsD1(d1, sess.code, date);
    
    const scoped = fullStats ? d1Visitors : scopeToOwn(d1Visitors);
    return NextResponse.json({ date, full_stats: fullStats, ...scoped });
  } catch (e) {
    console.error("Partner Visitors D1 error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
