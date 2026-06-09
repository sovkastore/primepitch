import { NextRequest, NextResponse } from "next/server";
import { searchFallbackStreams } from "@/lib/fallback-streams";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title");
    const sport = searchParams.get("sport") || "football";

    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const streams = await searchFallbackStreams(title, sport);
    return NextResponse.json({ streams });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
