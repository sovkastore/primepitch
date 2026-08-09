import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches");
    return NextResponse.json({ success: true, revalidated: true });
  } catch (error) {
    console.error("Failed to revalidate alt-matches:", error);
    return NextResponse.json({ error: "Failed to revalidate" }, { status: 500 });
  }
}
