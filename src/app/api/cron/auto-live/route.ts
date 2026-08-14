import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";
import { countRapidRequest } from "@/lib/rapid-count";
import { setMatchFlag } from "@/lib/match-flags";
import { findAiMatch } from "@/lib/ai-match";
import { findDeterministicMatch, namesMatch, normalizeTeamName, type CandidateMatch } from "@/lib/team-match";

// Auto-live robot: runs every minute via the Cloudflare cron trigger.
// For every admin-activated BSD fixture past kickoff, it makes ONE RapidAPI
// request, finds the matching live stream (Claude first, name-rules fallback),
// makes it visible on /alt and hides the upcoming fixture.
export const dynamic = "force-dynamic";

const KICKOFF_OFFSET_MS = 30_000; // ask 30s after kickoff
const MAX_ATTEMPTS = 8; // ~8 minutes of retries, then leave it for the admin
const ACCEPT_MEDIUM_AFTER = 3; // early attempts require high AI confidence
const LIVE_WINDOW_MINUTES = 130; // kickoff → ~full match incl. stoppage
const DEFAULT_REFRESH_MINUTES = 5; // shared stream refresh while anything is live
const EXPIRE_MINUTES = 150; // hide upcoming cards this long after kickoff — match is over

const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";

interface RapidMatch {
  home_team_name: string;
  away_team_name: string;
  match_time: string | number;
  match_status?: string;
  league_name?: string;
  home_team_logo?: string;
  away_team_logo?: string;
  servers?: unknown[];
}

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
    const sameTeams =
      (namesMatch(target.h, c.h) && namesMatch(target.a, c.a)) ||
      (namesMatch(target.h, c.a) && namesMatch(target.a, c.h));
    const sameWindow = !target.t || !c.t || Math.abs(target.t - c.t) <= 3 * 3600;
    if (sameTeams && sameWindow && score(matches[i]) > score(matches[best])) best = i;
  }
  return best;
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

async function fetchRapidMatches(source: string): Promise<RapidMatch[] | null> {
  const keys = (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  for (const apiKey of keys) {
    try {
      await countRapidRequest(source);
      const res = await fetch(`https://${RAPID_API_HOST}/matches?page=1`, {
        headers: { "x-rapidapi-host": RAPID_API_HOST, "x-rapidapi-key": apiKey },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as
        | RapidMatch[]
        | { matches?: RapidMatch[]; data?: RapidMatch[]; results?: RapidMatch[] };
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.matches)) return data.matches;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.results)) return data.results;
    } catch {
      /* try next key */
    }
  }
  return null;
}

