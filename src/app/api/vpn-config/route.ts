import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "vpn_config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ enabled: false });
    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const cfg = row?.value ? JSON.parse(row.value) : { enabled: false };
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ enabled: false }, { headers: { "x-pp-degraded": "1" } });
  }
}
