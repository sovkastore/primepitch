import { NextResponse } from "next/server";
import { countBsdRequest } from "@/lib/bsd-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BSD_API = "https://sports.bzzoiro.com/api/events/";
const BSD_KEY = process.env.BSD_API_KEY || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // e.g., '2026-08-09'
    
    let url = `${BSD_API}?limit=200`;
    if (date) {
      url += `&date=${date}`;
    }

    // Admin-only and rare, so this one goes straight to BSD (it needs the
    // date filter and a bigger page than the shared cache keeps); counted so
    // the usage figure in admin stays complete.
    await countBsdRequest("admin fixtures");
    const res = await fetch(url, {
      headers: { Authorization: `Token ${BSD_KEY}` },
    });

    if (!res.ok) {
      throw new Error(`BSD API returned ${res.status}`);
    }

    const data = await res.json();
    let fixtures = data.results || [];
    if (date) {
      fixtures = fixtures.filter((f: any) => f.event_date && f.event_date.startsWith(date));
    }
    
    return NextResponse.json({ fixtures });
  } catch (error: any) {
    console.error("Failed to fetch BSD fixtures:", error);
    return NextResponse.json({ error: error.message, fixtures: [] }, { status: 500 });
  }
}
