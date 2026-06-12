import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveStreams } from "@/lib/streams";
import { getMatchStatus } from "@/lib/api";
import type { Match } from "@/lib/api";

// Admin Match Manager data: ALL live + upcoming matches (regardless of viewers/streams),
// each annotated with serving status (echo / auto / override / none), its overrides, and flags.

const SPORTS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
];

const TTL = 20_000;
let cache: { data: unknown; ts: number } | null = null;

interface OverrideRow {
  id: number;
  match_id: string;
  embed_url: string;
  source: string | null;
  server_label: string | null;
  replace_original: boolean | null;
  enabled: boolean;
  created_at: string;
}
interface FlagRow {
  match_id: string;
  hidden: boolean;
  forced_live: boolean;
  featured: boolean;
  disable_auto: boolean;
}

function keyOf(m: Match): string {
  const s = m.sources?.[0];
  return s ? `${s.source}--${s.id}` : m.id;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return NextResponse.json(cache.data);

  try {
    const results = await Promise.all(
      SPORTS.map(async (sport) => {
        try {
          const res = await fetch(`https://streamed.pk/api/matches/${sport}`, {
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json();
          return (Array.isArray(data) ? data : []).map((m: Match) => ({ ...m, category: sport }));
        } catch {
          return [];
        }
      })
    );
    const all: Match[] = results.flat();

    // streamed.pk's curated "live" set can contain PPV/special entries that aren't in
    // the per-sport schedules (or whose scheduled time is still in the future). Union
    // them in and key off it so the admin's Live tab matches the public LIVE NOW.
    let curatedLiveKeys = new Set<string>();
    try {
      const lr = await fetch("https://streamed.pk/api/matches/live", { signal: AbortSignal.timeout(8000) });
      const ld: Match[] = lr.ok ? await lr.json() : [];
      const byKey = new Map(all.map((m) => [keyOf(m), m]));
      for (const m of ld) {
        const k = keyOf(m);
        curatedLiveKeys.add(k);
        if (!byKey.has(k)) all.push({ ...m, category: m.category || "football" });
      }
    } catch {
      curatedLiveKeys = new Set<string>();
    }

    const isLiveMatch = (m: Match) => getMatchStatus(m) === "live" || curatedLiveKeys.has(keyOf(m));
    const live = all.filter(isLiveMatch);
    const upcoming = all
      .filter((m) => !isLiveMatch(m) && getMatchStatus(m) === "upcoming")
      .sort((a, b) => a.date - b.date)
      .slice(0, 200);

    // Bulk flags + overrides
    const flagsByMatch = new Map<string, FlagRow>();
    try {
      const { data } = await getSupabaseAdmin().from("match_flags").select("*");
      for (const r of (data ?? []) as FlagRow[]) flagsByMatch.set(r.match_id, r);
    } catch {
      /* table may not exist yet */
    }
    const overridesByMatch = new Map<string, OverrideRow[]>();
    try {
      const { data } = await getSupabaseAdmin()
        .from("stream_overrides")
        .select("id, match_id, embed_url, source, server_label, replace_original, enabled, created_at")
        .order("created_at", { ascending: true });
      for (const r of (data ?? []) as OverrideRow[]) {
        const arr = overridesByMatch.get(r.match_id) ?? [];
        arr.push(r);
        overridesByMatch.set(r.match_id, arr);
      }
    } catch {
      /* ignore */
    }

    const liveOut = await Promise.all(
      live.map(async (m) => {
        const matchId = keyOf(m);
        const flags = flagsByMatch.get(matchId) ?? null;
        const overrides = overridesByMatch.get(matchId) ?? [];
        const s = m.sources?.[0];
        let serving = "none";
        if (s) {
          const r = await resolveStreams({
            source: s.source,
            id: s.id,
            title: m.title,
            sport: m.category,
            disableAuto: !!flags?.disable_auto,
          });
          serving = r.serving;
        }
        return { match: m, matchId, status: "live", serving, overrides, flags };
      })
    );

    const upcomingOut = upcoming.map((m) => {
      const matchId = keyOf(m);
      return {
        match: m,
        matchId,
        status: "upcoming",
        serving: "upcoming",
        overrides: overridesByMatch.get(matchId) ?? [],
        flags: flagsByMatch.get(matchId) ?? null,
      };
    });

    const payload = { live: liveOut, upcoming: upcomingOut };
    cache = { data: payload, ts: now };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ live: [], upcoming: [] });
  }
}
