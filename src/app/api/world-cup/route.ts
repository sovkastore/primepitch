import { NextResponse } from "next/server";

// FIFA World Cup 2026 = BSD league id 27. We expose its fixtures + ready-made group
// standings to the public /world-cup page. Cached server-side so the page can poll.

const BSD = "https://sports.bzzoiro.com/api";
const KEY = process.env.BSD_API_KEY || "";
const LEAGUE = 27;
const TTL = 60_000;

let cache: { data: unknown; ts: number } | null = null;

interface BsdFixture {
  id: number;
  home_team: string;
  away_team: string;
  home_team_obj?: { country?: string } | null;
  away_team_obj?: { country?: string } | null;
  event_date?: string;
  round_number?: number | null;
  group_name?: string | null;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
  current_minute?: number | null;
  period?: string;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const headers = { Authorization: `Token ${KEY}` };
    const [fxRes, stRes] = await Promise.all([
      fetch(`${BSD}/fixtures/?league=${LEAGUE}&limit=300`, { headers, signal: AbortSignal.timeout(9000) }),
      fetch(`${BSD}/leagues/${LEAGUE}/standings/`, { headers, signal: AbortSignal.timeout(9000) }),
    ]);

    const fxData = fxRes.ok ? await fxRes.json() : { results: [] };
    const stData = stRes.ok ? await stRes.json() : { groups: {} };

    const rawFx: BsdFixture[] = fxData.results || (Array.isArray(fxData) ? fxData : []);
    const fixtures = rawFx
      .map((e) => ({
        id: e.id,
        group: e.group_name || null,
        round: e.round_number ?? null,
        date: e.event_date ? Date.parse(e.event_date) : 0,
        status: e.status || "",
        home: { name: e.home_team, country: e.home_team_obj?.country || e.home_team },
        away: { name: e.away_team, country: e.away_team_obj?.country || e.away_team },
        home_score: e.home_score ?? null,
        away_score: e.away_score ?? null,
        minute: e.current_minute ?? null,
        period: e.period || "",
      }))
      .sort((a, b) => a.date - b.date);

    const data = { groups: stData.groups || {}, fixtures };
    cache = { data, ts: now };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(cache?.data ?? { groups: {}, fixtures: [] });
  }
}
