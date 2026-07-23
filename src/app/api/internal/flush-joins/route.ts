import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "D1 not available" }, { status: 500 });

    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || "secret";
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { joins } = await req.json();
    if (!joins || !Array.isArray(joins) || joins.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const statements = joins.map((j: any) => {
      return d1.prepare(`
        INSERT INTO d1_match_views (visitor_id, match_id, source, match_title, sport, is_live, country, ref_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        j.visitor_id ?? "anonymous",
        j.match_id ?? "unknown",
        j.source ?? "web",
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
