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

    // Run all tracking ops in parallel to reduce latency and sequential DB round-trips.
    // record_match_join counts history so it's fine to run along with the insert.
    await Promise.all([
      getSupabaseAdmin().from("match_views").insert({
        visitor_id,
        match_id,
        source,
        match_title: match_title || null,
        sport: sport || null,
        is_live: is_live ?? true,
        country,
      }),
      getSupabaseAdmin().from("active_viewers").upsert(
        {
          visitor_id,
          match_id,
          path: `/watch/${match_id}`,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "visitor_id" }
      ),
      getSupabaseAdmin().rpc("record_match_join", {
        p_match_id: match_id,
        p_title: match_title || null,
        p_sport: sport || null,
      }),
      getSupabaseAdmin().rpc("bump_match_peak", { p_match_id: match_id }),
      (async () => {
        try {
          await getSupabaseAdmin().rpc("bump_ref_peaks", { p_match_id: match_id });
        } catch {
          /* optional/legacy function */
        }
      })(),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
