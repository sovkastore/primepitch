import { NextResponse } from "next/server";
import { countryFromRequest } from "@/lib/geo";
import { isTrackingDisabled } from "@/lib/tracking";
import { trackMatchView } from "@/lib/db-tracking";

// Read a single cookie value from the raw request
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
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, match_id, source, match_title, sport, is_live } =
      await request.json();

    if (!visitor_id || !match_id || !source) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const country = countryFromRequest(request);
    const ref_code = readCookie(request, "pp_ref");

    // 1) High-speed D1 Tracking
    await trackMatchView(
      visitor_id,
      match_id,
      source,
      match_title,
      sport,
      is_live,
      country,
      ref_code
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("MatchView API Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
