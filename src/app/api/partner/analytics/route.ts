import { NextRequest, NextResponse } from "next/server";
import { getPartnerAnalyticsD1 } from "@/lib/partner-engine";
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

    const now = new Date();
    const start = searchParams.get("start") ||
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const end = searchParams.get("end") || now.toISOString();

    const { fullStats } = await partnerFlags(sess.code);
    
    // Query D1 instead of Supabase RPC
    const d1Analytics = await getPartnerAnalyticsD1(d1, sess.code, start, end);
    
    const scoped = fullStats ? d1Analytics : scopeToOwn(d1Analytics);
    return NextResponse.json({ start, end, full_stats: fullStats, ...scoped });
  } catch (e) {
    console.error("Partner Analytics D1 error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
