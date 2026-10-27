import { adminGuard } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { setMatchFlag } from "@/lib/match-flags";

// Manual fixtures: admin-created upcoming matches for games the BSD API
// doesn't carry (e.g. Community Shield). Stored as ordinary match-flags rows
// with a manual- id — the auto-live robot treats them exactly like BSD
// fixtures: at kickoff it scans the RapidAPI feed and the AI matches by
// team names + time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ fixtures: [] });
    const { results } = await d1
      .prepare(
        "SELECT match_id, alt_visible, match_data FROM d1_match_flags WHERE match_id LIKE 'manual-%' ORDER BY updated_at DESC LIMIT 50"
      )
      .all<{ match_id: string; alt_visible: number; match_data: string | null }>();
    const fixtures = (results ?? []).map((r) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(r.match_data || "{}");
      } catch {
        /* ignore */
      }
      return { match_id: r.match_id, alt_visible: r.alt_visible === 1, ...meta };
    });
    return NextResponse.json({ fixtures });
  } catch {
    return NextResponse.json({ fixtures: [] });
  }
}

export async function POST(request: NextRequest) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const home = String(body.home || "").trim();
    const away = String(body.away || "").trim();
    const league = String(body.league || "").trim() || "Football";
    const kickoff = Number(body.kickoff || 0); // unix seconds
    if (!home || !away || !kickoff) {
      return NextResponse.json({ error: "home, away and kickoff are required" }, { status: 400 });
    }

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const matchId = `manual-${Date.now()}`;
    await setMatchFlag(d1, matchId, true, {
      is_mock: true,
      title: `${home} vs ${away}`,
      category: league,
      home_team_name: home,
      away_team_name: away,
      match_time: String(kickoff),
      home_team_logo: null,
      away_team_logo: null,
    });
    return NextResponse.json({ ok: true, match_id: matchId });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
