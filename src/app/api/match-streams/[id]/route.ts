import { NextRequest, NextResponse } from "next/server";
import { resolveStreams } from "@/lib/streams";
import { getMatches } from "@/lib/api";
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

    // An admin-curated set (replace_original) is the final word — show exactly it.
    // Otherwise aggregate EVERY source this match lists (same as the Test Stream
    // picker) so all servers show, not just the primary source's. These sources
    // are already in the match's own feed data; we resolve all of them, not one.
    if (!result.replace_original) {
      try {
        const feed = await getMatches(sport);
        const match = feed.find((m) => m.sources?.some((s) => s.id === id));
        const others = (match?.sources ?? []).filter(
          (s) => `${s.source}--${s.id}` !== rawId
        );
        if (others.length > 0) {
          const extra = await Promise.all(
            others.map((s) =>
              resolveStreams({
                source: s.source,
                id: s.id,
                title,
                sport,
                disableAuto: true, // only the primary source may add the auto-fallback
                gateAuto,
              }).catch(() => ({ streams: [] as typeof result.streams }))
            )
          );
          const seen = new Set(result.streams.map((st) => st.embedUrl));
          const merged = [...result.streams];
          for (const r of extra) {
            for (const st of r.streams) {
              if (st.embedUrl && !seen.has(st.embedUrl)) {
                seen.add(st.embedUrl);
                merged.push(st);
              }
            }
          }
          return NextResponse.json({
            ...result,
            streams: merged.map((st, i) => ({ ...st, streamNo: i + 1 })),
          });
        }
      } catch {
        // any feed lookup error → fall back to the primary source only
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ streams: [], replace_original: false, serving: "none" });
  }
}
