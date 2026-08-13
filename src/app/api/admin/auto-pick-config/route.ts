import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { getAutoPickConfig, saveAutoPickConfig, DEFAULT_CRITERIA } from "@/lib/auto-pick";

export const dynamic = "force-dynamic";

export async function GET() {
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  const config = await getAutoPickConfig(d1);

  let picks: unknown[] = [];
  try {
    const { results } = await d1
      .prepare("SELECT * FROM d1_auto_pick ORDER BY created_at DESC LIMIT 25")
      .all();
    picks = results ?? [];
  } catch {
    /* table doesn't exist until first run */
  }
  return NextResponse.json({ ...config, defaultCriteria: DEFAULT_CRITERIA, picks });
}

export async function POST(request: NextRequest) {
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  const body = await request.json();
  await saveAutoPickConfig(d1, {
    enabled: body.enabled !== false,
    criteria: typeof body.criteria === "string" && body.criteria.trim() ? body.criteria : DEFAULT_CRITERIA,
  });
  return NextResponse.json({ ok: true });
}
