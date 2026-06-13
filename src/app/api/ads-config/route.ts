import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Public: ad configuration the client uses to decide whether to inject any
// Monetag tags. When master is false, the site injects nothing at all.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "ads_config")
      .maybeSingle();
    const cfg = data?.value ?? { master: false, domains: "all", formats: {} };
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ master: false, domains: "all", formats: {} });
  }
}
