import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";
import { fetchRapidPage, type RapidFeedMatch } from "@/lib/rapid-fetch";
import { setMatchFlag } from "@/lib/match-flags";
import { findAiMatch } from "@/lib/ai-match";
import { findDeterministicMatch, normalizeTeamName, sameFixture, type CandidateMatch } from "@/lib/team-match";
import { saveMatchesCache } from "@/lib/match-cache";
import { getBsdEvents } from "@/lib/bsd-events";

// Auto-live robot: runs every minute via the Cloudflare cron trigger.
// From START_BEFORE_MS before an admin-activated BSD fixture's kickoff, it
// scans the feed (the whole live section plus the upcoming entries around the
// kickoff), matches the fixture against every entry at once (AI first,
// name-rules fallback), publishes the copy carrying the most streams, and hides
// the upcoming fixture. Before kickoff a match is only published once its
// entry actually carries stream servers — otherwise visitors would get an
// empty "select a server" card — so the robot keeps looking every minute
// until GIVE_UP_AFTER_MS past kickoff before giving up.
export const dynamic = "force-dynamic";

const START_BEFORE_MS = 5 * 60_000; // start looking 5 min before kickoff
const GIVE_UP_AFTER_MS = 3 * 60_000; // keep retrying until 3 min after kickoff
const UPCOMING_SCAN_WINDOW_SEC = 45 * 60; // how far past our kickoffs to read the upcoming section
// EMERGENCY BRAKE ONLY — the real stops are: match found, short page (list
// ended), and the no-live-matches page (past the live section). This ceiling
// exists purely so a malfunctioning feed (e.g. endlessly repeating full pages)
// can't burn the request budget; no real football day has 300 live matches.
const MAX_SCAN_PAGES = 15;
const PAGE_SIZE = 20; // a page shorter than this means the list ended
const LIVE_WINDOW_MINUTES = 130; // kickoff → ~full match incl. stoppage
const DEFAULT_REFRESH_MINUTES = 5; // shared stream refresh while anything is live
const EXPIRE_MINUTES = 150; // hide upcoming cards this long after kickoff — match is over

type RapidMatch = RapidFeedMatch;

// The feed sometimes lists one real match under several entries (different
// name spellings/languages) where only one carries stream servers. Given a
// matched entry, return the same-teams sibling with the most streams.
function bestVariantIndex(matches: RapidMatch[], idx: number): number {
  const norm = (m: RapidMatch) => ({
    h: normalizeTeamName(m.home_team_name || ""),
    a: normalizeTeamName(m.away_team_name || ""),
    t: Number(m.match_time || 0),
  });
  const score = (m: RapidMatch) =>
    ((m.servers?.length ?? 0) > 0 ? 1000 : 0) +
    (m.servers?.length ?? 0) +
    (m.match_status === "live" ? 500 : 0);
  const target = norm(matches[idx]);
  let best = idx;
  for (let i = 0; i < matches.length; i++) {
    if (i === best) continue;
    const c = norm(matches[i]);
    const same = sameFixture({ home: target.h, away: target.a, time: target.t }, { home: c.h, away: c.a, time: c.t });
    if (same && score(matches[i]) > score(matches[best])) best = i;
  }
  return best;
}

// A published copy is "weak" when a sibling copy has clearly more servers:
// at least 1.5x as many and at least 3 more. Then it is worth switching.
function clearlyBetter(candidate: number, current: number): boolean {
  return candidate >= current * 1.5 && candidate - current >= 3;
}

// When the refresher moves a match to a better copy, people who opened the
// old link keep working: match-flags publishes old → new and the watch page
// follows it.
async function rememberAlias(d1: D1Database, oldId: string, newId: string) {
  try {
    await d1.prepare(`CREATE TABLE IF NOT EXISTS d1_alt_alias (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL, created_at TEXT NOT NULL)`).run();
    await d1.prepare(`INSERT OR REPLACE INTO d1_alt_alias (old_id, new_id, created_at) VALUES (?, ?, ?)`).bind(oldId, newId, new Date().toISOString()).run();
    // Chain: anything that pointed at the old id now points at the new one.
    await d1.prepare(`UPDATE d1_alt_alias SET new_id = ? WHERE new_id = ?`).bind(newId, oldId).run();
  } catch { /* best effort */ }
}

