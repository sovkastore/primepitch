import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifySession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await verifySession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { data, error } = await getSupabaseAdmin()
      .rpc("partner_visitors", { p_ref: sess.code, p_date: date });
    if (error) throw error;
    return NextResponse.json({ date, ...data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
