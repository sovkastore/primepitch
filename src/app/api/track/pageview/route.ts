import { NextResponse } from "next/server";
import { isTrackingDisabled } from "@/lib/tracking";
import { trackPageView } from "@/lib/db-tracking";
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
  if (await isTrackingDisabled()) {
    return NextResponse.json({ ok: true, status: "tracking_disabled" });
  }
  try {
    const { visitor_id, path, referrer, device_type } = await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // High-speed D1 Tracking (includes partner referral logic via trackPageView)
    await trackPageView(
      visitor_id, 
      path, 
      referrer, 
      device_type, 
      countryFromRequest(request), 
      readCookie(request, "pp_ref")
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PageView API Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
