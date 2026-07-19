import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMatchStatus, normTeamKey } from "@/lib/api";
import type { Match } from "@/lib/api";

// "LIVE" = actually watchable. Start from streamed.pk's curated live set, union in
// admin override-backed and force-live matches (within their live window). Trust
// those buckets: streamed.pk lists a match live off ANY of its many servers (echo
// is just one of them), and an override carries its own stream — so drop only
// hidden matches or ones with no server at all, never on a single source coming
// back empty. Featured matches float to the top.

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
  renames: Map<string, string>;
  forceEnded: Set<string>;
  hot: Set<string>;
}

import { withTimeout } from "@/lib/supabase/timeout";

async function getFlags(): Promise<FlagSets> {
  const hidden = new Set<string>();
  const disableAuto = new Set<string>();
  const featured = new Set<string>();
  const forcedLive = new Map<string, Match>();
  const renames = new Map<string, string>();
  const forceEnded = new Set<string>();
  const hot = new Set<string>();
  try {
    const { data } = (await withTimeout(
      getSupabaseAdmin()
        .from("match_flags")
        .select("match_id, hidden, forced_live, featured, disable_auto, match_data, display_title, force_ended, hot") as any
    )) as any;
    for (const r of (data ?? []) as Array<{
      match_id: string;
      hidden: boolean;
      forced_live: boolean;
      featured: boolean;
      disable_auto: boolean;
      match_data: Match | null;
      display_title?: string | null;
      force_ended?: boolean | null;
      hot?: boolean | null;
    }>) {
      if (r.hidden) hidden.add(r.match_id);
      if (r.disable_auto) disableAuto.add(r.match_id);
      if (r.featured) featured.add(r.match_id);
      if (r.forced_live && r.match_data) forcedLive.set(r.match_id, r.match_data);
      if (r.display_title) renames.set(r.match_id, r.display_title);
      if (r.force_ended) forceEnded.add(r.match_id);
      if (r.hot) hot.add(r.match_id);
    }
  } catch {
    /* DB timeout or match_flags may not exist — degrade to no flags */
  }
  return { hidden, forcedLive, disableAuto, featured, renames, forceEnded, hot };
}

async function getOverrideBacked(): Promise<Map<string, Match>> {
  const map = new Map<string, Match>();
  try {
    const { data } = (await withTimeout(
      getSupabaseAdmin()
        .from("stream_overrides")
        .select("match_id, match_data")
        .eq("enabled", true) as any
    )) as any;
    for (const r of (data ?? []) as Array<{ match_id: string; match_data: Match | null }>) {
      if (r.match_data && !map.has(r.match_id)) map.set(r.match_id, r.match_data);
    }
  } catch {
    /* DB timeout or match_data column may not exist — skip override-backed surfacing */
  }
  return map;
}

// Team-name key matching the push score-watcher's match_key (wc:home|away).
const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function isRealMatchOver(m: Match, finishedKeys: Set<string>): boolean {
  const h = normName(m.teams?.home?.name || "");
  const a = normName(m.teams?.away?.name || "");
  if (!h || !a) return false;
  return finishedKeys.has(`wc:${h}|${a}`) || finishedKeys.has(`wc:${a}|${h}`);
}

