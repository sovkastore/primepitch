import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lightweight public check used by the navbar to decide whether to show the
// Affiliate link. Only called when the mobile menu opens, so no page-load cost.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "partner_public_page")
      .maybeSingle();
    const open = data?.value === true || data?.value === "true";
    return NextResponse.json({ open });
  } catch {
    return NextResponse.json({ open: false });
  }
}
