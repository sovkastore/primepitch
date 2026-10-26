import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Drives the football sub-nav: enabled competitions in display order. Read from
// the league_config cache table.
export const dynamic = "force-dynamic";

let cache: { data: unknown; ts: number } | null = null;
const TTL = 60_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return NextResponse.json(cache.data);
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 binding missing");
    
    const { results } = await d1.prepare(`
      SELECT league_id, label, enabled, display_order, has_table, default_tab, logo_url
      FROM d1_league_config
      WHERE enabled = 1
      ORDER BY display_order ASC
    `).all();

    const leagues = (results || []).map((l: any) => ({
      ...l,
      enabled: l.enabled === 1,
      has_table: l.has_table === 1,
    }));

    const payload = { leagues };
    cache = { data: payload, ts: now };
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("GET leagues error:", err);
    return NextResponse.json(cache?.data ?? { leagues: [] }, { headers: { "x-pp-degraded": "1" } });
  }
}
