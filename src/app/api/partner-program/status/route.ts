import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

// Lightweight public check used by the navbar to decide whether to show the
// Affiliate link. Only called when the mobile menu opens, so no page-load cost.
export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ open: false });

    const data = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = 'partner_public_page'").first() as any;
    const open = data?.value === true || data?.value === "true";
    return NextResponse.json({ open });
  } catch {
    return NextResponse.json({ open: false });
  }
}
