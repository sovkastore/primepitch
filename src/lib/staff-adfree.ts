import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { PARTNER_COOKIE, requirePartnerSession } from "@/lib/partner-auth";

// Admins and partners get the VIP experience (no PrimePitch ads) just by
// being logged in — no member account needed. A cookie lets them switch the
// ads back on to test them; it only counts while the admin/partner session
// is valid, so a visitor can't set it themselves.
export const STAFF_ADS_COOKIE = "pp_staff_ads"; // "on" = show me the ads

export type Staff = "admin" | "partner" | null;

export async function staffOf(request: NextRequest): Promise<Staff> {
  try {
    const admin = request.cookies.get(ADMIN_COOKIE)?.value;
    if (admin && (await verifyAdminSession(admin))) return "admin";
  } catch { /* fall through */ }
  try {
    const partner = request.cookies.get(PARTNER_COOKIE)?.value;
    if (partner && (await requirePartnerSession(partner))) return "partner";
  } catch { /* fall through */ }
  return null;
}

export function staffWantsAds(request: NextRequest): boolean {
  return request.cookies.get(STAFF_ADS_COOKIE)?.value === "on";
}

// True when this request should get no PrimePitch ads because of who is
// logged in (not because of a paid VIP).
export async function staffAdFree(request: NextRequest): Promise<boolean> {
  if (staffWantsAds(request)) return false;
  return (await staffOf(request)) !== null;
}
