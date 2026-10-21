// Daily big-game picker: fetches today's BSD fixtures, lets the AI decide
// which qualify as big games (keyword rules as fallback), and activates them
// as upcoming fixtures on /alt. The auto-live robot converts them at kickoff.
import { getD1 } from "@/lib/d1";
import { setMatchFlag } from "@/lib/match-flags";
import { pickBigGames, pickBigGamesFallback, type PickFixture } from "@/lib/ai-pick";
import { countBsdRequest } from "@/lib/bsd-events";

const BSD_API = "https://sports.bzzoiro.com/api/events/";
// BSD serves at most 200 events per page. A busy day has more than that, and
// the list is in kickoff order, so stopping at one page silently dropped the
// evening kickoffs. Page through the whole day (a handful of calls, once a day).
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

export const DEFAULT_CRITERIA = `PICK (no maximum — every fixture that qualifies):
- UEFA Champions League and UEFA Europa League matches
- ALL matches in the top 5 leagues: Premier League, La Liga, Serie A (Italy), Bundesliga, Ligue 1
- All domestic cup and super cup matches from those 5 countries: FA Cup, Carabao Cup, Community Shield, Copa del Rey, Supercopa de Espana, Coppa Italia, Supercoppa Italiana, DFB-Pokal, German Supercup, Coupe de France, Trophee des Champions
- UEFA Super Cup
- Turkish Super Lig: ONLY matches involving Galatasaray, Fenerbahce, Besiktas or Trabzonspor
- Saudi Pro League: ONLY matches involving Al Nassr, Al Hilal or Al Ittihad
- MLS: ONLY matches involving Inter Miami
DO NOT pick any other matches.`;

function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Order-independent key so "Mainz vs Bournemouth" and "Bournemouth vs Mainz"
// (the BSD feed lists some matches both ways) count as the same fixture.
function fixtureKey(home: string, away: string): string {
  return [normalizeTitle(home), normalizeTitle(away)].sort().join("|");
}

function fixtureKeyFromTitle(title: string): string {
  const parts = (title || "").split(/\s+vs\s+/i);
  return fixtureKey(parts[0] || "", parts[1] || "");
}

interface BsdFixture {
  id: string | number;
  home_team: string;
  away_team: string;
  event_date: string;
  league?: { name?: string };
  home_team_obj?: { short_name?: string };
  away_team_obj?: { short_name?: string };
}

export interface AutoPickConfig {
  enabled: boolean;
  criteria: string;
}

export interface AutoPickSummary {
  ok: boolean;
  ran: boolean;
  method?: string;
  considered?: number;
  picked?: number;
  newlyActivated?: number;
  deactivated?: number;
  detail?: string;
  error?: string;
}

