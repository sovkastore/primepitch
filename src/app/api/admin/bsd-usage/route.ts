import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getBsdUsage } from "@/lib/bsd-events";

// Daily BSD request usage (our count) plus the remaining quota BSD last
// reported, shown in the admin robot panel next to the RapidAPI counter.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    return NextResponse.json(await getBsdUsage());
  } catch (e: unknown) {
    return NextResponse.json(
      { today: { total: 0, bySource: {} }, status: null, limit: 7500, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
