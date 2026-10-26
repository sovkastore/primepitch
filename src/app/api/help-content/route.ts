import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "help_content";
const TTL = 300_000; // 5 minutes cache
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");

    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const result = row?.value ? JSON.parse(row.value) : null;
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(null, { headers: { "x-pp-degraded": "1" } });
  }
}
