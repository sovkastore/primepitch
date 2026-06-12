import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Public: which matches are hidden / featured, so the upcoming lists can honor them.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("match_flags")
      .select("match_id, hidden, featured");
    const hidden: string[] = [];
    const featured: string[] = [];
    for (const r of (data ?? []) as Array<{ match_id: string; hidden: boolean; featured: boolean }>) {
      if (r.hidden) hidden.push(r.match_id);
      if (r.featured) featured.push(r.match_id);
    }
    return NextResponse.json({ hidden, featured });
  } catch {
    return NextResponse.json({ hidden: [], featured: [] });
  }
}
