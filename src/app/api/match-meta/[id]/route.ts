import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Match details for listings that don't exist in the public feed (admin/ppv
// customs). Sourced from the match_data stored alongside stream overrides and
// match flags. Lets the watch page show a real countdown before kickoff and a
// real FULL TIME state after — instead of guessing.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params;
    const matchId = decodeURIComponent(raw);

    const d1 = await getD1();
    if (d1) {
      const ovPromise = d1.prepare("SELECT match_data FROM d1_stream_overrides WHERE match_id = ? AND enabled = 1 ORDER BY position ASC LIMIT 1").bind(matchId).first() as any;
      const ov = await Promise.race([
        ovPromise,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000))
      ]).catch(() => null);
      if (ov) {
        const m = ov.match_data ? (typeof ov.match_data === 'string' ? JSON.parse(ov.match_data) : ov.match_data) : {
          id: matchId,
          title: matchId.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || matchId,
          category: "football",
          date: Date.now(),
          sources: [{ source: matchId.split("--")[0] || "admin", id: matchId.split("--").slice(1).join("--") || matchId }]
        };
        return NextResponse.json({ match: m });
      }

      const flPromise = d1.prepare("SELECT match_data FROM d1_match_flags WHERE match_id = ? AND match_data IS NOT NULL LIMIT 1").bind(matchId).first() as any;
      const fl = await Promise.race([
        flPromise,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000))
      ]).catch(() => null);
      if (fl?.match_data) {
        return NextResponse.json({ match: typeof fl.match_data === 'string' ? JSON.parse(fl.match_data) : fl.match_data });
      }
    }

    return NextResponse.json({ match: null });
  } catch {
    // If DB is slow or down, return null so the watch page doesn't hang
    return NextResponse.json({ match: null });
  }
}
