import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Match details for listings that don't exist in the public feed (admin/ppv
// customs). Sourced from the match_data stored alongside stream overrides and
// match flags. Lets the watch page show a real countdown before kickoff and a
// real FULL TIME state after — instead of guessing.

import { withTimeout } from "@/lib/supabase/timeout";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params;
    const matchId = decodeURIComponent(raw);

    const { data: ov } = (await withTimeout(
      getSupabaseAdmin()
        .from("stream_overrides")
        .select("match_data")
        .eq("match_id", matchId)
        .not("match_data", "is", null)
        .order("id", { ascending: false })
        .limit(1) as any
    )) as any;
    if (ov?.[0]?.match_data) {
      return NextResponse.json({ match: ov[0].match_data });
    }

    const { data: fl } = (await withTimeout(
      getSupabaseAdmin()
        .from("match_flags")
        .select("match_data")
        .eq("match_id", matchId)
        .not("match_data", "is", null)
        .limit(1) as any
    )) as any;
    if (fl?.[0]?.match_data) {
      return NextResponse.json({ match: fl[0].match_data });
    }

    return NextResponse.json({ match: null });
  } catch {
    // If DB is slow or down, return null so the watch page doesn't hang
    return NextResponse.json({ match: null });
  }
}
