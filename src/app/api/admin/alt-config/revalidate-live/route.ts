import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Clear Next.js cache
    // @ts-expect-error: Next.js canary has experimental typings requiring 2 args
    revalidateTag("alt-matches-page-1");
    revalidateTag("alt-matches");

    // We manually fetch from RapidAPI right here because the user is controlling it!
    const RAPID_API_KEYS = (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    if (RAPID_API_KEYS.length === 0) {
      return NextResponse.json({ error: "No RapidAPI keys configured" }, { status: 500 });
    }

    const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";
    let matches: any[] = [];
    
    // Try keys until one works
    for (const apiKey of RAPID_API_KEYS) {
      const res = await fetch(`https://${RAPID_API_HOST}/matches?page=1`, {
        headers: {
          "x-rapidapi-host": RAPID_API_HOST,
          "x-rapidapi-key": apiKey,
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) matches = data;
        else if (data && Array.isArray(data.matches)) matches = data.matches;
        else if (data && Array.isArray(data.data)) matches = data.data;
        else if (data && Array.isArray(data.results)) matches = data.results;
        break; // Success, stop trying keys
      }
    }

    // Save to D1 Database Cache
    try {
      const d1 = await getD1();
      if (d1 && matches.length > 0) {
        await d1.prepare(`
          INSERT INTO d1_pro_matches_cache (id, data, updated_at) 
          VALUES (?, ?, ?) 
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        `).bind("matches_cache", JSON.stringify(matches), Date.now()).run();
      }
    } catch(e) {
      console.error("Failed to update D1 cache:", e);
    }

    return NextResponse.json({ ok: true, revalidated: true, type: "live-only", matchCount: matches.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
