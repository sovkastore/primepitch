import { NextResponse, type NextRequest } from "next/server";
import { STAFF_ADS_COOKIE, staffOf } from "@/lib/staff-adfree";

export const dynamic = "force-dynamic";

// POST { showAds: boolean } — admins and partners switch PrimePitch's ads on
// (to test them) or off (VIP experience) for their own browser.
export async function POST(request: NextRequest) {
  const staff = await staffOf(request);
  if (!staff) return NextResponse.json({ error: "Not signed in as admin or partner." }, { status: 401 });
  let body: { showAds?: unknown } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const showAds = body?.showAds === true;
  const res = NextResponse.json({ ok: true, staff, staffAds: showAds });
  res.cookies.set(STAFF_ADS_COOKIE, showAds ? "on" : "off", {
    maxAge: 365 * 24 * 3600, path: "/", sameSite: "lax", secure: true,
  });
  return res;
}
