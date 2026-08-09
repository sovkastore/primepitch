import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";
let currentKeyIndex = 0;

export async function GET(req: Request) {
  try {
    const RAPID_API_KEYS = (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);
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

    const url = `https://${RAPID_API_HOST}/matches?page=${page}`;
    
    const fetchOptions: RequestInit = {
      method: "GET",
      headers: {
        "x-rapidapi-host": RAPID_API_HOST,
        // The key is set inside fetchPage dynamically
      },
      next: { 
        tags: ["alt-matches"],
      }
    };

    if (auto_fetch) {
      // Revalidate every X minutes
      fetchOptions.next = { ...fetchOptions.next, revalidate: cache_minutes * 60 };
    }

    const fetchPage = async (p: number) => {
      if (RAPID_API_KEYS.length === 0) {
        console.error("No RapidAPI keys configured!");
        return [];
      }

      const url = `https://${RAPID_API_HOST}/matches?page=${p}`;
      
      let attempts = 0;
      while (attempts < RAPID_API_KEYS.length) {
        const apiKey = RAPID_API_KEYS[currentKeyIndex];
        
        const pageOptions = {
          ...fetchOptions,
          headers: {
            ...fetchOptions.headers,
            "x-rapidapi-key": apiKey,
          },
          next: {
            ...fetchOptions.next,
            tags: ["alt-matches", `alt-matches-page-${p}`]
          }
        };
        
        const res = await fetch(url, pageOptions);
        
        // If success or a non-quota error, break out and process
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.matches)) return data.matches;
          if (data && Array.isArray(data.data)) return data.data;
          if (data && Array.isArray(data.results)) return data.results;
          return [];
        }

        // 429 = Too Many Requests (Quota Exceeded)
        // 403 = Forbidden (Not Subscribed)
        if (res.status === 429 || res.status === 403) {
          console.warn(`RapidAPI Key ${currentKeyIndex + 1}/${RAPID_API_KEYS.length} failed with ${res.status}. Switching to next key...`);
          currentKeyIndex = (currentKeyIndex + 1) % RAPID_API_KEYS.length;
          attempts++;
          continue; // Try next key
        }

        // If it's some other error (500, etc), just log and return empty
        console.error(`RapidAPI Error Page ${p}:`, res.status);
        return [];
      }
      
      console.error("All RapidAPI keys exhausted!");
      return [];
    };

    const page1 = await fetchPage(1);
    const allMatches = [...page1];

    // [ROBUST CACHING] Save new data to D1 database!
    if (d1 && allMatches.length > 0) {
      try {
        await d1.prepare(`
          INSERT INTO d1_pro_matches_cache (id, data, updated_at) 
          VALUES (?, ?, ?) 
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        `).bind("matches_cache", JSON.stringify(allMatches), Date.now()).run();
        console.log(`[Cache Write] Saved ${allMatches.length} matches to D1 database.`);
      } catch(e) {
        console.error("Failed to save matches cache to D1:", e);
      }
    }

    return NextResponse.json({ matches: allMatches });
  } catch (error) {
    console.error("Error fetching pro matches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
