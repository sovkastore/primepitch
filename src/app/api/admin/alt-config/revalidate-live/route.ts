import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Clear Next.js cache (if any exists)
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches-page-1");
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

    return NextResponse.json({ ok: true, revalidated: true, type: "live-only" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
