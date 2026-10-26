import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Internal endpoint used by middleware to check maintenance mode from D1.
export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ on: false, message: "" });
    const row = await d1.prepare(
      `SELECT value FROM d1_site_settings WHERE key = 'maintenance'`
    ).first<{ value: string }>();
    if (!row?.value) return NextResponse.json({ on: false, message: "" });
    try {
      const parsed = JSON.parse(row.value);
      return NextResponse.json({
        on: !!parsed?.on,
        message: typeof parsed?.message === "string" ? parsed.message : "",
      });
    } catch {
      return NextResponse.json({ on: false, message: "" });
    }
  } catch {
    // Database unreachable: answer "off" but don't let the edge layer store it.
    return NextResponse.json({ on: false, message: "" }, { headers: { "x-pp-degraded": "1" } });
  }
}
