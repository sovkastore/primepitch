import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { getBsdEvents } from "@/lib/bsd-events";

// Final score lookup for ended matches: checks our permanent wc_results archive
// first, then the live events feed (which keeps recently-finished matches for a
// while). Used by the watch page's "match ended" state.

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string> = {
  southkorea: "korearepublic", korea: "korearepublic",
  usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands",
};
const canon = (s: string) => { const n = norm(s); return ALIASES[n] || n; };
const hit = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));

const DONE = new Set(["finished", "ft", "aet", "after_penalties", "ended", "awarded", "fulltime", "full_time"]);

interface Ev {
  home_team: string; away_team: string;
  home_score: number | null; away_score: number | null;
  status: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const home = canon(searchParams.get("home") || "");
    const away = canon(searchParams.get("away") || "");
    if (!home || !away) return NextResponse.json({ score: null });

    // 1) Our permanent archive
    const d1 = await getD1();
    let archived: any[] = [];
    if (d1) {
      try {
        const { results } = await d1.prepare(
          "SELECT home_team, away_team, home_score, away_score, group_name, event_date FROM d1_wc_results ORDER BY event_date DESC LIMIT 100"
        ).all();
        archived = results;
      } catch (e) {
        // Table might not exist yet
      }
    }

    const arch = archived?.find((r) => {
      const h = canon(r.home_team), a = canon(r.away_team);
      return (hit(home, h) && hit(away, a)) || (hit(home, a) && hit(away, h));
    });
    if (arch && arch.home_score !== null) {
      return NextResponse.json({
        score: { home: arch.home_score, away: arch.away_score },
        teams: { home: arch.home_team, away: arch.away_team },
        group: arch.group_name,
        from: "archive",
      });
    }

    // 2) Recently-finished events still in the feed (shared site-wide cache)
    {
      const { events: feed } = await getBsdEvents("final-score");
      const events = feed as unknown as Ev[];
      const ev = events.find((e) => {
        const h = canon(e.home_team), a = canon(e.away_team);
        return e.home_score !== null && DONE.has((e.status || "").toLowerCase()) &&
          ((hit(home, h) && hit(away, a)) || (hit(home, a) && hit(away, h)));
      });
      if (ev) {
        return NextResponse.json({
          score: { home: ev.home_score, away: ev.away_score },
          teams: { home: ev.home_team, away: ev.away_team },
          from: "events",
        });
      }
    }

    return NextResponse.json({ score: null });
  } catch {
    return NextResponse.json({ score: null });
  }
}
