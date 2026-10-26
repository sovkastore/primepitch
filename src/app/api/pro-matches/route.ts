import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { fetchRapidPage } from "@/lib/rapid-fetch";
import { saveMatchesCache } from "@/lib/match-cache";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "1";

    let cache_minutes = 30;
    let auto_fetch = true;

    let d1 = null;
    try {
      d1 = await getD1();
      if (d1) {
        const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("alt_api_config").first<{ value: string }>();
        if (row && row.value) {
          const config = JSON.parse(row.value);
          if (config.cache_minutes !== undefined) cache_minutes = Number(config.cache_minutes);
          if (config.auto_fetch !== undefined) auto_fetch = Boolean(config.auto_fetch);
        }
      }
    } catch (e) {
      console.error("Failed to read alt cache config from D1:", e);
    }

    // [ROBUST CACHING] Check D1 Database cache before EVER hitting RapidAPI!
    if (d1) {
      try {
        const cacheRow = await d1.prepare("SELECT data, updated_at FROM d1_pro_matches_cache WHERE id = ?").bind("matches_cache").first<{ data: string, updated_at: number }>();
        if (cacheRow && cacheRow.data) {
          const age_minutes = (Date.now() - cacheRow.updated_at) / (1000 * 60);
          
          // If auto-fetch is ON, check if cache is fresh
          if (auto_fetch && age_minutes < cache_minutes) {
             console.log(`[Cache Hit] Returning D1 cache (age: ${age_minutes.toFixed(1)} mins)`);
             return NextResponse.json({ matches: JSON.parse(cacheRow.data) });
          }
          
          // If auto-fetch is OFF, NEVER expire the cache automatically (manual clear only)
          if (!auto_fetch) {
             console.log(`[Cache Hit] Returning D1 cache (manual fetch mode)`);
             return NextResponse.json({ matches: JSON.parse(cacheRow.data) });
          }
        } else if (!auto_fetch) {
           console.log(`[Cache Miss] Auto-fetch is OFF and cache is empty. Returning empty matches.`);
           return NextResponse.json({ matches: [] });
        }
      } catch (e) {
         console.error("Failed to read matches cache from D1:", e);
      }
    }

    const page1 = (await fetchRapidPage("visitor cache", Number(page) || 1)) ?? [];
    const allMatches = [...page1];

    // [ROBUST CACHING] Save new data to D1 (preserves live matches from
    // deeper feed pages so their watch pages keep working)
    if (d1 && allMatches.length > 0) {
      try {
        await saveMatchesCache(d1, allMatches);
        console.log(`[Cache Write] Saved ${allMatches.length} matches to D1 database.`);
      } catch(e) {
        console.error("Failed to save matches cache to D1:", e);
      }
    }

    // An empty list straight from the provider is not stored as the shared copy.
    return NextResponse.json(
      { matches: allMatches },
      allMatches.length === 0 ? { headers: { "x-pp-degraded": "1" } } : undefined
    );
  } catch (error) {
    console.error("Error fetching pro matches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
