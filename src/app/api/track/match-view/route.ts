import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryFromRequest } from "@/lib/geo";

export async function POST(request: Request) {
  try {
    const { visitor_id, match_id, source, match_title, sport, is_live } =
      await request.json();

    if (!visitor_id || !match_id || !source) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const country = countryFromRequest(request);

    // Insert match view
    await getSupabaseAdmin().from("match_views").insert({
      visitor_id,
      match_id,
      source,
      match_title: match_title || null,
      sport: sport || null,
      is_live: is_live ?? true,
      country,
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

    // Per-match traction stats: recompute unique viewers (and store title/sport),
    // then bump the peak so spikes right after kickoff are captured immediately.
    await getSupabaseAdmin().rpc("record_match_join", {
      p_match_id: match_id,
      p_title: match_title || null,
      p_sport: sport || null,
    });
    await getSupabaseAdmin().rpc("bump_match_peak", { p_match_id: match_id });
    // Per-segment peak (his vs organic) — going forward; never blocks tracking.
    try {
      await getSupabaseAdmin().rpc("bump_ref_peaks", { p_match_id: match_id });
    } catch {
      /* peak table/function not present yet */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
