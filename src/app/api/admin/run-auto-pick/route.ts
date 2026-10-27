import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { runAutoPick } from "@/lib/auto-pick";

// Manual "run the picker now" from the admin panel (works even when the
// daily schedule is disabled).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  const summary = await runAutoPick(true);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
