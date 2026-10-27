import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getMatchStatus, normTeamKey } from "@/lib/api";
import type { Match } from "@/lib/api";
import { resolveStreams } from "@/lib/streams";

// "LIVE" = actually watchable. Start from streamed.pk's curated live set, union in
// admin override-backed and force-live matches (within their live window). Trust
// those buckets: streamed.pk lists a match live off ANY of its many servers (echo
// is just one of them), and an override carries its own stream — so drop only
// hidden matches or ones with no server at all, never on a single source coming
// back empty. Featured matches float to the top.

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
  popular: Set<string>;
  ok: boolean; // false when the database could not be read (flags missing)
}

import { getD1 } from "@/lib/d1";

async function getFlags(): Promise<FlagSets> {
  const hidden = new Set<string>();
  const disableAuto = new Set<string>();
  const featured = new Set<string>();
  const forcedLive = new Map<string, Match>();
  const renames = new Map<string, string>();
  const forceEnded = new Set<string>();
  const hot = new Set<string>();
  const popular = new Set<string>();
  let ok = false;
  try {
    const d1 = await getD1();
    if (d1) {
      const fetchFlags = (async () => {
        const { results } = await d1.prepare("SELECT match_id, hidden, forced_live, featured, disable_auto, match_data, display_title, force_ended, hot, popular FROM d1_match_flags").all();
        return results;
      })();
      const data = await Promise.race([
        fetchFlags,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
      ]);
      for (const r of data ?? []) {
        if (r.hidden) hidden.add(r.match_id);
        if (r.disable_auto) disableAuto.add(r.match_id);
        if (r.featured) featured.add(r.match_id);
        if (r.forced_live && r.match_data) forcedLive.set(r.match_id, typeof r.match_data === 'string' ? JSON.parse(r.match_data) : r.match_data);
        if (r.display_title) renames.set(r.match_id, r.display_title);
        if (r.force_ended) forceEnded.add(r.match_id);
        if (r.hot) hot.add(r.match_id);
        if (r.popular) popular.add(r.match_id);
      }
      ok = true;
    }
  } catch {
    /* DB timeout or match_flags may not exist — degrade to no flags */
  }
  return { hidden, forcedLive, disableAuto, featured, renames, forceEnded, hot, popular, ok };
}

async function getOverrideBacked(): Promise<Map<string, Match>> {
  const map = new Map<string, Match>();
  try {
    const d1 = await getD1();
    if (d1) {
      const fetchOverrides = (async () => {
        const { results } = await d1.prepare("SELECT match_id, match_data FROM d1_stream_overrides WHERE enabled = 1").all();
        return results;
      })();
      const data = await Promise.race([
        fetchOverrides,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
      ]);
      for (const r of data ?? []) {
        if (!map.has(r.match_id)) {
          if (r.match_data) {
            map.set(r.match_id, typeof r.match_data === 'string' ? JSON.parse(r.match_data) : r.match_data);
          } else {
            // Reconstruct a basic match if match_data is null, so it doesn't drop from live
            const parts = r.match_id.split("--");
            const src = parts[0] || "admin";
            const sid = parts.length > 1 ? parts.slice(1).join("--") : r.match_id;
            const title = sid.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            map.set(r.match_id, {
              id: r.match_id,
              title: title,
              category: "football",
              date: Date.now(),
              sources: [{ source: src, id: sid }]
            } as Match);
          }
        }
      }
    }
  } catch {
    /* DB timeout or match_data column may not exist — skip override-backed surfacing */
  }
  return map;
}

