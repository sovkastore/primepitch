import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Daily RapidAPI request usage, shown in the admin robot panel.
export const dynamic = "force-dynamic";

function dailyLimit(): number {
  const keys = (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return Math.max(1, keys.length) * 50; // 50 requests/day per key
}

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  const limit = dailyLimit();
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ today: { total: 0, bySource: {} }, week: [], limit });

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().split("T")[0];

    const { results } = await d1
      .prepare("SELECT day, source, n FROM d1_rapid_usage WHERE day >= ? ORDER BY day DESC")
      .bind(weekAgo)
      .all<{ day: string; source: string; n: number }>();

    const bySource: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    for (const r of results ?? []) {
      byDay[r.day] = (byDay[r.day] || 0) + r.n;
      if (r.day === today) bySource[r.source] = (bySource[r.source] || 0) + r.n;
    }

    return NextResponse.json({
      today: { total: byDay[today] || 0, bySource },
      week: Object.entries(byDay).map(([day, total]) => ({ day, total })),
      limit,
    });
  } catch {
    // Table doesn't exist until the first counted request
    return NextResponse.json({ today: { total: 0, bySource: {} }, week: [], limit });
  }
}