async function saveMatchesCache(d1: D1Database, matches: RapidMatch[]) {
  await d1
    .prepare(
      `INSERT INTO d1_pro_matches_cache (id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .bind("matches_cache", JSON.stringify(matches), Date.now())
    .run();
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
      "SELECT match_id, live_id FROM d1_auto_live WHERE status = 'converted' AND kickoff >= ? AND kickoff <= ?"
    )
    .bind(nowSec - LIVE_WINDOW_MINUTES * 60, nowSec)
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

  const matches = await fetchRapidMatches("live refresh");
  if (!matches) return { live: live.length, refreshed: false, error: "RapidAPI unavailable" };
  await saveMatchesCache(d1, matches);

  const refreshCount = (state.get("live-refresh")?.attempts ?? 0) + 1;
  await logState(d1, "live-refresh", {
    title: "Live stream refresh",
    status: "refresh",
    attempts: refreshCount,
    detail: `Refreshed servers for ${live.length} live ${live.length === 1 ? "match" : "matches"} (one shared request, every ${refreshMinutes} min)`,
  });
  return { live: live.length, refreshed: true };
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
    .prepare("SELECT match_id, match_data FROM d1_match_flags WHERE match_id LIKE 'bsd-%' AND alt_visible = 1")
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
    attempts: number;
    targetMs: number;
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

    const attempts = st?.attempts ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      await logState(d1, row.match_id, {
        status: "given_up",
        detail: `No stream found after ${attempts} attempts — left for manual handling`,
      });
      continue;
    }

    const targetMs = kickoff * 1000 + KICKOFF_OFFSET_MS;
    // Due now, or due within this cron tick (we'll wait for the 30s offset)
    if (now >= targetMs || targetMs - now < 55_000) {
      due.push({
        matchId: row.match_id,
        home: meta.home_team_name,
        away: meta.away_team_name,
        kickoff,
        league: meta.category,
        attempts,
        targetMs,
      });
    }
  }

  if (due.length === 0) {
    // No kickoffs due — but keep live matches' streams fresh (one shared request)
    const refresh = await refreshLiveStreams(d1, state);
    return NextResponse.json({ ok: true, checked: flagRows?.length ?? 0, due: 0, refresh });
  }

  // 2) Wait inside the tick so the request fires ~30s after kickoff, not at :00
  const latestTarget = Math.max(...due.map((d) => d.targetMs));
  if (latestTarget > Date.now()) {
    await new Promise((r) => setTimeout(r, Math.min(latestTarget - Date.now(), 55_000)));
  }

  // 3) The ONE RapidAPI request, shared by all due fixtures and all visitors
  const matches = await fetchRapidMatches("robot kickoff");
  if (!matches) {
    for (const f of due) {
      await logState(d1, f.matchId, {
        title: `${f.home} vs ${f.away}`,
        kickoff: f.kickoff,
        status: "pending",
        attempts: f.attempts + 1,
        detail: "RapidAPI request failed — will retry",
      });
    }
    return NextResponse.json({ ok: false, error: "RapidAPI unavailable" }, { status: 502 });
  }
  await saveMatchesCache(d1, matches);

  const candidates: CandidateMatch[] = matches.map((m, index) => ({
    index,
    home: m.home_team_name || "",
    away: m.away_team_name || "",
    matchTime: Number(m.match_time || 0),
  }));

  // 4) Match each due fixture: Claude first, rules fallback
  const outcomes: object[] = [];
  for (const f of due) {
    let matchedIndex: number | null = null;
    let method = "ai";
    let detail = "";

    try {
      const ai = await findAiMatch(
        { home: f.home, away: f.away, kickoff: f.kickoff, league: f.league },
        candidates
      );
      const accept =
        ai.confidence === "high" || (ai.confidence === "medium" && f.attempts >= ACCEPT_MEDIUM_AFTER);
      matchedIndex = accept ? ai.index : null;
      detail =
        ai.index === null
          ? `AI found no match in feed (${ai.inputTokens}+${ai.outputTokens} tokens)`
          : accept
            ? `AI matched with ${ai.confidence} confidence (${ai.inputTokens}+${ai.outputTokens} tokens)`
            : `AI match rejected: ${ai.confidence} confidence too low`;
    } catch (e: unknown) {
      method = "rules";
      matchedIndex = findDeterministicMatch(
        { home: f.home, away: f.away, kickoff: f.kickoff },
        candidates
      );
      const reason = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      detail = `AI unavailable (${reason}) — rules fallback ${
        matchedIndex === null ? "found no match" : "matched"
      }`;
    }

    if (matchedIndex === null) {
      await logState(d1, f.matchId, {
        title: `${f.home} vs ${f.away}`,
        kickoff: f.kickoff,
        status: "pending",
        attempts: f.attempts + 1,
        method,
        detail,
      });
      outcomes.push({ fixture: f.matchId, matched: false, method, detail });
      continue;
    }

    // 5) The swap: live match visible, BSD fixture hidden. If the feed lists
    // the same match under several entries, publish the copy with streams.
    const finalIndex = bestVariantIndex(matches, matchedIndex);
    if (finalIndex !== matchedIndex) detail += " → switched to the copy carrying streams";
    const m = matches[finalIndex];
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
      attempts: f.attempts + 1,
      method,
      detail: `${detail} → live as ${altId}`,
      live_id: altId,
    });
    outcomes.push({ fixture: f.matchId, matched: true, live: altId, method });
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
