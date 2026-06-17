import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifySession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await verifySession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await getSupabaseAdmin().rpc("partner_pulse", { p_ref: sess.code });
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
