import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

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
    const [fxRes, stRes, evRes] = await Promise.all([
      fetch(`${BSD}/fixtures/?league=${LEAGUE}&limit=300`, { headers, signal: AbortSignal.timeout(9000) }),
      fetch(`${BSD}/leagues/${LEAGUE}/standings/`, { headers, signal: AbortSignal.timeout(9000) }),
      // Events feed carries live AND final scores even when the fixtures feed
      // lags — merged below so the Results tab always has real score lines.
      fetch(`${BSD}/events/?limit=100`, { headers, signal: AbortSignal.timeout(9000) }),
    ]);

    const fxData = fxRes.ok ? await fxRes.json() : { results: [] };
    const stData = stRes.ok ? await stRes.json() : { groups: {} };
    const evData = evRes.ok ? await evRes.json() : { results: [] };

    const rawFx: BsdFixture[] = fxData.results || (Array.isArray(fxData) ? fxData : []);
    const rawEv: BsdFixture[] = evData.results || (Array.isArray(evData) ? evData : []);

    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const evByTeams = new Map<string, BsdFixture>();
    for (const e of rawEv) {
      if (e.home_score === null || e.home_score === undefined) continue;
      evByTeams.set(`${norm(e.home_team)}|${norm(e.away_team)}`, e);
    }

    const fixtures = rawFx
      .map((e) => {
        // Enrich from the events feed when the fixture lacks score/up-to-date status.
        const ev = evByTeams.get(`${norm(e.home_team)}|${norm(e.away_team)}`);
        const home_score = e.home_score ?? ev?.home_score ?? null;
        const away_score = e.away_score ?? ev?.away_score ?? null;
        const status = (ev?.status && (e.status === "notstarted" || !e.status)) ? ev.status : (e.status || "");
        const minute = e.current_minute ?? ev?.current_minute ?? null;
        const period = e.period || ev?.period || "";
        return {
          id: e.id,
          group: e.group_name || null,
          round: e.round_number ?? null,
          date: e.event_date ? Date.parse(e.event_date) : 0,
          status,
          home: { name: e.home_team, country: e.home_team_obj?.country || e.home_team },
          away: { name: e.away_team, country: e.away_team_obj?.country || e.away_team },
          home_score,
          away_score,
          minute,
          period,
        };
      })
      .sort((a, b) => a.date - b.date);

    // ---- Permanent results archive (Supabase) ----
    // The upstream fixtures feed DROPS matches once played, so: (1) snapshot any
    // fixture that currently has a score into wc_results (last write = final
    // score); (2) merge archived results that the feed no longer carries back
    // into the response. This makes the Results tab permanent.
    const TEAM_ALIASES: Record<string, string> = {
      southkorea: "korearepublic", korea: "korearepublic",
      usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
      ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands",
    };
    const canon = (x: string) => { const n = norm(x); return TEAM_ALIASES[n] || n; };
    const dayOf = (ts: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : "tbd");
    const keyOf = (h: string, a: string, ts: number) => `${norm(h)}|${norm(a)}|${dayOf(ts)}`;
    const canonKeyOf = (h: string, a: string, ts: number) => `${canon(h)}|${canon(a)}|${dayOf(ts)}`;

    try {
      const d1 = await getD1();
      if (!d1) throw new Error("DB down");

      // (1) Snapshot scored fixtures (live or finished) — final write wins.
      const scored = fixtures.filter((f) => f.home_score !== null && f.date > 0);
      if (scored.length > 0) {
        for (const f of scored) {
          await d1.prepare(`
            INSERT OR REPLACE INTO d1_wc_results 
            (match_key, home_team, away_team, home_country, away_country, home_score, away_score, group_name, round_number, event_date, status, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            keyOf(f.home.name, f.away.name, f.date),
            f.home.name,
            f.away.name,
            f.home.country,
            f.away.country,
            f.home_score,
            f.away_score,
            f.group,
            f.round,
            new Date(f.date).toISOString(),
            f.status || "live",
            new Date().toISOString()
          ).run();
        }
      }

      // (2) Merge archived results the feed no longer carries.
      const { results: archived } = await d1.prepare(
        "SELECT * FROM d1_wc_results ORDER BY event_date DESC LIMIT 200"
      ).all();

      if (archived && archived.length > 0) {
        const present = new Set(fixtures.map((f) => canonKeyOf(f.home.name, f.away.name, f.date)));
        let syntheticId = -1;
        for (const r of archived as any[]) {
          const ts = r.event_date ? Date.parse(r.event_date as string) : 0;
          if (present.has(canonKeyOf(r.home_team as string, r.away_team as string, ts))) continue;
          fixtures.push({
            id: syntheticId--,
            group: (r.group_name as string) || null,
            round: (r.round_number as number) ?? null,
            date: ts,
            status: "finished",
            home: { name: r.home_team as string, country: (r.home_country as string) || (r.home_team as string) },
            away: { name: r.away_team as string, country: (r.away_country as string) || (r.away_team as string) },
            home_score: r.home_score as number,
            away_score: r.away_score as number,
            minute: null,
            period: "",
          });
        }
        fixtures.sort((a, b) => a.date - b.date);
      }
    } catch {
      // Archive issues must never break the page — feed data still returns.
    }

    const data = { groups: stData.groups || {}, fixtures };
    cache = { data, ts: now };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(cache?.data ?? { groups: {}, fixtures: [] });
  }
}
