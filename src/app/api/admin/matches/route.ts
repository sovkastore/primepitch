import { adminGuard } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { aggregateMatches, type MatchStatus } from "@/lib/matches-engine";

export async function GET(request: NextRequest) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const res = await aggregateMatches({
      sport: searchParams.get("sport"),
      sort: (searchParams.get("sort") as "views" | "recent") || "views",
      status: (searchParams.get("status") as MatchStatus | "all") || "played",
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      page: parseInt(searchParams.get("page") || "1"),
      limit: 20,
    });
    return NextResponse.json(res);
  } catch (e) {
    console.error("Matches API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
