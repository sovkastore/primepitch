import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CompetitionData,
  LeagueConfig,
  LeagueMatchRow,
  LeagueTab,
  StandingRow,
} from "@/lib/leagues";
import { dayOf } from "@/lib/leagues";

// One competition's public data, all from the Supabase cache tables. Always
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
    const sb = getSupabaseAdmin();

    const { data: cfgRow } = await sb
      .from("league_config")
      .select("league_id,label,enabled,display_order,has_table,default_tab")
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!cfgRow) return NextResponse.json({ error: "unknown league" }, { status: 404 });
    const config = cfgRow as LeagueConfig;

    // Current season = highest season_id present for this league.
    const { data: seasonRow } = await sb
      .from("league_matches")
      .select("season_id")
      .eq("league_id", leagueId)
      .order("season_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const seasonId: number | null = seasonRow?.season_id ?? null;

    let fixtures: LeagueMatchRow[] = [];
    let finishedRows: LeagueMatchRow[] = [];
    if (seasonId != null) {
      const [{ data: fx }, { data: fin }] = await Promise.all([
        sb
          .from("league_matches")
          .select(COLS)
          .eq("league_id", leagueId)
          .eq("season_id", seasonId)
          .eq("status", "notstarted")
          .order("event_date", { ascending: true }),
        sb
          .from("league_matches")
          .select(COLS)
          .eq("league_id", leagueId)
          .eq("season_id", seasonId)
          .eq("status", "finished")
          .order("event_date", { ascending: false }),
      ]);
      fixtures = (fx ?? []) as LeagueMatchRow[];
      finishedRows = (fin ?? []) as LeagueMatchRow[];
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
      const { data: stRow } = await sb
        .from("league_standings")
        .select("grouped,season_name,standings")
        .eq("league_id", leagueId)
        .maybeSingle();
      if (stRow) {
        grouped = !!stRow.grouped;
        seasonName = stRow.season_name ?? null;
        standings = Array.isArray(stRow.standings) ? (stRow.standings as StandingRow[]) : [];
        standings.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      }
    }

    const tabs: LeagueTab[] = config.has_table
      ? ["results", "fixtures", "table"]
      : ["results", "fixtures"];
    const defaultTab = resolveDefaultTab(config, fixtures.length, config.has_table);

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
