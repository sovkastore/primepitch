import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows } from "@/lib/match-merge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport");
    const sort = searchParams.get("sort") || "views"; // "views" | "recent"
    const status = searchParams.get("status") || "played"; // played | live | upcoming | all
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = getSupabaseAdmin().from("match_views").select("*", { count: "exact" });

    if (sport) query = query.eq("sport", sport);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Aggregate by match_id. Supabase caps a single select at 1000 rows, which
    // silently undercounted unique/views once the log grew past 1000 (every
    // match was computed from an incomplete sample). Page through ALL matching
    // rows so the counts are exact. Ordered by id for stable pagination.
    const PAGE = 1000;
    const allData: Array<{
      match_id: string;
      match_title: string | null;
      sport: string | null;
      duration_sec: number | null;
      visitor_id: string;
      created_at: string;
      is_live: boolean | null;
    }> = [];
    for (let i = 0; i < 200; i++) {
      let pageQuery = getSupabaseAdmin()
        .from("match_views")
        .select("match_id, match_title, sport, duration_sec, visitor_id, created_at, is_live")
        .order("id", { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1);
      if (sport) pageQuery = pageQuery.eq("sport", sport);
      if (from) pageQuery = pageQuery.gte("created_at", from);
      if (to) pageQuery = pageQuery.lte("created_at", to);
      const { data: pageData, error: pageErr } = await pageQuery;
      if (pageErr || !pageData || pageData.length === 0) break;
      allData.push(...pageData);
      if (pageData.length < PAGE) break;
    }

    const grouped: Record<string, {
      title: string;
      sport: string;
      views: number;
      liveViews: number;
      preViews: number;
      uniqueViewers: Set<string>;
      liveViewers: Set<string>;
      totalDuration: number;
      lastViewed: string;
      firstViewed: string;
      lastLiveView: string | null;
    }> = {};

    allData?.forEach((r) => {
      if (!grouped[r.match_id]) {
        grouped[r.match_id] = {
          title: r.match_title || r.match_id,
          sport: r.sport || "",
          views: 0,
          liveViews: 0,
          preViews: 0,
          uniqueViewers: new Set(),
          liveViewers: new Set(),
          totalDuration: 0,
          lastViewed: r.created_at,
          firstViewed: r.created_at,
          lastLiveView: null,
        };
      }
      const g = grouped[r.match_id];
      g.views++;
      if (r.is_live) g.liveViews++; else g.preViews++;
      g.uniqueViewers.add(r.visitor_id);
      // A visitor who ever loaded the page while the match was live counts as a
      // live watcher; everyone else only showed up before kickoff.
      if (r.is_live) g.liveViewers.add(r.visitor_id);
      g.totalDuration += r.duration_sec || 0;
      if (r.created_at > g.lastViewed) g.lastViewed = r.created_at;
      if (r.created_at < g.firstViewed) g.firstViewed = r.created_at;
      if (r.is_live && (!g.lastLiveView || r.created_at > g.lastLiveView)) g.lastLiveView = r.created_at;
    });


    const merged: Record<string, {
      match_id: string;
      matchIds: string[];
      title: string;
      titleViews: number;
      sport: string;
      views: number;
      liveViews: number;
      preViews: number;
      uniqueViewers: Set<string>;
      liveViewers: Set<string>;
      totalDuration: number;
      lastViewed: string;
      lastLiveView: string | null;
    }> = {};

    const entries = Object.entries(grouped).map(([id, g]) => ({ id, ...g }));
    const clusters = clusterRows(entries, {
      title: (r) => r.title,
      sport: (r) => r.sport,
      day: (r) => r.firstViewed,
    });
    let ck = 0;
    for (const cluster of clusters) {
      const key = String(ck++);
      for (const g of cluster) {
        if (!merged[key]) {
          merged[key] = {
            match_id: g.id,
            matchIds: [],
            title: g.title,
            titleViews: g.views,
            sport: g.sport,
            views: 0,
            liveViews: 0,
            preViews: 0,
            uniqueViewers: new Set(),
            liveViewers: new Set(),
            totalDuration: 0,
            lastViewed: g.lastViewed,
            lastLiveView: null,
          };
        }
        const m = merged[key];
        m.matchIds.push(g.id);
        m.views += g.views;
        m.liveViews += g.liveViews;
        m.preViews += g.preViews;
        g.uniqueViewers.forEach((v) => m.uniqueViewers.add(v));
        g.liveViewers.forEach((v) => m.liveViewers.add(v));
        m.totalDuration += g.totalDuration;
        if (g.lastViewed > m.lastViewed) m.lastViewed = g.lastViewed;
        if (g.lastLiveView && (!m.lastLiveView || g.lastLiveView > m.lastLiveView)) m.lastLiveView = g.lastLiveView;
        // Represent the merged match with its most-viewed listing's title/sport.
        if (g.views > m.titleViews) { m.title = g.title; m.titleViews = g.views; m.sport = g.sport; m.match_id = g.id; }
      }
    }

    // Peak concurrent viewers (highest watching at once) per match, from
    // match_stats. A merged group's peak = the max across its listings.
    const peakById: Record<string, number> = {};
    const allMatchIds = Object.values(merged).flatMap((m) => m.matchIds);
    if (allMatchIds.length > 0) {
      const { data: statRows } = await getSupabaseAdmin()
        .from("match_stats")
        .select("match_id, peak_viewers")
        .in("match_id", allMatchIds);
      for (const s of (statRows ?? []) as Array<{ match_id: string; peak_viewers: number }>) {
        peakById[s.match_id] = s.peak_viewers ?? 0;
      }
    }

    // Classify: live = live viewers within the last 3h; played = had live
    // viewers earlier; upcoming = only preview visits so far.
    const LIVE_WINDOW = 3 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const classify = (g: { lastLiveView: string | null }) => {
      if (!g.lastLiveView) return "upcoming";
      return nowMs - Date.parse(g.lastLiveView) <= LIVE_WINDOW ? "live" : "played";
    };

    const matches = Object.values(merged)
      .map((g) => ({
        match_id: g.match_id,
        title: g.title,
        sport: g.sport,
        views: g.views,
        live_views: g.liveViews,
        pre_views: g.preViews,
        unique_viewers: g.uniqueViewers.size,
        unique_live: g.liveViewers.size,
        unique_pre: g.uniqueViewers.size - g.liveViewers.size,
        peak_viewers: Math.max(0, ...g.matchIds.map((id) => peakById[id] ?? 0)),
        avg_duration: g.views > 0 ? Math.round(g.totalDuration / g.views) : 0,
        last_viewed: g.lastViewed,
        status: classify(g),
      }))
      .filter((m) => status === "all" || m.status === status)
      .sort((a, b) =>
        sort === "recent"
          ? (a.last_viewed < b.last_viewed ? 1 : -1)
          : b.views - a.views
      )
      .slice(offset, offset + limit);

    return NextResponse.json({
      matches,
      total: Object.values(merged).filter((g) => status === "all" || classify(g) === status).length,
      page,
      raw: data,
      rawTotal: count,
    });
  } catch (e) {
    console.error("Matches API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
