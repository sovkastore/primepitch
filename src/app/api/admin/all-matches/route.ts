import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { resolveStreams } from "@/lib/streams";
import { getMatchStatus, matchFlagKeys } from "@/lib/api";
import type { Match } from "@/lib/api";

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

    const flagsByMatch = new Map<string, FlagRow>();
    const overridesByMatch = new Map<string, OverrideRow[]>();
    
    try {
      const d1 = await getD1();
      if (d1) {
        const { results: flagsData } = await d1.prepare("SELECT * FROM d1_match_flags").all();
        for (const r of (flagsData ?? []) as any[]) {
          flagsByMatch.set(r.match_id, {
            ...r,
            hidden: !!r.hidden,
            forced_live: !!r.forced_live,
            featured: !!r.featured,
            disable_auto: !!r.disable_auto
          });
        }
        
        const { results: overridesData } = await d1
          .prepare("SELECT id, match_id, embed_url, source, server_label, replace_original, enabled, created_at FROM d1_stream_overrides ORDER BY created_at ASC")
          .all();
          
        for (const r of (overridesData ?? []) as any[]) {
          const arr = overridesByMatch.get(r.match_id) ?? [];
          arr.push({
            ...r,
            replace_original: r.replace_original === null ? null : !!r.replace_original,
            enabled: !!r.enabled
          });
          overridesByMatch.set(r.match_id, arr);
        }
      }
    } catch {
      // Ignore DB errors
    }

    const findFlag = (m: Match): FlagRow | null => {
      const keys = matchFlagKeys(m);
      for (const k of keys) {
        const f = flagsByMatch.get(k);
        if (f) return f;
      }
      const bare = new Set(keys.filter((k) => !k.includes("--")));
      for (const [stored, row] of flagsByMatch) {
        const i = stored.indexOf("--");
        const portion = i === -1 ? stored : stored.slice(i + 2);
        if (bare.has(portion)) return row;
      }
      return null;
    };

    const liveOut = await Promise.all(
      live.map(async (m) => {
        const matchId = keyOf(m);
        const flags = findFlag(m);
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
        flags: findFlag(m),
      };
    });

    const payload = { live: liveOut, upcoming: upcomingOut };
    cache = { data: payload, ts: now };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ live: [], upcoming: [] });
  }
}
