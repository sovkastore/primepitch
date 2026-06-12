import { NextRequest, NextResponse } from "next/server";

const BSD_API = "https://sports.bzzoiro.com/api/events/";
const BSD_KEY = process.env.BSD_API_KEY || "";

// Simple in-memory cache (30s TTL)
let cache: { data: unknown; ts: number } | null = null;

interface TeamObj {
  name?: string;
  short_name?: string;
}

interface BsdEvent {
  home_team: string;
  away_team: string;
  home_team_obj?: TeamObj;
  away_team_obj?: TeamObj;
  home_score: number | null;
  away_score: number | null;
  current_minute: number | null;
  status: string;
  period: string;
  league?: { name?: string } | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// BSD reports period as "1T"/"2T" (Italian tempo) and signals breaks via `status`.
// Normalize to "HT" so the UI's halftime state actually fires.
const HALFTIME_STATUSES = new Set([
  "halftime", "half_time", "half-time", "ht", "paused", "break", "interval", "pause",
]);

function mapPeriod(status: string, period: string): string {
  if (HALFTIME_STATUSES.has((status || "").toLowerCase())) return "HT";
  return period || "";
}

// Every name a side might be known by, normalized, for loose matching.
function sideKeys(team: string, obj?: TeamObj): string[] {
  return [team, obj?.name, obj?.short_name]
    .filter((v): v is string => !!v)
    .map(normalize);
}

function sideMatches(requested: string, keys: string[]): boolean {
  return keys.some((k) => k.includes(requested) || requested.includes(k));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const home = searchParams.get("home") || "";
    const away = searchParams.get("away") || "";

    if (!home || !away) {
      return NextResponse.json({ score: null });
    }

    // Use cache if fresh
    const now = Date.now();
    if (!cache || now - cache.ts > 30_000) {
      const res = await fetch(`${BSD_API}?limit=100`, {
        headers: { Authorization: `Token ${BSD_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        cache = { data: data.results || [], ts: now };
      }
    }

    const events = (cache?.data as BsdEvent[]) || [];

    const homeN = normalize(home);
    const awayN = normalize(away);

    // All name-matching events, then prefer one that actually has a score
    // (skips duplicate `notstarted` rows for the same fixture).
    const candidates = events.filter((e) => {
      const homeKeys = sideKeys(e.home_team, e.home_team_obj);
      const awayKeys = sideKeys(e.away_team, e.away_team_obj);
      return sideMatches(homeN, homeKeys) && sideMatches(awayN, awayKeys);
    });

    const match = candidates.find((e) => e.home_score !== null) || null;

    if (!match || match.home_score === null) {
      return NextResponse.json({ score: null });
    }

    return NextResponse.json({
      score: {
        home: match.home_score,
        away: match.away_score,
        minute: match.current_minute,
        status: match.status,
        period: mapPeriod(match.status, match.period),
        league: match.league?.name ?? null,
      },
    });
  } catch {
    return NextResponse.json({ score: null });
  }
}
