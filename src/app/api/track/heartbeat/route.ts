import { NextResponse } from "next/server";
import { isTrackingDisabled } from "@/lib/tracking";
import { trackHeartbeat } from "@/lib/db-tracking";

export async function POST(request: Request) {
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, path, match_id } = await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Only track heartbeat if the user is actively watching a match
    if (!match_id) {
      return NextResponse.json({ ok: true, status: "ignored_non_match" });
    }

    // High-speed D1 Tracking with Supabase Fallback
    await trackHeartbeat(visitor_id, path, match_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Heartbeat API Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
