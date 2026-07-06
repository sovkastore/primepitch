import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normTeamKey } from "@/lib/api";

// Public: which matches are hidden / featured / hot, so the upcoming lists
// can honor them. `hiddenTitles` carries a team-name key for each hidden match
// so the same fixture is hidden across every feed/league it appears under, not
// just the one id it was flagged on.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("match_flags")
      .select("match_id, hidden, hide_one, featured, hot, match_data");
    const hidden: string[] = [];
    const featured: string[] = [];
    const hot: string[] = [];
    const hiddenTitles: string[] = [];
    for (const r of (data ?? []) as Array<{ match_id: string; hidden: boolean; hide_one: boolean; featured: boolean; hot: boolean; match_data: unknown }>) {
      if (r.hidden) {
        // Whole-fixture hide: by id AND by team name (covers every copy).
        hidden.push(r.match_id);
        const key = normTeamKey((r.match_data ?? {}) as { teams?: { home?: { name?: string }; away?: { name?: string } }; title?: string });
        if (key) hiddenTitles.push(key);
      } else if (r.hide_one) {
        // "Hide this copy": id only — never expands to same-teams copies.
        hidden.push(r.match_id);
      }
      if (r.featured) featured.push(r.match_id);
      if (r.hot) hot.push(r.match_id);
    }
    return NextResponse.json({ hidden, featured, hot, hiddenTitles });
  } catch {
    return NextResponse.json({ hidden: [], featured: [], hot: [], hiddenTitles: [] });
  }
}