// WC matches the score-watcher has marked finished — lets us retire a force-lived
// card the moment the real game ends, instead of waiting for the kickoff+3h cap.
async function getFinishedWcKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const { data } = (await withTimeout(
      getSupabaseAdmin()
        .from("push_match_state")
        .select("match_key")
        .eq("finished", true) as any
    )) as any;
    for (const r of (data ?? []) as Array<{ match_key: string }>) {
      if (r.match_key) keys.add(r.match_key);
    }
  } catch {
    /* DB timeout or push_match_state may not exist — skip early retire */
  }
  return keys;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json({ matches: cache.data });
  }

  try {
    const [liveRes, flags, overrideBacked, finishedKeys] = await Promise.all([
      fetch(LIVE_URL, { signal: AbortSignal.timeout(8000) }),
      getFlags(),
      getOverrideBacked(),
      getFinishedWcKeys(),
    ]);
    const curated: Match[] = liveRes.ok ? await liveRes.json() : [];

    // Candidate set: curated live ∪ override-backed (in window) ∪ forced-live
    // (shown from the moment it's forced until it ends).
    const candidates = new Map<string, Match>();
    for (const m of curated) candidates.set(keyOf(m), m);
    for (const [mid, m] of overrideBacked) {
      if (!candidates.has(mid) && getMatchStatus(m) === "live") candidates.set(mid, m);
    }
    for (const [mid, m] of flags.forcedLive) {
      if (candidates.has(mid)) continue;
      // Explicit admin force = show it live NOW, however long before kickoff, until
      // the real game is reported finished, it ages out (kickoff+3h via
      // getMatchStatus), or the admin ends/unforces it. The finished check makes a
      // force-lived card drop off LIVE NOW the moment the actual match ends, instead
      // of lingering for the rest of the 3h window.
      if (isRealMatchOver(m, finishedKeys)) continue;
      if (getMatchStatus(m) !== "ended") candidates.set(mid, m);
    }

    const entries = Array.from(candidates.entries()).map(([mid, m]) => {
      if (flags.hidden.has(mid)) return null;
      if (flags.forcedLive.has(mid)) return isRealMatchOver(m, finishedKeys) ? null : { ...m, forced: true }; // admin force — show unless the real match is over
      // Every remaining candidate is either in streamed.pk's curated live feed
      // or backed by an enabled admin override — both mean it's genuinely live.
      // "echo" is only ONE of streamed.pk's many servers, so a match must NOT be
      // dropped just because its FIRST source has no native stream: its other
      // servers carry it, and streamed.pk itself shows it live off those. The
      // watch page resolves every source on open and plays whichever works, so
      // keep any candidate that has at least one server.
      if (!m.sources?.length) return null;
      return m;
    });

    let matches = entries.filter((m): m is Match => m !== null);
    // Admin renames: swap in the display title where one is set.
    matches = matches.map((m) =>
      flags.renames.has(keyOf(m)) ? { ...m, title: flags.renames.get(keyOf(m))! } : m
    );
    // Manual "End now": keep the card in the list but mark it ended so the
    // public card renders FULL TIME (greyed, unclickable) instead of LIVE.
    matches = matches.map((m) =>
      flags.forceEnded.has(keyOf(m)) ? { ...m, ended: true } : m
    );
    // Admin "HOT": flag the match so live cards + the watch page get the
    // premium treatment.
    matches = matches.map((m) =>
      flags.hot.has(keyOf(m)) ? { ...m, hot: true } : m
    );

    // Deduplicate live matches by category + normalized team names
    const richness = (m: Match) =>
      (m.teams?.home?.name ? 4 : 0) + (m.teams?.home?.badge ? 1 : 0) + (m.teams?.away?.badge ? 1 : 0);

    const merged = new Map<string, Match>();
    for (const m of matches) {
      const teamKey = normTeamKey(m);
      if (!teamKey) {
        merged.set(keyOf(m), m);
        continue;
      }
      const key = m.category ? `${m.category}|${teamKey}` : teamKey;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, m);
      } else {
        const mIsAdmin = !keyOf(m).includes("--") || m.forced;
        const existIsAdmin = !keyOf(existing).includes("--") || existing.forced;

        // Combine sources, prioritizing admin custom streams at the front
        const primarySources = mIsAdmin ? m.sources : existing.sources;
        const secondarySources = mIsAdmin ? existing.sources : m.sources;

        const combinedSources = [...(primarySources ?? [])];
        const seenSources = new Set(combinedSources.map(s => `${s.source}--${s.id}`));
        for (const s of secondarySources ?? []) {
          const sKey = `${s.source}--${s.id}`;
          if (!seenSources.has(sKey)) {
            seenSources.add(sKey);
            combinedSources.push(s);
          }
        }

        // Prefer admin/override metadata
        const preferNew = mIsAdmin || (!existIsAdmin && richness(m) > richness(existing));
        const mergedMatch: Match = {
          ...(preferNew ? m : existing),
          sources: combinedSources,
          hot: existing.hot || m.hot,
          forced: existing.forced || m.forced,
          ended: existing.ended || m.ended,
        };
        merged.set(key, mergedMatch);
      }
    }
    matches = Array.from(merged.values());

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
