import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { getBsdEvents } from "@/lib/bsd-events";

// Live scores for the /alt page, from the site-wide shared BSD events cache
// (one BSD call a minute for everyone — see lib/bsd-events). Robot-converted
// matches are matched by their exact BSD fixture id (recorded at conversion
// time); everything else can be name-matched client-side.

const FINISHED_STATUSES = new Set([
  "finished", "ft", "aet", "after_penalties", "ended", "awarded",
  "fulltime", "full_time", "full-time", "match_finished", "complete", "completed",
]);
const HALFTIME_STATUSES = new Set([
  "halftime", "half_time", "half-time", "ht", "paused", "break", "interval", "pause",
]);

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  const { events } = await getBsdEvents("alt-scores");

  // bsd fixture id -> live alt id, recorded by the robot at conversion
  const links: Record<string, string> = {};
  try {
    const d1 = await getD1();
    if (d1) {
      const nowSec = Math.floor(now / 1000);
      const { results } = await d1
        .prepare(
          "SELECT match_id, live_id FROM d1_auto_live WHERE status = 'converted' AND live_id IS NOT NULL AND kickoff >= ?"
        )
        .bind(nowSec - 4 * 3600)
        .all<{ match_id: string; live_id: string }>();
      for (const r of results ?? []) {
        links[r.match_id.replace(/^bsd-/, "")] = r.live_id;
      }
    }
  } catch {
    /* id-links are an enhancement — name matching still works without them */
  }

  const scores = events
    .filter((e) => e.home_team && e.away_team)
    .map((e) => {
      const status = (e.status || "").toLowerCase().replace(/\s+/g, "_");
      return {
        bsdId: String(e.id ?? ""),
        altId: links[String(e.id ?? "")] || null,
        home: e.home_team,
        away: e.away_team,
        homeScore: e.home_score ?? null,
        awayScore: e.away_score ?? null,
        minute: e.current_minute ?? null,
        period: HALFTIME_STATUSES.has(status) ? "HT" : e.period || "",
        ended: FINISHED_STATUSES.has(status),
      };
    });

  return NextResponse.json(
    { scores },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