export async function getAutoPickConfig(d1: D1Database): Promise<AutoPickConfig> {
  try {
    const row = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
      .bind("auto_pick_config")
      .first<{ value: string }>();
    if (row?.value) {
      const cfg = JSON.parse(row.value);
      return {
        enabled: cfg.enabled !== false,
        criteria: typeof cfg.criteria === "string" && cfg.criteria.trim() ? cfg.criteria : DEFAULT_CRITERIA,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { enabled: true, criteria: DEFAULT_CRITERIA };
}

export async function saveAutoPickConfig(d1: D1Database, cfg: AutoPickConfig) {
  await d1
    .prepare(
      `INSERT INTO d1_site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind("auto_pick_config", JSON.stringify(cfg))
    .run();
}

async function ensurePickTable(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS d1_auto_pick (
        match_id TEXT PRIMARY KEY,
        pick_date TEXT,
        title TEXT,
        league TEXT,
        reason TEXT,
        method TEXT,
        created_at TEXT
      )`
    )
    .run();
}

export async function runAutoPick(force = false): Promise<AutoPickSummary> {
  const d1 = await getD1();
  if (!d1) return { ok: false, ran: false, error: "DB unavailable" };
  await ensurePickTable(d1);

  const config = await getAutoPickConfig(d1);
  if (!config.enabled && !force) {
    return { ok: true, ran: false, detail: "Auto-pick is disabled" };
  }

  // Today's fixtures from BSD — every page of them
  const today = new Date().toISOString().split("T")[0];
  let fixtures: BsdFixture[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      await countBsdRequest("daily picker");
      const res = await fetch(`${BSD_API}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&date=${today}`, {
        headers: { Authorization: `Token ${process.env.BSD_API_KEY || ""}` },
      });
      if (!res.ok) throw new Error(`BSD API returned ${res.status}`);
      const data = (await res.json()) as { results?: BsdFixture[] };
      const batch = data.results || [];
      fixtures.push(...batch.filter((f) => f.event_date?.startsWith(today)));
      if (batch.length < PAGE_SIZE) break; // short page = end of the list
    }
    // The feed can repeat an id across pages when it shifts underneath us.
    const seen = new Set<string>();
    fixtures = fixtures.filter((f) => {
      const id = String(f.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  } catch (e: unknown) {
    return {
      ok: false,
      ran: true,
      error: `BSD fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (fixtures.length === 0) {
    return { ok: true, ran: true, considered: 0, picked: 0, detail: "No fixtures today" };
  }

  const pickInput: PickFixture[] = fixtures.map((f) => ({
    id: f.id,
    home: f.home_team,
    away: f.away_team,
    league: f.league?.name || "",
    eventDate: f.event_date,
  }));

  // AI first, keyword rules as fallback
  let picks: { id: string; reason: string }[];
  let method = "ai";
  let detail = "";
  try {
    const ai = await pickBigGames(config.criteria, pickInput);
    picks = ai.picks;
    detail = `AI picked ${picks.length} of ${fixtures.length} (${ai.inputTokens}+${ai.outputTokens} tokens)`;
  } catch (e: unknown) {
    method = "rules";
    picks = pickBigGamesFallback(pickInput);
    const reason = (e instanceof Error ? e.message : String(e)).slice(0, 120);
    detail = `AI unavailable (${reason}) — keyword fallback picked ${picks.length} of ${fixtures.length}`;
  }

  // Activate each pick, unless we already processed it (so an admin turning a
  // pick off stays off — re-runs never re-activate it). The BSD feed sometimes
  // lists the same real-world match under two ids, so also dedupe by teams+day.
  const byId = new Map(fixtures.map((f) => [String(f.id), f]));
  const activatedTitles = new Set<string>();
  try {
    const { results: priorPicks } = await d1
      .prepare("SELECT title FROM d1_auto_pick WHERE pick_date = ?")
      .bind(today)
      .all<{ title: string }>();
    for (const r of priorPicks ?? []) activatedTitles.add(fixtureKeyFromTitle(r.title));
  } catch {
    /* table empty */
  }
  let newlyActivated = 0;
  for (const pick of picks) {
    const f = byId.get(String(pick.id));
    if (!f) continue;
    const matchId = `bsd-${f.id}`;
    const titleKey = fixtureKey(f.home_team, f.away_team);

    if (activatedTitles.has(titleKey)) continue;

    const seen = await d1
      .prepare("SELECT match_id FROM d1_auto_pick WHERE match_id = ?")
      .bind(matchId)
      .first();
    if (seen) continue;
    activatedTitles.add(titleKey);

    await setMatchFlag(d1, matchId, true, {
      is_mock: true,
      title: `${f.home_team} vs ${f.away_team}`,
      category: f.league?.name || "Football",
      home_team_name: f.home_team,
      away_team_name: f.away_team,
      home_team_short: f.home_team_obj?.short_name || null,
      away_team_short: f.away_team_obj?.short_name || null,
      match_time: Math.floor(new Date(f.event_date).getTime() / 1000).toString(),
      home_team_logo: null,
      away_team_logo: null,
    });
    await d1
      .prepare(
        `INSERT INTO d1_auto_pick (match_id, pick_date, title, league, reason, method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        matchId,
        today,
        `${f.home_team} vs ${f.away_team}`,
        f.league?.name || "",
        pick.reason,
        method,
        new Date().toISOString()
      )
      .run();
    newlyActivated++;
  }

  // Re-sync: pull previously auto-picked fixtures that no longer qualify
  // under the current rules. Only when the AI ran (the keyword fallback is
  // coarser and would wrongly pull valid picks), only fixtures that haven't
  // kicked off, and never fixtures the admin activated manually (those have
  // no d1_auto_pick row).
  let deactivated = 0;
  if (method === "ai") {
    try {
      const pickIds = new Set(picks.map((p) => `bsd-${p.id}`));
      const { results: todaysRows } = await d1
        .prepare("SELECT match_id FROM d1_auto_pick WHERE pick_date = ?")
        .bind(today)
        .all<{ match_id: string }>();
      const nowSec = Math.floor(Date.now() / 1000);
      for (const r of todaysRows ?? []) {
        if (pickIds.has(r.match_id)) continue;
        const f = byId.get(r.match_id.replace(/^bsd-/, ""));
        if (!f) continue;
        const kickoff = Math.floor(new Date(f.event_date).getTime() / 1000);
        if (!kickoff || kickoff <= nowSec) continue; // started or live — leave alone
        await setMatchFlag(d1, r.match_id, false);
        await d1.prepare("DELETE FROM d1_auto_pick WHERE match_id = ?").bind(r.match_id).run();
        deactivated++;
      }
    } catch {
      /* re-sync is best-effort */
    }
  }

  return {
    ok: true,
    ran: true,
    method,
    considered: fixtures.length,
    picked: picks.length,
    newlyActivated,
    deactivated,
    detail: deactivated > 0 ? `${detail} — removed ${deactivated} no-longer-qualifying pick${deactivated === 1 ? "" : "s"}` : detail,
  };
}
