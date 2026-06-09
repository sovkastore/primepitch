import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { visitor_id, match_id, source, match_title, sport, is_live } =
      await request.json();

    if (!visitor_id || !match_id || !source) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Insert match view
    await getSupabaseAdmin().from("match_views").insert({
      visitor_id,
      match_id,
      source,
      match_title: match_title || null,
      sport: sport || null,
      is_live: is_live ?? true,
    });

    // Upsert active viewer
    await getSupabaseAdmin().from("active_viewers").upsert(
      {
        visitor_id,
        match_id,
        path: `/watch/${match_id}`,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "visitor_id" }
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
