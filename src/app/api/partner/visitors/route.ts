import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { partnerFlags, scopeToOwn } from "@/lib/partner-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { fullStats } = await partnerFlags(sess.code);
    const { data, error } = await getSupabaseAdmin()
      .rpc("partner_visitors", { p_ref: sess.code, p_date: date });
    if (error) throw error;
    const scoped = fullStats ? data : scopeToOwn(data);
    return NextResponse.json({ date, full_stats: fullStats, ...scoped });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
