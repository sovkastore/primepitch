import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "help_content";
const TTL = 300_000; // 5 minutes cache
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    
    const result = data?.value || null;
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(null);
  }
}
