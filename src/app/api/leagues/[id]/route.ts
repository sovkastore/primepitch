import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import type {
  CompetitionData,
  KnockoutRound,
  LeagueConfig,
  LeagueMatchRow,
  LeagueTab,
  StandingRow,
} from "@/lib/leagues";
import { dayOf } from "@/lib/leagues";
import { normTeamName } from "@/lib/api";

// One competition's public data, all from the D1 cache tables. Always
// scoped to the league's CURRENT season (max season_id) so August never mixes
// 25/26 with 26/27.
export const dynamic = "force-dynamic";

const COLS =
  "match_key,league_id,season_id,home_team,away_team,home_score,away_score,group_name,round_number,round_name,event_date,status";

let cache = new Map<string, { data: CompetitionData; ts: number }>();
const TTL = 60_000;

function resolveDefaultTab(cfg: LeagueConfig, fixturesCount: number, hasTable: boolean): LeagueTab {
  const dt = cfg.default_tab;
  if (dt === "fixtures" || dt === "results") return dt;
  if (dt === "table") return hasTable ? "table" : fixturesCount > 0 ? "fixtures" : "results";
  // "auto": prefer Fixtures when something's upcoming, else the Table (or Results).
  if (fixturesCount > 0) return "fixtures";
  return hasTable ? "table" : "results";
}

