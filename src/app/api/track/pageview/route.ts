import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryFromRequest } from "@/lib/geo";

export async function POST(request: Request) {
  try {
    const { visitor_id, path, referrer, user_agent, device_type } =
      await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const country = countryFromRequest(request);

    await getSupabaseAdmin().from("page_views").insert({
      visitor_id,
      path,
      referrer: referrer || null,
      user_agent: user_agent || null,
      device_type: device_type || null,
      country,
    });

    // Maintain the visitor roster (first_seen / last_seen / visit_count).
    // Wrapped so a missing function (pre-migration) never breaks pageview tracking.
    try {
      await getSupabaseAdmin().rpc("track_visitor", {
        p_vid: visitor_id,
        p_device: device_type || null,
        p_referrer: referrer || null,
        p_path: path,
      });
    } catch {
      /* visitors table/function not created yet */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
