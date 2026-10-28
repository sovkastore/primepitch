import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { TOP_LEAGUES, ensureTopClubs, loadTopClubs, saveTopClubs, currentSeasonYear } from "@/lib/top-clubs";

export const dynamic = "force-dynamic";

// GET: the saved top-flight club lists (downloads them the first time only).
export async function GET(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  const clubs = (await loadTopClubs(d1)) ?? (await ensureTopClubs(d1).catch(() => null));
  return NextResponse.json({ leagues: TOP_LEAGUES, clubs });
}

// POST { action: "redownload" }            → fresh download of every league
// POST { action: "save", league, teams[] } → hand-edited list (kept as-is)
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; league?: string; teams?: unknown };

  if (body.action === "redownload") {
    const clubs = await ensureTopClubs(d1, true);
    return NextResponse.json({ ok: true, clubs });
  }

  if (body.action === "save" && TOP_LEAGUES.some((l) => l.key === body.league) && Array.isArray(body.teams)) {
    const teams = [...new Set(body.teams.map((t) => String(t).trim()).filter(Boolean))].slice(0, 40);
    const saved = (await loadTopClubs(d1)) ?? { season: currentSeasonYear(), updatedAt: "", leagues: {} };
    // Name-only after a hand edit, so a club removed by the admin really is gone.
    saved.leagues[body.league!] = { ...(saved.leagues[body.league!] || {}), teams, teamIds: [], manual: true };
    saved.updatedAt = new Date().toISOString();
    await saveTopClubs(d1, saved);
    return NextResponse.json({ ok: true, clubs: saved });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