async function ensureTable(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS d1_auto_live (
        match_id TEXT PRIMARY KEY,
        title TEXT,
        kickoff INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        method TEXT,
        detail TEXT,
        updated_at TEXT
      )`
    )
    .run();
  try {
    await d1.prepare("ALTER TABLE d1_auto_live ADD COLUMN live_id TEXT").run();
  } catch {
    /* column already exists */
  }
}


// One shared refresh for ALL currently-live matches: while any converted match
// is inside its live window (and not force-ended), re-pull the feed every
// N minutes so viewers always get the provider's latest server list. One
// request per tick regardless of how many games overlap.
async function refreshLiveStreams(
  d1: D1Database,
  state: Map<string, { match_id: string; status: string; attempts: number }>
): Promise<object | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const { results: liveRows } = await d1
    .prepare(
      "SELECT a.match_id, a.live_id FROM d1_auto_live a INNER JOIN d1_match_flags f ON f.match_id = a.live_id AND f.alt_visible = 1 WHERE a.status = 'converted' AND a.kickoff >= ? AND a.kickoff <= ?"
    )
    // Matches published ahead of kickoff count as live too, so their servers
    // keep refreshing through the last minutes before the whistle.
    .bind(nowSec - LIVE_WINDOW_MINUTES * 60, nowSec + START_BEFORE_MS / 1000)
    .all<{ match_id: string; live_id: string | null }>();
  if (!liveRows?.length) return null;

  // Skip matches the admin force-ended
  let live = liveRows;
  const liveIds = liveRows.map((r) => r.live_id).filter(Boolean) as string[];
  if (liveIds.length) {
    const { results: ended } = await d1
      .prepare(
        `SELECT match_id FROM d1_match_flags WHERE force_ended = 1 AND match_id IN (${liveIds.map(() => "?").join(",")})`
      )
      .bind(...liveIds)
      .all<{ match_id: string }>();
    const endedSet = new Set(ended?.map((r) => r.match_id) ?? []);
    live = liveRows.filter((r) => !r.live_id || !endedSet.has(r.live_id));
  }
  if (!live.length) return null;

  // Skip matches BSD reports finished (exact fixture-id match, from the
  // site-wide shared BSD cache) — refreshes stop at the real final whistle
  // instead of the 130-min clock.
  let finished = 0;
  try {
    const { events } = await getBsdEvents("robot full-time");
    const FT = new Set([
      "finished", "ft", "aet", "after_penalties", "ended", "awarded",
      "fulltime", "full_time", "full-time", "match_finished", "complete", "completed",
    ]);
    const doneIds = new Set(
      events
        .filter((e) => FT.has((e.status || "").toLowerCase().replace(/\s+/g, "_")))
        .map((e) => `bsd-${e.id}`)
    );
    const before = live.length;
    live = live.filter((r) => !doneIds.has(r.match_id));
    finished = before - live.length;
  } catch {
    /* BSD unavailable — fall back to the clock window */
  }
  if (!live.length) return { live: 0, refreshed: false, finished };

  let refreshMinutes = DEFAULT_REFRESH_MINUTES;
  try {
    const row = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = 'alt_api_config'")
      .first<{ value: string }>();
    const cfg = row?.value ? JSON.parse(row.value) : {};
    if (Number(cfg.live_refresh_minutes) > 0) refreshMinutes = Number(cfg.live_refresh_minutes);
  } catch {
    /* keep default */
  }

  const cacheRow = await d1
    .prepare("SELECT updated_at FROM d1_pro_matches_cache WHERE id = 'matches_cache'")
    .first<{ updated_at: number }>();
  const ageMs = Date.now() - Number(cacheRow?.updated_at || 0);
  if (ageMs < refreshMinutes * 60 * 1000) {
    return { live: live.length, refreshed: false, cacheAgeSeconds: Math.round(ageMs / 1000) };
  }

  const matches = await fetchRapidPage("live refresh", 1);
  if (!matches) return { live: live.length, refreshed: false, error: "RapidAPI unavailable" };

  // If a tracked live match's published entry has no servers in what we've
  // fetched, dig deeper pages (same natural stops as the kickoff scan) —
  // smaller matches often carry their streams on page 2+.
  const entryId = (m: RapidMatch) =>
    `alt-${(m.home_team_name || "").replace(/\s+/g, "")}-${(m.away_team_name || "").replace(/\s+/g, "")}-${m.match_time}`;
  const tracked = live.filter((r) => r.live_id);
  const serverless = () =>
    tracked.filter((r) => {
      const entry = matches.find((m) => entryId(m) === r.live_id);
      return !entry || (entry.servers?.length ?? 0) === 0;
    });

  let page = 1;
  let missing = serverless();
  while (missing.length > 0 && page < MAX_SCAN_PAGES) {
    const batch = await fetchRapidPage("live refresh", ++page);
    if (!batch) break;
    matches.push(...batch);
    missing = serverless();
    if (batch.length < 20 || !batch.some((m) => m.match_status === "live")) break;
  }

  // Auto-switch any serverless match — or one whose sibling copy clearly has
  // more servers — to the best copy (the duplicate-copy situation, healed
  // without an admin). Old link keeps working: match-flags maps it forward.
  let switched = 0;
  for (const r of tracked) {
    const curIdx = matches.findIndex((m) => entryId(m) === r.live_id);
    if (curIdx < 0) continue;
    const bestIdx = bestVariantIndex(matches, curIdx);
    if (bestIdx === curIdx) continue;
    const curN = matches[curIdx].servers?.length ?? 0;
    const bestN = matches[bestIdx].servers?.length ?? 0;
    if (curN > 0 && !clearlyBetter(bestN, curN)) continue;
    const m = matches[bestIdx];
    const newId = entryId(m);
    await setMatchFlag(d1, newId, true, {
      title: `${m.home_team_name} vs ${m.away_team_name}`,
      category: m.league_name,
    });
    await setMatchFlag(d1, r.live_id!, false);
    await d1
      .prepare("UPDATE d1_auto_live SET live_id = ?, detail = detail || ?, updated_at = ? WHERE match_id = ?")
      .bind(newId, ` → refresher switched to "${m.home_team_name} vs ${m.away_team_name}" (${bestN} servers, was ${curN})`, new Date().toISOString(), r.match_id)
      .run();
    await rememberAlias(d1, r.live_id!, newId);
    switched++;
  }

  await saveMatchesCache(d1, matches);

  const refreshCount = (state.get("live-refresh")?.attempts ?? 0) + 1;
  await logState(d1, "live-refresh", {
    title: "Live stream refresh",
    status: "refresh",
    attempts: refreshCount,
    detail: `Refreshed servers for ${live.length} live ${live.length === 1 ? "match" : "matches"} (${page} page${page === 1 ? "" : "s"}${switched ? `, switched ${switched} to stream-carrying copies` : ""}${finished ? `, ${finished} finished excluded` : ""}, every ${refreshMinutes} min)`,
  });
  return { live: live.length, refreshed: true, pages: page, switched };
}

async function logState(
  d1: D1Database,
  matchId: string,
  fields: { title?: string; kickoff?: number; status?: string; attempts?: number; method?: string; detail?: string; live_id?: string }
) {
  const row: Record<string, unknown> = {
    match_id: matchId,
    ...fields,
    updated_at: new Date().toISOString(),
  };
  const keys = Object.keys(row);
  await d1
    .prepare(
      `INSERT INTO d1_auto_live (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})
       ON CONFLICT(match_id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(", ")}`
    )
    .bind(...Object.values(row))
    .run();
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || "secret"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  await ensureTable(d1);

  // 1) Active BSD fixtures (admin toggled "Make Active" on the upcoming list)
  const { results: flagRows } = await d1
    .prepare("SELECT match_id, match_data FROM d1_match_flags WHERE (match_id LIKE 'bsd-%' OR match_id LIKE 'manual-%') AND alt_visible = 1")
    .all<{ match_id: string; match_data: string | null }>();

  const { results: stateRows } = await d1
    .prepare("SELECT match_id, status, attempts FROM d1_auto_live")
    .all<{ match_id: string; status: string; attempts: number }>();
  const state = new Map(stateRows?.map((r) => [r.match_id, r]) ?? []);

  const now = Date.now();
  type Due = {
    matchId: string;
    home: string;
    away: string;
    kickoff: number;
    league?: string;
    // Until this instant a no-match or a stream-less match is "not yet",
    // and the robot tries again next minute; after it, it's "not coming".
    deadlineMs: number;
  };
  const due: Due[] = [];

  for (const row of flagRows ?? []) {
    let meta: { home_team_name?: string; away_team_name?: string; match_time?: string; category?: string; title?: string } = {};
    try {
      meta = JSON.parse(row.match_data || "{}");
    } catch {
      /* ignore */
    }
    const kickoff = Number(meta.match_time || 0);

    // Match long over (converted or not): remove the stale upcoming card
    if (kickoff && now > (kickoff + EXPIRE_MINUTES * 60) * 1000) {
      await setMatchFlag(d1, row.match_id, false);
      await logState(d1, row.match_id, {
        title: meta.title || row.match_id,
        kickoff,
        status: "expired",
        detail: "Match over — upcoming card removed automatically",
      });
      continue;
    }

    const st = state.get(row.match_id);
    if (st && (st.status === "converted" || st.status === "given_up")) continue;
    if (!meta.home_team_name || !meta.away_team_name || !kickoff) continue;

    // In the window: from START_BEFORE_MS before kickoff onwards. (Fixtures
    // past the give-up deadline are still due — they get a final verdict
    // below, and the expiry check above removes the card once it's over.)
    if (now >= kickoff * 1000 - START_BEFORE_MS) {
      due.push({
        matchId: row.match_id,
        home: meta.home_team_name,
        away: meta.away_team_name,
        kickoff,
        league: meta.category,
        deadlineMs: kickoff * 1000 + GIVE_UP_AFTER_MS,
      });
    }
  }

  if (due.length === 0) {
    // No kickoffs due — but keep live matches' streams fresh (one shared request)
    const refresh = await refreshLiveStreams(d1, state);
    return NextResponse.json({ ok: true, checked: flagRows?.length ?? 0, due: 0, refresh });
  }

  // 2) Deep scan: fetch the paged feed only as deep as needed.
  // A completed scan with no match is proof the fixture isn't in the feed
  // right now — final once the fixture is past its give-up deadline.
  const latestKickoff = Math.max(...due.map((d) => d.kickoff));
  let pending: Due[] = [...due];
  const all: RapidMatch[] = [];
  let pagesFetched = 0;
  let feedEnded = false;
  let pastLiveSection = false;
  let apiFailed = false;
  const outcomes: object[] = [];

  // Returns false (and logs "waiting") when the match was found but none of
  // its copies carries a stream yet and kickoff hasn't arrived — the next
  // tick tries again. From kickoff on it publishes regardless, as before:
  // the stream refresher then heals a stream-less copy once servers appear.
  const convert = async (f: Due, matchedIndex: number, method: string, detail: string): Promise<boolean> => {
    // If the feed lists the same match under several entries, publish the
    // copy carrying streams.
    const finalIndex = bestVariantIndex(all, matchedIndex);
    if (finalIndex !== matchedIndex) {
      const was = all[matchedIndex];
      detail += ` → chose "${all[finalIndex].home_team_name} vs ${all[finalIndex].away_team_name}" (${all[finalIndex].servers?.length ?? 0} servers) over "${was.home_team_name} vs ${was.away_team_name}" (${was.servers?.length ?? 0})`;
    }
    const m = all[finalIndex];
    const hasServers = (m.servers?.length ?? 0) > 0;
    if (!hasServers && Date.now() < f.kickoff * 1000) {
      await logState(d1, f.matchId, {
        title: `${f.home} vs ${f.away}`,
        kickoff: f.kickoff,
        status: "waiting",
        attempts: pagesFetched,
        method,
        detail: `${detail} — found in the feed but no stream servers yet; checking again next minute`,
      });
      outcomes.push({ fixture: f.matchId, matched: true, published: false, waitingForStreams: true, method });
      return false;
    }
    const altId = `alt-${m.home_team_name.replace(/\s+/g, "")}-${m.away_team_name.replace(/\s+/g, "")}-${m.match_time}`;
    await setMatchFlag(d1, altId, true, {
      title: `${m.home_team_name} vs ${m.away_team_name}`,
      category: m.league_name,
    });
    await setMatchFlag(d1, f.matchId, false);
    await logState(d1, f.matchId, {
      title: `${f.home} vs ${f.away}`,
      kickoff: f.kickoff,
      status: "converted",
      attempts: pagesFetched,
      method,
      detail: `${detail} → live as ${altId}`,
      live_id: altId,
    });
    outcomes.push({ fixture: f.matchId, matched: true, live: altId, method });
    return true;
  };

  // Scan the WHOLE live section before matching. The feed lists one match
  // under several entries — different spellings, sometimes different kickoff
  // times — and only some carry streams. Stopping at the first hit used to
  // publish a dud while a 14-server copy sat on a later page.
  //
  // The provider lists ALL live matches before ALL upcoming ones. Because we
  // now start before kickoff, the fixture may still sit in the upcoming
  // section, so once the live section ends we keep reading while the pages
  // still hold entries kicking off around our fixtures (the upcoming list is
  // in kickoff order), and stop at the first page that is entirely later.
  const upcomingCutoff = latestKickoff + UPCOMING_SCAN_WINDOW_SEC;
  while (pagesFetched < MAX_SCAN_PAGES && !feedEnded && !apiFailed) {
    const batch = await fetchRapidPage("robot kickoff", pagesFetched + 1);
    if (batch === null) {
      apiFailed = true;
      break;
    }
    pagesFetched++;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) feedEnded = true;
    if (!batch.some((m) => m.match_status === "live")) pastLiveSection = true;
    if (pastLiveSection) {
      const anyNearOurKickoffs = batch.some((m) => Number(m.match_time || 0) <= upcomingCutoff);
      if (!anyNearOurKickoffs) break;
    }
  }

  // Match once against the complete candidate set — so bestVariantIndex can
  // compare every copy of the match and publish the one with most streams.
  const candidates: CandidateMatch[] = all.map((m, index) => ({
    index,
    home: m.home_team_name || "",
    away: m.away_team_name || "",
    matchTime: Number(m.match_time || 0),
  }));
  const scanNote = `${pagesFetched} page${pagesFetched === 1 ? "" : "s"}, ${all.length} entries`;

  if (candidates.length > 0) {
    const stillPending: Due[] = [];
    for (const f of pending) {
      try {
        const ai = await findAiMatch(
          { home: f.home, away: f.away, kickoff: f.kickoff, league: f.league },
          candidates
        );
        // The scan is already complete, so a medium match has nothing deeper
        // to wait for — accept it rather than dropping the fixture.
        if (ai.index !== null && (ai.confidence === "high" || ai.confidence === "medium")) {
          // A "waiting for streams" verdict is already logged by convert and
          // is deliberately not pending: it was found, just not published yet.
          await convert(
            f,
            ai.index,
            "ai",
            `AI matched with ${ai.confidence} confidence across the scanned feed (${scanNote}; ${ai.inputTokens}+${ai.outputTokens} tokens)`
          );
        } else {
          stillPending.push(f);
        }
      } catch (e: unknown) {
        const idx = findDeterministicMatch(
          { home: f.home, away: f.away, kickoff: f.kickoff },
          candidates
        );
        if (idx !== null) {
          const reason = (e instanceof Error ? e.message : String(e)).slice(0, 120);
          await convert(f, idx, "rules", `AI unavailable (${reason}) — rules fallback matched (${scanNote})`);
        } else {
          stillPending.push(f);
        }
      }
    }
    pending = stillPending;
  }

  if (all.length > 0) await saveMatchesCache(d1, all);

  // Anything still pending is absent from the scanned feed right now. Before
  // the give-up deadline that just means "not listed yet" — the feed often
  // adds a match only around kickoff — so the next tick looks again. After
  // the deadline a completed scan is the final word: no retry loop.
  const nowMs = Date.now();
  for (const f of pending) {
    if (apiFailed) {
      await logState(d1, f.matchId, {
        title: `${f.home} vs ${f.away}`,
        kickoff: f.kickoff,
        status: "pending",
        detail: "RapidAPI request failed mid-scan — will retry next minute",
      });
      outcomes.push({ fixture: f.matchId, matched: false, retry: true });
      continue;
    }
    if (nowMs < f.deadlineMs) {
      const minsToKickoff = Math.round((f.kickoff * 1000 - nowMs) / 60_000);
      await logState(d1, f.matchId, {
        title: `${f.home} vs ${f.away}`,
        kickoff: f.kickoff,
        status: "pending",
        attempts: pagesFetched,
        detail: `Not in the feed yet (${scanNote}${pastLiveSection ? ", live section + nearby upcoming" : ""}) — ${
          minsToKickoff > 0 ? `${minsToKickoff} min to kickoff` : "kickoff passed"
        }, checking again next minute`,
      });
      outcomes.push({ fixture: f.matchId, matched: false, retry: true });
      continue;
    }
    await logState(d1, f.matchId, {
      title: `${f.home} vs ${f.away}`,
      kickoff: f.kickoff,
      status: "given_up",
      attempts: pagesFetched,
      detail: `Not in the feed — scanned ${pagesFetched} page${pagesFetched === 1 ? "" : "s"} (${all.length} matches${feedEnded ? ", full list" : pastLiveSection ? ", covered the whole live section" : ""}) — left for manual handling`,
    });
    outcomes.push({ fixture: f.matchId, matched: false });
  }

  try {
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches-page-1");
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches");
  } catch {
    /* cache purge is best-effort */
  }

  // The conversion fetch just updated the cache, so this only fires a request
  // if the cache is genuinely stale (i.e. never right after a conversion).
  const refresh = await refreshLiveStreams(d1, state);

  return NextResponse.json({ ok: true, due: due.length, outcomes, refresh });
}
