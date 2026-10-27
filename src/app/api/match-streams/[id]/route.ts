import { NextRequest, NextResponse } from "next/server";
import { resolveStreams } from "@/lib/streams";
import { getMatches } from "@/lib/api";
import { getD1 } from "@/lib/d1";

// Merged, playable streams for one match: manual overrides → echo → auto-fallback.
// The watch page loads from here so an auto-found stream actually plays.

// Per-match auto-fallback decision. Football is OFF by default; the admin's
// Auto-fallback toggle (auto_fallback) opts a single match in (true) or out
// (false). Other sports stay ON unless explicitly disabled (auto_fallback=false
// or the legacy disable_auto flag).
async function autoFlags(
  matchId: string,
  sport: string
): Promise<{ disableAuto: boolean; allowFootballAuto: boolean; notice: string | null; ok: boolean }> {
  const isFootball = sport.toLowerCase() === "football";
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");
    const fetchFlags = (async () => {
      const row = await d1.prepare("SELECT disable_auto, auto_fallback, custom_notice FROM d1_match_flags WHERE match_id = ?").bind(matchId).first();
      return row;
    })();
    const data = await Promise.race([
      fetchFlags,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const af = data?.auto_fallback as boolean | null | undefined;
    const enabled =
      af === true ? true : af === false ? false : !isFootball && !data?.disable_auto;
    const notice = data?.custom_notice ? String(data.custom_notice).trim() : null;
    return { disableAuto: !enabled, allowFootballAuto: enabled && isFootball, notice, ok: true };
  } catch {
    return { disableAuto: isFootball, allowFootballAuto: false, notice: null, ok: false }; // degrade to sport default
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params;
    const rawId = decodeURIComponent(raw);
    let source = "";
    let id = "";

    if (rawId.startsWith("tv-")) {
      source = "tv";
      id = rawId.replace("tv-", "");
    } else {
      [source, id] = rawId.split("--");
    }

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

    const { disableAuto, allowFootballAuto, notice, ok: flagsOk } = await autoFlags(rawId, sport);
    // Shared-copy hints for the edge layer (worker.js): a database failure is
    // never stored as everyone's answer, and "no streams yet" lives only 5 s so
    // the servers show up quickly once they exist.
    const edgeHeaders = (streamCount: number): HeadersInit =>
      !flagsOk ? { "x-pp-degraded": "1" } : streamCount === 0 ? { "x-edge-fresh": "5" } : {};
    const result = await resolveStreams({ source, id, title, sport, disableAuto, gateAuto, allowFootballAuto });

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
          return NextResponse.json(
            {
              ...result,
              notice: notice || null,
              streams: merged.map((st, i) => ({ ...st, streamNo: i + 1 })),
            },
            { headers: edgeHeaders(merged.length) }
          );
        }
      } catch {
        // any feed lookup error → fall back to the primary source only
      }
    }

    return NextResponse.json({ ...result, notice: notice || null }, { headers: edgeHeaders(result.streams.length) });
  } catch {
    return NextResponse.json(
      { streams: [], replace_original: false, serving: "none", notice: null },
      { headers: { "x-pp-degraded": "1" } }
    );
  }
}