// Team-name key matching the push score-watcher's match_key (wc:home|away).
const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function isRealMatchOver(m: Match, finishedKeys: Set<string>): boolean {
  if (m.ended) return true;
  if (m.date && Number(m.date) > 0) {
    const diffMin = (m.date - Date.now()) / 1000 / 60;
    // If kickoff was more than 240 minutes (4 hours) ago, the match has finished.
    if (diffMin < -240) return true;
  }
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
    const d1 = await getD1();
    if (d1) {
      const fetchFinished = (async () => {
        const { results } = await d1.prepare("SELECT match_key FROM d1_push_match_state WHERE finished = 1").all();
        return results;
      })();
      const data = await Promise.race([
        fetchFinished,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
      ]);
      for (const r of data ?? []) {
        if (r.match_key) keys.add(r.match_key);
      }
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
      // Live set from the feeds (ppv.st + streamfree, lib/feed.ts).
      import("@/lib/feed")
        .then((f) => f.getFeedLive())
        .then((data) => ({ ok: true, data }))
        .catch(() => ({ ok: false, data: [] as Match[] })),
      getFlags(),
      getOverrideBacked(),
      getFinishedWcKeys(),
    ]);
    const curated: Match[] = liveRes.data;

    // Clean up any forcedLive entries in D1 that have expired
    const expiredForced = Array.from(flags.forcedLive.entries()).filter(([_, m]) => isRealMatchOver(m, finishedKeys));
    if (expiredForced.length > 0) {
      getD1().then((d1) => {
        if (!d1) return;
        for (const [mid] of expiredForced) {
          d1.prepare("UPDATE d1_match_flags SET forced_live = 0 WHERE match_id = ?").bind(mid).run().catch(() => {});
        }
      }).catch(() => {});
    }

    // Candidate set: curated live ∪ override-backed (in window) ∪ forced-live
    // (shown from the moment it's forced until it ends).
    const candidates = new Map<string, Match>();
    for (const m of curated) candidates.set(keyOf(m), m);
    for (const [mid, m] of overrideBacked) {
      m.isLive = true;
      if (!candidates.has(mid) && getMatchStatus(m) === "live") candidates.set(mid, m);
    }
    for (const [mid, m] of flags.forcedLive) {
      if (candidates.has(mid)) continue;
      // Explicit admin force = show it live NOW, however long before kickoff, until
      // the real game is reported finished, it ages out (kickoff+3h via
      // isRealMatchOver), or the admin ends/unforces it.
      if (isRealMatchOver(m, finishedKeys)) continue;
      m.isLive = true;
      candidates.set(mid, m);
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
    matches = matches.map((m) => {
      const tk = normTeamKey(m);
      return flags.hot.has(keyOf(m)) || flags.hot.has(m.id) || (tk && flags.hot.has(tk)) ? { ...m, hot: true } : m;
    });
    // Admin "POPULAR": flag the match so it displays in Popular tab.
    matches = matches.map((m) => {
      const tk = normTeamKey(m);
      return flags.popular.has(keyOf(m)) || flags.popular.has(m.id) || (tk && flags.popular.has(tk)) ? { ...m, popular: true } : m;
    });

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
          popular: Boolean(existing.popular || m.popular),
          hot: Boolean(existing.hot || m.hot),
          forced: Boolean(existing.forced || m.forced),
          ended: Boolean(existing.ended || m.ended),
        };
        merged.set(key, mergedMatch);
      }
    }
    const finalMatches = Array.from(merged.values())
      .map((m, i) => ({ m, i, f: flags.featured.has(keyOf(m)) ? 1 : 0 }))
      .sort((a, b) => b.f - a.f || a.i - b.i)
      .map((x) => ({ ...x.m, isLive: true }));

    // Degraded = the database or streamed.pk failed for this answer. It is
    // still served, but the edge layer won't store it as the shared copy.
    const degraded = !flags.ok || !liveRes.ok;
    if (!degraded) cache = { data: finalMatches, ts: now };
    return NextResponse.json(
      { matches: finalMatches },
      degraded ? { headers: { "x-pp-degraded": "1" } } : undefined
    );
  } catch {
    return NextResponse.json({ matches: cache?.data ?? [] }, { headers: { "x-pp-degraded": "1" } });
  }
}
