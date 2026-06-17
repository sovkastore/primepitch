import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryFromRequest } from "@/lib/geo";

// Read a single cookie value from the raw request (version-agnostic).
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

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

    // Maintain the visitor roster (first_seen / last_seen / visit_count) and
    // stamp the partner referral (from the pp_ref cookie) on first sight only.
    // Wrapped so a missing function (pre-migration) never breaks pageview tracking.
    try {
      await getSupabaseAdmin().rpc("track_visitor", {
        p_vid: visitor_id,
        p_device: device_type || null,
        p_referrer: referrer || null,
        p_path: path,
        p_ref: readCookie(request, "pp_ref"),
      });
    } catch {
      /* visitors table/function not created yet */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
