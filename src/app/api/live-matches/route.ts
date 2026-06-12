import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveStreams } from "@/lib/streams";
import { getMatchStatus } from "@/lib/api";
import type { Match } from "@/lib/api";

// "LIVE" = actually watchable. Start from streamed.pk's curated live set, union in
// admin override-backed and force-live matches (within their live window), then keep
// only matches that resolve to >=1 playable stream (echo / manual override / auto-
// fallback) and aren't hidden. Featured matches float to the top.

const LIVE_URL = "https://streamed.pk/api/matches/live";
const TTL = 12_000; // short so admin hide / force-live / disable-auto reflect quickly
let cache: { data: Match[]; ts: number } | null = null;

function keyOf(m: Match): string {
  const s = m.sources?.[0];
  return s ? `${s.source}--${s.id}` : m.id;
}

interface FlagSets {
  hidden: Set<string>;
  forcedLive: Map<string, Match>;
  disableAuto: Set<string>;
  featured: Set<string>;
}

async function getFlags(): Promise<FlagSets> {
  const hidden = new Set<string>();
  const disableAuto = new Set<string>();
  const featured = new Set<string>();
  const forcedLive = new Map<string, Match>();
  try {
    const { data } = await getSupabaseAdmin()
      .from("match_flags")
      .select("match_id, hidden, forced_live, featured, disable_auto, match_data");
    for (const r of (data ?? []) as Array<{
      match_id: string;
      hidden: boolean;
      forced_live: boolean;
      featured: boolean;
      disable_auto: boolean;
      match_data: Match | null;
    }>) {
      if (r.hidden) hidden.add(r.match_id);
      if (r.disable_auto) disableAuto.add(r.match_id);
      if (r.featured) featured.add(r.match_id);
      if (r.forced_live && r.match_data) forcedLive.set(r.match_id, r.match_data);
    }
  } catch {
    /* match_flags may not exist yet — degrade to no flags */
  }
  return { hidden, forcedLive, disableAuto, featured };
}

async function getOverrideBacked(): Promise<Map<string, Match>> {
  const map = new Map<string, Match>();
  try {
    const { data } = await getSupabaseAdmin()
      .from("stream_overrides")
      .select("match_id, match_data")
      .eq("enabled", true);
    for (const r of (data ?? []) as Array<{ match_id: string; match_data: Match | null }>) {
      if (r.match_data && !map.has(r.match_id)) map.set(r.match_id, r.match_data);
    }
  } catch {
    /* match_data column may not exist yet — skip override-backed surfacing */
  }
  return map;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json({ matches: cache.data });
  }

  try {
    const [liveRes, flags, overrideBacked] = await Promise.all([
      fetch(LIVE_URL, { signal: AbortSignal.timeout(8000) }),
      getFlags(),
      getOverrideBacked(),
    ]);
    const curated: Match[] = liveRes.ok ? await liveRes.json() : [];

    // Candidate set: curated live ∪ override-backed (in window) ∪ forced-live (in window)
    const candidates = new Map<string, Match>();
    for (const m of curated) candidates.set(keyOf(m), m);
    for (const [mid, m] of overrideBacked) {
      if (!candidates.has(mid) && getMatchStatus(m) === "live") candidates.set(mid, m);
    }
    for (const [mid, m] of flags.forcedLive) {
      if (!candidates.has(mid) && getMatchStatus(m) === "live") candidates.set(mid, m);
    }

    const entries = await Promise.all(
      Array.from(candidates.entries()).map(async ([mid, m]) => {
        if (flags.hidden.has(mid)) return null;
        if (flags.forcedLive.has(mid)) return m; // explicit admin force — show regardless
        const s = m.sources?.[0];
        if (!s) return null;
        const r = await resolveStreams({
          source: s.source,
          id: s.id,
          title: m.title,
          sport: m.category,
          disableAuto: flags.disableAuto.has(mid),
        });
        return r.streams.length > 0 ? m : null;
      })
    );

    let matches = entries.filter((m): m is Match => m !== null);
    // Featured first (stable otherwise)
    matches = matches
      .map((m, i) => ({ m, i, f: flags.featured.has(keyOf(m)) ? 1 : 0 }))
      .sort((a, b) => b.f - a.f || a.i - b.i)
      .map((x) => x.m);

    cache = { data: matches, ts: now };
    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ matches: cache?.data ?? [] });
  }
}
