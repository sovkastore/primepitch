import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows } from "@/lib/match-merge";

export async function GET() {
  try {
    const env = (process as any).env;
    const d1 = env.DB as D1Database | undefined;

    // "Right now" = last 6 minutes (single heartbeat is 150s; tolerates one miss).
    const nowWindowDate = new Date(Date.now() - 6 * 60 * 1000);
    const nowWindow = nowWindowDate.toISOString();

    let activeData: any[] = [];
    let recentData: any[] = [];

    if (d1) {
      // 1) Get Real-time Presence from Cloudflare
      const activeRes = await d1.prepare(`
        SELECT visitor_id, match_id, path, last_seen 
        FROM d1_active_viewers 
        WHERE last_seen >= datetime('now', '-6 minutes')
      `).all();
      activeData = activeRes.results || [];

      // 2) Get Recent Activity from Cloudflare
      const recentRes = await d1.prepare(`
        SELECT path, device_type, created_at 
        FROM d1_page_views 
        ORDER BY created_at DESC 
        LIMIT 20
      `).all();
      recentData = recentRes.results || [];
    } else {
      // Fallback to Supabase
      const sb = getSupabaseAdmin();
      const [presence, activity] = await Promise.all([
        sb.from("active_viewers")
          .select("visitor_id, match_id, path, last_seen")
          .gte("last_seen", nowWindow),
        sb.from("page_views")
          .select("path, device_type, created_at")
          .order("created_at", { ascending: false })
          .limit(20)
      ]);
      activeData = presence.data || [];
      recentData = activity.data || [];
    }

    // onlineNow = anyone on the site; liveViewers = anyone on a watch page (match_id set).
    const onlineNow = activeData.length;
    const liveViewers = activeData.filter((r) => r.match_id).length;
    const totalActive = onlineNow;

    // Per-match viewer counts
    const matchViewers: Record<string, number> = {};
    const pageViewers: Record<string, number> = {};

    activeData.forEach((r) => {
      if (r.match_id) {
        matchViewers[r.match_id] = (matchViewers[r.match_id] || 0) + 1;
      }
      pageViewers[r.path] = (pageViewers[r.path] || 0) + 1;
    });

    const activeMatches = Object.entries(matchViewers)
      .sort(([, a], [, b]) => b - a)
      .map(([match_id, viewers]) => ({ match_id, viewers }));

    // Per-match traction stats (peak + unique) from Supabase (The Vault)
    const { data: statsData } = await getSupabaseAdmin()
      .from("match_stats")
      .select("match_id, match_title, sport, peak_viewers, peak_at, unique_viewers, updated_at, first_viewed")
      .order("updated_at", { ascending: false })
      .limit(25);

    const statsById: Record<string, { peak: number; unique: number }> = {};
    statsData?.forEach((s) => {
      statsById[s.match_id] = { peak: s.peak_viewers, unique: s.unique_viewers };
    });

    const enrichedMatches = activeMatches.map((m) => ({
      ...m,
      peak: statsById[m.match_id]?.peak ?? m.viewers,
      unique: statsById[m.match_id]?.unique ?? null,
    }));

    const activePages = Object.entries(pageViewers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([path, viewers]) => ({ path, viewers }));

    // ... (rest of the merging / clustering logic stays same)


    type Rec = NonNullable<typeof statsData>[number];
    const groups = clusterRows(statsData || [], {
      title: (r) => r.match_title,
      sport: (r) => r.sport,
      day: (r) => r.first_viewed || r.updated_at || "",
    });

    const mergedRecords = groups.map((rows: Rec[]) => {
      if (rows.length === 1) return rows[0];
      // Represent the group by its biggest listing; peak = max across listings.
      const top = rows.reduce((a, b) => (b.unique_viewers > a.unique_viewers ? b : a));
      return {
        ...top,
        peak_viewers: Math.max(...rows.map((r) => r.peak_viewers)),
        unique_viewers: -1, // recounted exactly below
        _ids: rows.map((r) => r.match_id),
      } as Rec & { _ids?: string[] };
    });

    // Exact unique recount for merged groups (one query, admin-only traffic).
    const mergedIds = mergedRecords.flatMap((r) => ("_ids" in r && r._ids ? r._ids : []));
    if (mergedIds.length > 0) {
      const { data: mv } = await getSupabaseAdmin()
        .from("match_views")
        .select("match_id, visitor_id")
        .in("match_id", mergedIds);
      for (const rec of mergedRecords) {
        const ids: string[] | null = ("_ids" in rec && Array.isArray(rec._ids)) ? (rec._ids as string[]) : null;
        if (!ids) continue;
        const set = new Set(mv?.filter((v) => ids.includes(v.match_id)).map((v) => v.visitor_id));
        rec.unique_viewers = set.size;
        delete (rec as { _ids?: string[] })._ids;
      }
    }
    mergedRecords.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

    return NextResponse.json({
      onlineNow,
      liveViewers,
      totalActive,
      activeMatches: enrichedMatches,
      matchRecords: mergedRecords,
      activePages,
      recentActivity: recentData || [],
    });
  } catch (e) {
    console.error("Live stats API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