const KO_ROUND_NAMES = ["Playoff round", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
const KO_ORDER: Array<{ name: string; short: string }> = [
  { name: "Playoff round", short: "Play-off" },
  { name: "Round of 16", short: "R16" },
  { name: "Quarterfinals", short: "Q.Final" },
  { name: "Semifinals", short: "S.Final" },
  { name: "Final", short: "Final" },
];

// Two-legged knockout ties: pair the legs by team-pair, sum the aggregate, and
// mark the advancing side when the aggregate is decisive. Penalties aren't in
// the feed, so a level aggregate is left without a highlighted winner.
function buildKnockout(rows: LeagueMatchRow[]): KnockoutRound[] {
  const out: KnockoutRound[] = [];
  for (const { name, short } of KO_ORDER) {
    const inRound = rows.filter((r) => r.round_name === name);
    if (inRound.length === 0) continue;
    const groups = new Map<string, LeagueMatchRow[]>();
    for (const r of inRound) {
      const key = [r.home_team, r.away_team].sort().join(" :: ");
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }
    const ties = Array.from(groups.values()).map((legsRaw) => {
      const legs = [...legsRaw].sort(
        (a, b) => Date.parse(a.event_date) - Date.parse(b.event_date)
      );
      const teamA = legs[0].home_team;
      const teamB = legs[0].away_team;
      let aggA = 0;
      let aggB = 0;
      let haveScores = true;
      for (const lg of legs) {
        if (lg.home_score == null || lg.away_score == null) {
          haveScores = false;
          continue;
        }
        if (lg.home_team === teamA) {
          aggA += lg.home_score;
          aggB += lg.away_score;
        } else {
          aggA += lg.away_score;
          aggB += lg.home_score;
        }
      }
      const decided = haveScores && aggA !== aggB;
      return {
        teamA,
        teamB,
        single: legs.length === 1,
        aggA: haveScores ? aggA : null,
        aggB: haveScores ? aggB : null,
        winner: (decided ? (aggA > aggB ? "A" : "B") : null) as "A" | "B" | null,
        legs: legs.map((l) => ({
          home_team: l.home_team,
          away_team: l.away_team,
          home_score: l.home_score,
          away_score: l.away_score,
          event_date: l.event_date,
          status: l.status,
          match_key: l.match_key,
        })),
      };
    });
    ties.sort(
      (a, b) => Date.parse(a.legs[0].event_date) - Date.parse(b.legs[0].event_date)
    );
    out.push({ name, short, ties });
  }
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const leagueId = Number(idStr);
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ error: "bad league id" }, { status: 400 });
  }
  const reqDate = request.nextUrl.searchParams.get("date");
  const dateParam = reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate) ? reqDate : null;

  const cacheKey = `${leagueId}:${dateParam ?? ""}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.ts < TTL) return NextResponse.json(hit.data);

  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    const cfgRow = await d1.prepare(`
      SELECT league_id, label, enabled, display_order, has_table, default_tab
      FROM d1_league_config
      WHERE league_id = ?
    `).bind(leagueId).first<any>();
    if (!cfgRow) return NextResponse.json({ error: "unknown league" }, { status: 404 });
    const config: LeagueConfig = {
      ...cfgRow,
      enabled: cfgRow.enabled === 1,
      has_table: cfgRow.has_table === 1,
    };

    // Current season = highest season_id present for this league.
    const seasonRow = await d1.prepare(`
      SELECT season_id
      FROM d1_league_matches
      WHERE league_id = ?
      ORDER BY season_id DESC
      LIMIT 1
    `).bind(leagueId).first<{ season_id: number }>();
    const seasonId: number | null = seasonRow?.season_id ?? null;

    let fixtures: LeagueMatchRow[] = [];
    let finishedRows: LeagueMatchRow[] = [];
    let koRows: LeagueMatchRow[] = [];
    if (seasonId != null) {
      const [fxRes, finRes, koRes] = await Promise.all([
        d1.prepare(`
          SELECT match_key, league_id, season_id, home_team, away_team, home_score, away_score, group_name, round_number, round_name, event_date, status
          FROM d1_league_matches
          WHERE league_id = ? AND season_id = ? AND status = 'notstarted'
          ORDER BY event_date ASC
        `).bind(leagueId, seasonId).all(),
        d1.prepare(`
          SELECT match_key, league_id, season_id, home_team, away_team, home_score, away_score, group_name, round_number, round_name, event_date, status
          FROM d1_league_matches
          WHERE league_id = ? AND season_id = ? AND status = 'finished'
          ORDER BY event_date DESC
        `).bind(leagueId, seasonId).all(),
        d1.prepare(`
          SELECT match_key, league_id, season_id, home_team, away_team, home_score, away_score, group_name, round_number, round_name, event_date, status
          FROM d1_league_matches
          WHERE league_id = ? AND season_id = ? 
            AND round_name IN ('Playoff round', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final')
          ORDER BY event_date ASC
        `).bind(leagueId, seasonId).all(),
      ]);
      fixtures = (fxRes.results ?? []) as LeagueMatchRow[];
      finishedRows = (finRes.results ?? []) as LeagueMatchRow[];
      koRows = (koRes.results ?? []) as LeagueMatchRow[];
    }

    // Distinct result dates (most recent first), then the selected day's matches.
    const resultDates: string[] = [];
    const seen = new Set<string>();
    for (const r of finishedRows) {
      const d = dayOf(r.event_date);
      if (d && !seen.has(d)) {
        seen.add(d);
        resultDates.push(d);
      }
    }
    const defaultDate = resultDates[0] ?? null;
    const selectedDate =
      dateParam && resultDates.includes(dateParam) ? dateParam : defaultDate;
    const results = selectedDate
      ? finishedRows.filter((r) => dayOf(r.event_date) === selectedDate)
      : [];

    // Standings (Table tab).
    let standings: StandingRow[] = [];
    let grouped = false;
    let seasonName: string | null = null;
    if (config.has_table) {
      const stRow = await d1.prepare(`
        SELECT grouped, season_name, standings
        FROM d1_league_standings
        WHERE league_id = ?
      `).bind(leagueId).first<any>();
      if (stRow) {
        grouped = stRow.grouped === 1;
        seasonName = stRow.season_name ?? null;
        let parsedStandings = [];
        if (stRow.standings) {
          try {
            parsedStandings = JSON.parse(stRow.standings);
          } catch {
            parsedStandings = stRow.standings;
          }
        }
        standings = Array.isArray(parsedStandings) ? (parsedStandings as StandingRow[]) : [];
        standings.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      }
    }

    const knockout = buildKnockout(koRows);
    const tabs: LeagueTab[] = config.has_table
      ? ["results", "fixtures", "table"]
      : ["results", "fixtures"];
    if (knockout.length > 0) tabs.push("ko");
    const defaultTab = resolveDefaultTab(config, fixtures.length, config.has_table);

    // Team crests (TheSportsDB) keyed by normalized name -> standings + rows.
    const { results: crestRows } = await d1.prepare(`
      SELECT name, crest_url FROM d1_league_teams
    `).all();
    const crests: Record<string, string> = {};
    for (const cr of (crestRows ?? []) as any[]) {
      if (cr.name && cr.crest_url) {
        crests[normTeamName(cr.name)] = cr.crest_url;
      }
    }

    const data: CompetitionData = {
      config,
      tabs,
      defaultTab,
      seasonId,
      seasonName,
      fixtures,
      resultDates,
      defaultDate,
      selectedDate,
      results,
      standings,
      grouped,
      crests,
      knockout,
    };

    // Bound the cache so it can't grow unbounded across many date params.
    if (cache.size > 200) cache = new Map();
    cache.set(cacheKey, { data, ts: now });
    return NextResponse.json(data);
  } catch {
    const stale = cache.get(cacheKey);
    if (stale) return NextResponse.json(stale.data);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
