import { getD1 } from "@/lib/d1";

// One shared copy of the BSD live-events feed for the whole site.
//
// BSD's free football tier allows 7,500 requests a day per account (reset at
// midnight UTC). Every route used to keep its own 30-second cache in Worker
// memory, but Cloudflare runs many Worker instances, each with its own
// memory, so each one refreshed on its own and the quota was gone by the
// afternoon. This module keeps the feed in D1 instead — the same idea as the
// RapidAPI match cache — so BSD is asked at most once per REFRESH_MS for the
// entire site, however many visitors are polling.
//
// On a 429 the cached copy keeps being served and refreshes pause: a minute
// for a burst limit, until the midnight reset when the daily quota is spent.
// Every outbound call is counted per day and source (d1_bsd_usage), and the
// remaining quota BSD reports in its RateLimit header is stored for admin.

const BSD_EVENTS_URL = "https://sports.bzzoiro.com/api/events/?limit=100";
const CACHE_KEY = "bsd_events_cache";
const STATUS_KEY = "bsd_status";
const REFRESH_MS = 60_000; // one BSD call a minute, site-wide
const BURST_BACKOFF_MS = 60_000;

export interface BsdEvent {
  id?: number | string;
  home_team: string;
  away_team: string;
  home_team_obj?: { name?: string; short_name?: string; country?: string } | null;
  away_team_obj?: { name?: string; short_name?: string; country?: string } | null;
  home_score?: number | null;
  away_score?: number | null;
  current_minute?: number | null;
  status?: string;
  period?: string;
  event_date?: string;
  league?: string;
  league_name?: string;
  [key: string]: unknown;
}

interface CacheRow {
  events: BsdEvent[];
  fetchedAt: number; // ms epoch of the last successful BSD fetch
  claimedAt: number; // ms epoch when an instance last started a refresh
  pausedUntil: number; // ms epoch; no refresh before this (429 backoff)
}

export interface BsdStatus {
  remaining: number | null; // from BSD's RateLimit header, if sent
  quota: number | null; // from RateLimit-Policy, if sent
  resetInSec: number | null;
  lastStatus: number | null;
  lastError: string | null;
  lastFetchAt: number | null;
  pausedUntil: number | null;
}

export interface BsdEventsResult {
  events: BsdEvent[];
  ageMs: number; // how old the served copy is
  refreshed: boolean; // true when this call hit BSD
}

// Per-instance memory cache so a burst of requests in the same instance
// doesn't each read D1. Short on purpose: D1 is the source of truth.
let local: { row: CacheRow; readAt: number } | null = null;
const LOCAL_MS = 5_000;

function parseRateLimit(res: Response): Partial<BsdStatus> {
  const out: Partial<BsdStatus> = {};
  const rl = res.headers.get("ratelimit") || res.headers.get("x-ratelimit") || "";
  const policy = res.headers.get("ratelimit-policy") || "";
  const r = /r=(\d+)/.exec(rl);
  const t = /t=(\d+)/.exec(rl);
  const q = /q=(\d+)/.exec(policy);
  if (r) out.remaining = Number(r[1]);
  if (t) out.resetInSec = Number(t[1]);
  if (q) out.quota = Number(q[1]);
  return out;
}

function nextMidnightUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

