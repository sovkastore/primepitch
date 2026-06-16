import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clusterRows, normTitle } from "@/lib/match-merge";
import { getMatches, getAllMatches, getMatchStatus, isFinishedStatus, type Match } from "@/lib/api";

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

    // Attribute each match to the day it STARTED (its first view), not the day
    // each individual view happened. Otherwise a match running past midnight is
    // split across two days. We widen the fetch by a 24h buffer on each side of
    // the selected window so we can (a) capture a match's post-midnight tail and
    // (b) detect matches that actually started before the window and exclude them.
    const BUFFER_MS = 24 * 60 * 60 * 1000;
    const fromFetch = from ? new Date(Date.parse(from) - BUFFER_MS).toISOString() : null;
    const toFetch = to ? new Date(Date.parse(to) + BUFFER_MS).toISOString() : null;

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
      if (fromFetch) pageQuery = pageQuery.gte("created_at", fromFetch);
      if (toFetch) pageQuery = pageQuery.lte("created_at", toFetch);
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
      firstLiveView: string | null;
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
          firstLiveView: null,
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
      if (r.is_live && (!g.firstLiveView || r.created_at < g.firstLiveView)) g.firstLiveView = r.created_at;
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
      firstViewed: string;
      lastLiveView: string | null;
      firstLiveView: string | null;
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
            firstViewed: g.firstViewed,
            lastLiveView: null,
            firstLiveView: g.firstLiveView,
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
        if (g.firstViewed < m.firstViewed) m.firstViewed = g.firstViewed;
        if (g.firstLiveView && (!m.firstLiveView || g.firstLiveView < m.firstLiveView)) m.firstLiveView = g.firstLiveView;
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

    // Fallback classifier — ONLY for view-logged matches that have no matching
    // fixture (orphan telemetry). live = live viewers within the last 3h;
    // played = had live viewers earlier; upcoming = preview visits only.
    const LIVE_WINDOW = 3 * 60 * 60 * 1000;
    const nowMs = Date.now();
    type Status = "played" | "live" | "upcoming";
    const classify = (g: { lastLiveView: string | null }): Status => {
      if (!g.lastLiveView) return "upcoming";
      return nowMs - Date.parse(g.lastLiveView) <= LIVE_WINDOW ? "live" : "played";
    };

    // ── Fixtures decide a match's DAY and STATUS ────────────────────────────
    // A match belongs to the day it actually KICKS OFF, and Played/Live/Upcoming
    // is decided by real kickoff time — never by when a visitor clicked a card.
    // Build a kickoff index from (in precedence order) the public schedule feed,
    // the finished-results table, and admin stream overrides. View telemetry is
    // used ONLY for the metrics (counts, unique, duration, peak).
    type Fixture = { kickoffMs: number; status: Status; sport: string; title: string };
    const statusByTime = (kMs: number): Status => {
      const diffMin = (kMs - nowMs) / 60000;
      if (diffMin > 0) return "upcoming";
      if (diffMin > -180) return "live";
      return "played";
    };
    const fixtureIndex = new Map<string, Fixture>();

    // (1) Public schedule feed (live + upcoming + recently finished).
    try {
      const feed: Match[] = sport ? await getMatches(sport) : await getAllMatches();
      for (const m of feed) {
        if (!m.date) continue;
        const fs = getMatchStatus(m); // "live" | "upcoming" | "ended"
        const st: Status = m.ended || fs === "ended" ? "played" : fs;
        fixtureIndex.set(normTitle(m.title), { kickoffMs: m.date, status: st, sport: m.category || "", title: m.title });
      }
    } catch { /* feed unavailable — fall back to results / overrides / telemetry */ }

    // (2) Finished-results table (authoritative kickoff + "played").
    {
      let wcQuery = getSupabaseAdmin()
        .from("wc_results")
        .select("home_team, away_team, event_date, status");
      if (fromFetch) wcQuery = wcQuery.gte("event_date", fromFetch);
      if (toFetch) wcQuery = wcQuery.lte("event_date", toFetch);
      const { data: wc } = await wcQuery;
      for (const r of (wc ?? []) as Array<{ home_team: string; away_team: string; event_date: string; status: string | null }>) {
        if (!r.event_date) continue;
        const kickoffMs = Date.parse(r.event_date);
        const title = `${r.home_team} vs ${r.away_team}`;
        const st: Status = isFinishedStatus(r.status) ? "played" : statusByTime(kickoffMs);
        fixtureIndex.set(normTitle(title), { kickoffMs, status: st, sport: "football", title });
      }
    }

    // (3) Admin stream overrides (custom / PPV matches not in the feed).
    {
      const { data: ov } = await getSupabaseAdmin()
        .from("stream_overrides")
        .select("match_title, match_data, enabled");
      for (const r of (ov ?? []) as Array<{ match_title: string | null; match_data: { date?: number | string; title?: string; category?: string } | null; enabled: boolean }>) {
        if (!r.enabled) continue;
        const md = r.match_data || {};
        const kickoffMs = typeof md.date === "number" ? md.date : (md.date ? Date.parse(md.date) : NaN);
        const title = r.match_title || md.title;
        if (!title || !Number.isFinite(kickoffMs)) continue;
        const key = normTitle(title);
        if (fixtureIndex.has(key)) continue; // feed / results win
        fixtureIndex.set(key, { kickoffMs, status: statusByTime(kickoffMs), sport: md.category || "football", title });
      }
    }

    const resolveFixture = (title: string): Fixture | null => fixtureIndex.get(normTitle(title)) ?? null;

    const fromMs = from ? Date.parse(from) : null;
    const toMs = to ? Date.parse(to) : null;
    const inWindow = (kMs: number) => {
      if (fromMs === null && toMs === null) return true;
      return (fromMs === null || kMs >= fromMs) && (toMs === null || kMs <= toMs);
    };

    type Row = {
      match_id: string; title: string; sport: string;
      views: number; live_views: number; pre_views: number;
      unique_viewers: number; unique_live: number; unique_pre: number;
      peak_viewers: number; avg_duration: number; last_viewed: string;
      kickoff: number | null; start_day: string; status: Status;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();

    // Matches with view telemetry: metrics from views; day + status from the
    // resolved fixture (falling back to first-live-view for unmatched orphans).
    for (const g of Object.values(merged)) {
      const fx = resolveFixture(g.title);
      const kickoffMs = fx ? fx.kickoffMs : Date.parse(g.firstLiveView ?? g.firstViewed);
      if (!inWindow(kickoffMs)) continue; // belongs to another day
      seen.add(normTitle(g.title));
      rows.push({
        match_id: g.match_id,
        title: fx?.title ?? g.title,
        sport: g.sport || fx?.sport || "",
        views: g.views,
        live_views: g.liveViews,
        pre_views: g.preViews,
        unique_viewers: g.uniqueViewers.size,
        unique_live: g.liveViewers.size,
        unique_pre: g.uniqueViewers.size - g.liveViewers.size,
        peak_viewers: Math.max(0, ...g.matchIds.map((id) => peakById[id] ?? 0)),
        avg_duration: g.views > 0 ? Math.round(g.totalDuration / g.views) : 0,
        last_viewed: g.lastViewed,
        kickoff: kickoffMs,
        start_day: new Date(kickoffMs).toISOString(),
        status: fx ? fx.status : classify(g),
      });
    }

    // Scheduled matches with ZERO views (only when a specific day is selected),
    // so Upcoming/Played fixtures appear even before anyone has watched them.
    if (fromMs !== null && toMs !== null) {
      for (const [key, fx] of fixtureIndex) {
        if (seen.has(key)) continue;
        if (!inWindow(fx.kickoffMs)) continue;
        if (sport && fx.sport && fx.sport !== sport) continue;
        rows.push({
          match_id: `fixture:${key}`,
          title: fx.title,
          sport: fx.sport,
          views: 0, live_views: 0, pre_views: 0,
          unique_viewers: 0, unique_live: 0, unique_pre: 0,
          peak_viewers: 0, avg_duration: 0,
          last_viewed: new Date(fx.kickoffMs).toISOString(),
          kickoff: fx.kickoffMs,
          start_day: new Date(fx.kickoffMs).toISOString(),
          status: fx.status,
        });
      }
    }

    const filtered = rows.filter((m) => status === "all" || m.status === status);
    // Top Views → most-watched first. Recent → by kickoff time (most recent
    // first); the page re-sorts Upcoming to soonest-first client-side.
    filtered.sort((a, b) =>
      sort === "recent"
        ? (b.kickoff ?? 0) - (a.kickoff ?? 0)
        : b.views - a.views
    );

    return NextResponse.json({
      matches: filtered.slice(offset, offset + limit),
      total: filtered.length,
      page,
    });
  } catch (e) {
    console.error("Matches API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
