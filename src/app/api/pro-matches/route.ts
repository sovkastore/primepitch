import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPID_API_KEY || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "1";

    let cache_minutes = 30;
    let auto_fetch = true;

    try {
      const d1 = await getD1();
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

    const url = `https://${RAPID_API_HOST}/matches?page=${page}`;
    
    const fetchOptions: RequestInit = {
      method: "GET",
      headers: {
        "x-rapidapi-host": RAPID_API_HOST,
        "x-rapidapi-key": RAPID_API_KEY,
      },
      next: { 
        tags: ["alt-matches"],
      }
    };

    if (auto_fetch) {
      // Revalidate every X minutes
      fetchOptions.next = { ...fetchOptions.next, revalidate: cache_minutes * 60 };
    } else {
      // Manual fetch only, cache indefinitely until revalidated by tag
      fetchOptions.cache = "force-cache";
    }

    const fetchPage = async (p: number) => {
      const url = `https://${RAPID_API_HOST}/matches?page=${p}`;
      const pageOptions = {
        ...fetchOptions,
        next: {
          ...fetchOptions.next,
          tags: ["alt-matches", `alt-matches-page-${p}`]
        }
      };
      
      const res = await fetch(url, pageOptions);
      if (!res.ok) {
        console.error(`RapidAPI Error Page ${p}:`, res.status);
        return [];
      }
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.matches)) return data.matches;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.results)) return data.results;
      return [];
    };

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const page1 = await fetchPage(1);
    await delay(1200); // 1.2s delay to avoid 1 req/sec rate limits
    const page2 = await fetchPage(2);
    await delay(1200);
    const page3 = await fetchPage(3);
    await delay(1200);
    const page4 = await fetchPage(4);
    await delay(1200);
    const page5 = await fetchPage(5);

    const allMatches = [...page1, ...page2, ...page3, ...page4, ...page5];

    return NextResponse.json({ matches: allMatches });
  } catch (error) {
    console.error("Error fetching pro matches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
