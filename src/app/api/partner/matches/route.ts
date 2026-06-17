import { NextRequest, NextResponse } from "next/server";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerMatches } from "@/lib/matches-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const day = new URL(request.url).searchParams.get("day");
    const matches = await partnerMatches(sess.code, day);
    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
