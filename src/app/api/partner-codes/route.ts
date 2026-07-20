import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Internal endpoint used by middleware to get active partner codes.
// Returns a simple JSON array of lowercase code strings.
export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json([]);
    const res = await d1.prepare(
      `SELECT code FROM d1_partners WHERE active = 1 AND suspended = 0 AND banned = 0`
    ).all();
    const codes = (res.results || []).map((r: any) => String(r.code).toLowerCase());
    return NextResponse.json(codes, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
