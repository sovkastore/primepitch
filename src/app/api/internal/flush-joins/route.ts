export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'secret'}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { joins } = await req.json();
    if (!joins || !Array.isArray(joins) || joins.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "D1 not available" }, { status: 500 });

    const statements = joins.map((j: any) => {
      return d1.prepare(`
        INSERT INTO d1_match_views (id, visitor_id, match_id, source, match_title, sport, is_live, country, ref_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        j.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        j.visitor_id,
        j.match_id,
        j.source || "web",
        j.match_title ?? null,
        j.sport ?? null,
        j.is_live ? 1 : 0,
        j.country ?? null,
        j.ref_code ?? null
      );
    });

    // Batch them all in a single transaction
    await d1.batch(statements);

    return NextResponse.json({ ok: true, count: joins.length });
  } catch (error: any) {
    console.error("Flush Joins Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
