import { NextRequest, NextResponse } from "next/server";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerMatches } from "@/lib/matches-engine";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const day = new URL(request.url).searchParams.get("day");
    const { fullStats } = await partnerFlags(sess.code);
    const matches = await partnerMatches(sess.code, day);
    return NextResponse.json({ full_stats: fullStats, matches: fullStats ? matches : scopeToOwn(matches) });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
