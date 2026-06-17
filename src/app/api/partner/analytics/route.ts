import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifySession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await verifySession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const start = searchParams.get("start") ||
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const end = searchParams.get("end") || now.toISOString();
    const { data, error } = await getSupabaseAdmin()
      .rpc("partner_analytics", { p_ref: sess.code, p_start: start, p_end: end });
    if (error) throw error;
    return NextResponse.json({ start, end, ...data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
