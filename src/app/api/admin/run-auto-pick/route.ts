import { NextResponse } from "next/server";
import { runAutoPick } from "@/lib/auto-pick";

// Manual "run the picker now" from the admin panel (works even when the
// daily schedule is disabled).
export const dynamic = "force-dynamic";

export async function POST() {
  const summary = await runAutoPick(true);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
