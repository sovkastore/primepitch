import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";
import { setMatchFlag } from "@/lib/match-flags";
import { findAiMatch } from "@/lib/ai-match";
import { findDeterministicMatch, type CandidateMatch } from "@/lib/team-match";

// Auto-live robot: runs every minute via the Cloudflare cron trigger.
// For every admin-activated BSD fixture past kickoff, it makes ONE RapidAPI
// request, finds the matching live stream (Claude first, name-rules fallback),
// makes it visible on /alt and hides the upcoming fixture.
export const dynamic = "force-dynamic";

const KICKOFF_OFFSET_MS = 30_000; // ask 30s after kickoff
const MAX_ATTEMPTS = 8; // ~8 minutes of retries, then leave it for the admin
const ACCEPT_MEDIUM_AFTER = 3; // early attempts require high AI confidence

const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";

interface RapidMatch {
  home_team_name: string;
  away_team_name: string;
  match_time: string | number;
  league_name?: string;
  home_team_logo?: string;
  away_team_logo?: string;
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
}

async function fetchRapidMatches(): Promise<RapidMatch[] | null> {
  const keys = (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  for (const apiKey of keys) {
    try {
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

async function logState(
  d1: D1Database,
  matchId: string,
  fields: { title?: string; kickoff?: number; status?: string; attempts?: number; method?: string; detail?: string }
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
    const st = state.get(row.match_id);
    if (st && (st.status === "converted" || st.status === "given_up")) continue;

    let meta: { home_team_name?: string; away_team_name?: string; match_time?: string; category?: string } = {};
    try {
      meta = JSON.parse(row.match_data || "{}");
    } catch {
      /* ignore */
    }
    const kickoff = Number(meta.match_time || 0);
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
    return NextResponse.json({ ok: true, checked: flagRows?.length ?? 0, due: 0 });
  }

  // 2) Wait inside the tick so the request fires ~30s after kickoff, not at :00
  const latestTarget = Math.max(...due.map((d) => d.targetMs));
  if (latestTarget > Date.now()) {
    await new Promise((r) => setTimeout(r, Math.min(latestTarget - Date.now(), 55_000)));
  }

  // 3) The ONE RapidAPI request, shared by all due fixtures and all visitors
  const matches = await fetchRapidMatches();
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

    // 5) The swap: live match visible, BSD fixture hidden
    const m = matches[matchedIndex];
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

  return NextResponse.json({ ok: true, due: due.length, outcomes });
}
