import { NextRequest, NextResponse } from "next/server";

import { getBsdEvents } from "@/lib/bsd-events";

// Batched live scores: one request from the client covers every visible live
// match card (instead of one request per card). Shares the same matching
// logic as /api/live-score and reads the site-wide shared BSD cache (one BSD
// call a minute for everyone — see lib/bsd-events).

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

interface PairReq {
  key: string;
  home: string;
  away: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HALFTIME_STATUSES = new Set([
  "halftime", "half_time", "half-time", "ht", "paused", "break", "interval", "pause",
]);

function mapPeriod(status: string, period: string): string {
  if (HALFTIME_STATUSES.has((status || "").toLowerCase())) return "HT";
  return period || "";
}

function sideKeys(team: string, obj?: TeamObj): string[] {
  return [team, obj?.name, obj?.short_name]
    .filter((v): v is string => !!v)
    .map(normalize);
}

function sideMatches(requested: string, keys: string[]): boolean {
  return keys.some((k) => k.includes(requested) || requested.includes(k));
}

function findScore(events: BsdEvent[], home: string, away: string) {
  const homeN = normalize(home);
  const awayN = normalize(away);
  const candidates = events.filter((e) => {
    const homeKeys = sideKeys(e.home_team, e.home_team_obj);
    const awayKeys = sideKeys(e.away_team, e.away_team_obj);
    return sideMatches(homeN, homeKeys) && sideMatches(awayN, awayKeys);
  });
  const match = candidates.find((e) => e.home_score !== null) || null;
  if (!match || match.home_score === null) return null;
  return {
    home: match.home_score,
    away: match.away_score,
    minute: match.current_minute,
    status: match.status,
    period: mapPeriod(match.status, match.period),
    league: match.league?.name ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pairs: PairReq[] = Array.isArray(body?.pairs) ? body.pairs.slice(0, 40) : [];
    if (pairs.length === 0) return NextResponse.json({ scores: {} });

    const { events: feed } = await getBsdEvents("live-scores");
    const events = feed as unknown as BsdEvent[];
    const scores: Record<string, ReturnType<typeof findScore>> = {};
    for (const p of pairs) {
      if (!p?.key || !p?.home || !p?.away) continue;
      const s = findScore(events, p.home, p.away);
      if (s) scores[p.key] = s;
    }

    return NextResponse.json({ scores });
  } catch {
    return NextResponse.json({ scores: {} });
  }
}
