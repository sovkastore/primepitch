import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isTrackingDisabled } from "@/lib/tracking";

export async function POST(request: Request) {
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, path, match_id } = await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Run the presence upsert in parallel with any match-specific duration/peak logic.
    await Promise.all([
      getSupabaseAdmin().from("active_viewers").upsert(
        {
          visitor_id,
          match_id: match_id || null,
          path,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "visitor_id" }
      ),
      (async () => {
        if (match_id) {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("match_views")
            .select("id, duration_sec")
            .eq("visitor_id", visitor_id)
            .eq("match_id", match_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (data) {
            await Promise.all([
              sb.from("match_views")
                .update({ duration_sec: (data.duration_sec || 0) + 300 })
                .eq("id", data.id),
              sb.rpc("bump_match_peak", { p_match_id: match_id })
            ]);
          } else {
             await sb.rpc("bump_match_peak", { p_match_id: match_id });
          }
        }
      })()
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
