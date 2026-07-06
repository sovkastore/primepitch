import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { visitor_id, path, match_id } = await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Upsert active viewer presence
    await getSupabaseAdmin().from("active_viewers").upsert(
      {
        visitor_id,
        match_id: match_id || null,
        path,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "visitor_id" }
    );

    // If watching a match, increment duration on the latest match_view row
    // (single site-wide heartbeat fires every 150s) and update the match's
    // peak-concurrent-viewers record — both are DB calls inside a request
    // that already exists, so they cost zero extra Cloudflare requests.
    if (match_id) {
      const { data } = await getSupabaseAdmin()
        .from("match_views")
        .select("id, duration_sec")
        .eq("visitor_id", visitor_id)
        .eq("match_id", match_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        await getSupabaseAdmin()
          .from("match_views")
          .update({ duration_sec: (data.duration_sec || 0) + 150 })
          .eq("id", data.id);
      }

      await getSupabaseAdmin().rpc("bump_match_peak", { p_match_id: match_id });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
