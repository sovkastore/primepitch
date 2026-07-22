import { NextResponse } from "next/server";
import { isTrackingDisabled } from "@/lib/tracking";
import { trackHeartbeat } from "@/lib/db-tracking";

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
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, path, match_id } = await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Read the partner referral code
    const ref_code = readCookie(request, "pp_ref");

    // High-speed D1 Tracking with Supabase Fallback
    await trackHeartbeat(visitor_id, path, match_id, ref_code);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Heartbeat API Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
