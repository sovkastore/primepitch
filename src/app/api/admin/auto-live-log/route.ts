import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Recent auto-live robot activity, shown on the alt admin page.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ entries: [] });
    const { results } = await d1
      .prepare("SELECT * FROM d1_auto_live ORDER BY updated_at DESC LIMIT 20")
      .all();
    return NextResponse.json({ entries: results ?? [] });
  } catch {
    // Table doesn't exist until the robot's first run
    return NextResponse.json({ entries: [] });
  }
}