async function readRow(d1: D1Database, key: string): Promise<unknown | null> {
  const row = await d1
    .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeRow(d1: D1Database, key: string, value: unknown) {
  await d1
    .prepare(
      "INSERT INTO d1_site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(key, JSON.stringify(value), new Date().toISOString())
    .run();
}

// Counts a direct BSD call made outside the shared cache (admin lookups),
// so the usage figure in admin is complete.
export async function countBsdRequest(source: string): Promise<void> {
  const d1 = await getD1();
  if (d1) await countRequest(d1, source);
}

async function countRequest(d1: D1Database, source: string) {
  try {
    const day = new Date().toISOString().split("T")[0];
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS d1_bsd_usage (
          day TEXT NOT NULL,
          source TEXT NOT NULL,
          n INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, source)
        )`
      )
      .run();
    await d1
      .prepare(
        `INSERT INTO d1_bsd_usage (day, source, n) VALUES (?, ?, 1)
         ON CONFLICT(day, source) DO UPDATE SET n = n + 1`
      )
      .bind(day, source)
      .run();
  } catch {
    /* never let counting break the request */
  }
}

// The live-events feed, at most REFRESH_MS old unless BSD is unreachable or
// has rate-limited us, in which case the last good copy is served.
export async function getBsdEvents(source: string): Promise<BsdEventsResult> {
  const now = Date.now();
  const empty: CacheRow = { events: [], fetchedAt: 0, claimedAt: 0, pausedUntil: 0 };

  if (local && now - local.readAt < LOCAL_MS) {
    return { events: local.row.events, ageMs: now - local.row.fetchedAt, refreshed: false };
  }

  const d1 = await getD1();
  if (!d1) return { events: [], ageMs: Infinity, refreshed: false };

  let row = ((await readRow(d1, CACHE_KEY)) as CacheRow | null) ?? empty;
  const fresh = now - row.fetchedAt < REFRESH_MS;
  const paused = now < row.pausedUntil;
  // Another instance started a refresh moments ago — let it finish rather
  // than firing a duplicate call for the same minute.
  const claimedByOther = now - row.claimedAt < 15_000 && row.claimedAt > row.fetchedAt;

  if (fresh || paused || claimedByOther) {
    local = { row, readAt: now };
    return { events: row.events, ageMs: now - row.fetchedAt, refreshed: false };
  }

  // Claim the refresh first, so parallel instances see it and skip.
  row = { ...row, claimedAt: now };
  try {
    await writeRow(d1, CACHE_KEY, row);
  } catch {
    /* if the claim can't be written, still try the fetch below */
  }

  await countRequest(d1, source);
  const status: BsdStatus = {
    remaining: null,
    quota: null,
    resetInSec: null,
    lastStatus: null,
    lastError: null,
    lastFetchAt: now,
    pausedUntil: null,
  };

  try {
    const res = await fetch(BSD_EVENTS_URL, {
      headers: { Authorization: `Token ${process.env.BSD_API_KEY || ""}` },
      signal: AbortSignal.timeout(8000),
    });
    Object.assign(status, parseRateLimit(res));
    status.lastStatus = res.status;

    if (res.ok) {
      const data = (await res.json()) as { results?: BsdEvent[] };
      row = { events: data.results || [], fetchedAt: now, claimedAt: now, pausedUntil: 0 };
      await writeRow(d1, CACHE_KEY, row);
      await writeRow(d1, STATUS_KEY, status);
      local = { row, readAt: now };
      return { events: row.events, ageMs: 0, refreshed: true };
    }

    let code = "";
    try {
      const body = (await res.json()) as { code?: string; detail?: string; message?: string };
      code = body.code || "";
      status.lastError = body.detail || body.message || code || `HTTP ${res.status}`;
    } catch {
      status.lastError = `HTTP ${res.status}`;
    }
    if (res.status === 429) {
      // Daily quota spent: nothing before the midnight-UTC reset will succeed.
      row.pausedUntil = code === "taster_exhausted" ? nextMidnightUtc(now) : now + BURST_BACKOFF_MS;
      status.pausedUntil = row.pausedUntil;
      await writeRow(d1, CACHE_KEY, row);
    }
    await writeRow(d1, STATUS_KEY, status);
  } catch (e: unknown) {
    status.lastError = e instanceof Error ? e.message : String(e);
    try {
      await writeRow(d1, STATUS_KEY, status);
    } catch {
      /* ignore */
    }
  }

  local = { row, readAt: now };
  return { events: row.events, ageMs: now - row.fetchedAt, refreshed: false };
}

// For the admin panel: today's call count by source plus what BSD last told
// us about the remaining quota.
export async function getBsdUsage(): Promise<{
  today: { total: number; bySource: Record<string, number> };
  status: BsdStatus | null;
  limit: number;
}> {
  const limit = 7500;
  const d1 = await getD1();
  if (!d1) return { today: { total: 0, bySource: {} }, status: null, limit };
  const today = new Date().toISOString().split("T")[0];
  const bySource: Record<string, number> = {};
  let total = 0;
  try {
    const { results } = await d1
      .prepare("SELECT source, n FROM d1_bsd_usage WHERE day = ?")
      .bind(today)
      .all<{ source: string; n: number }>();
    for (const r of results ?? []) {
      bySource[r.source] = r.n;
      total += r.n;
    }
  } catch {
    /* table not created yet — no calls today */
  }
  const status = ((await readRow(d1, STATUS_KEY)) as BsdStatus | null) ?? null;
  return { today: { total, bySource }, status, limit };
}
