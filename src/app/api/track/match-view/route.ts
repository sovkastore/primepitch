import { NextResponse } from "next/server";
import { trackMatchView } from "@/lib/db-tracking";
import { countryFromRequest } from "@/lib/geo";
import { isTrackingDisabled } from "@/lib/tracking";

export async function POST(request: Request) {
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, match_id, source, match_title, sport, is_live } = await request.json();

    if (!visitor_id || !match_id || !source) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // High-speed D1 Only Tracking
    await trackMatchView(
      visitor_id,
      match_id,
      source,
      match_title || null,
      sport || null,
      is_live ?? true,
      countryFromRequest(request)
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("MatchView API Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
