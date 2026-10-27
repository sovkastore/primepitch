import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches");

    // Clear D1 Database Cache
    try {
      const d1 = await getD1();
      if (d1) {
        await d1.prepare("DELETE FROM d1_pro_matches_cache WHERE id = ?").bind("matches_cache").run();
      }
    } catch(e) {
      console.error("Failed to clear D1 cache:", e);
    }

    return NextResponse.json({ success: true, revalidated: true });
  } catch (error) {
    console.error("Failed to revalidate alt-matches:", error);
    return NextResponse.json({ error: "Failed to revalidate" }, { status: 500 });
  }
}
