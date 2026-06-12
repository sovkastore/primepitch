import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Admin: per-match flags (hide / force-live / featured / disable auto-fallback).
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin().from("match_flags").select("*");
    return NextResponse.json({ flags: data ?? [] });
  } catch {
    return NextResponse.json({ flags: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { match_id, match_data, hidden, forced_live, featured, disable_auto, display_title } =
      await request.json();
    if (!match_id) {
      return NextResponse.json({ error: "match_id required" }, { status: 400 });
    }

    const row: Record<string, unknown> = {
      match_id,
      updated_at: new Date().toISOString(),
    };
    if (typeof hidden === "boolean") row.hidden = hidden;
    if (typeof forced_live === "boolean") row.forced_live = forced_live;
    if (typeof featured === "boolean") row.featured = featured;
    if (typeof disable_auto === "boolean") row.disable_auto = disable_auto;
    if (match_data) row.match_data = match_data;
    if (typeof display_title === "string") row.display_title = display_title.trim() || null;

    const { error } = await getSupabaseAdmin()
      .from("match_flags")
      .upsert(row, { onConflict: "match_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep analytics labels in sync so renamed matches don't fragment in the
    // admin merge (labels only — no metrics are touched).
    if (typeof display_title === "string" && display_title.trim()) {
      const t = display_title.trim();
      await getSupabaseAdmin().from("match_stats").update({ match_title: t }).eq("match_id", match_id);
      await getSupabaseAdmin().from("match_views").update({ match_title: t }).eq("match_id", match_id);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
