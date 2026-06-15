import { NextRequest, NextResponse } from "next/server";
import { resolveStreams } from "@/lib/streams";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Merged, playable streams for one match: manual overrides → echo → auto-fallback.
// The watch page loads from here so an auto-found stream actually plays.

async function isAutoDisabled(matchId: string): Promise<boolean> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("match_flags")
      .select("disable_auto")
      .eq("match_id", matchId)
      .maybeSingle();
    return !!data?.disable_auto;
  } catch {
    return false; // table may not exist yet — degrade to auto enabled
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params;
    const rawId = decodeURIComponent(raw);
    const [source, id] = rawId.split("--");
    if (!source || !id) {
      return NextResponse.json({ streams: [], replace_original: false, serving: "none" });
    }

    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title") || "";
    const sport = searchParams.get("sport") || "football";
    // Before kickoff, only streamed.pk (echo) / admin overrides may serve — auto
    // fallback stays gated so a pre-match junk feed can't play early.
    const kickoffRaw = searchParams.get("kickoff");
    const kickoff = kickoffRaw ? Number(kickoffRaw) : NaN;
    const gateAuto = Number.isFinite(kickoff) && kickoff > 0 && Date.now() < kickoff;

    const disableAuto = await isAutoDisabled(rawId);
    const result = await resolveStreams({ source, id, title, sport, disableAuto, gateAuto });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ streams: [], replace_original: false, serving: "none" });
  }
}
