import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Drives the football sub-nav: enabled competitions in display order. Read from
// the league_config cache table (same path the World Cup feature uses).
export const dynamic = "force-dynamic";

let cache: { data: unknown; ts: number } | null = null;
const TTL = 60_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return NextResponse.json(cache.data);
  try {
    const { data } = await getSupabaseAdmin()
      .from("league_config")
      .select("league_id,label,enabled,display_order,has_table,default_tab,logo_url")
      .eq("enabled", true)
      .order("display_order", { ascending: true });
    const payload = { leagues: data ?? [] };
    cache = { data: payload, ts: now };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(cache?.data ?? { leagues: [] });
  }
}
