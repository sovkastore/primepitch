import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

const TTL = 60_000;
let cache: { data: any; ts: number } | null = null;

// Public: only the links that are toggled on AND have a URL.
export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return NextResponse.json(cache.data);

  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");

    const fetchLinks = (async () => {
      const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("social_links").first<{ value: string }>();
      return row?.value ? JSON.parse(row.value) : [];
    })();

    const dataValue = await Promise.race([
      fetchLinks,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const all = (dataValue as SocialLink[] | undefined) ?? [];
    const links = all
      .filter((l) => l.enabled && typeof l.url === "string" && l.url.trim())
      .map((l) => ({ id: l.id, label: l.label, url: l.url.trim() }));
    const result = { links };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(cache?.data ?? { links: [] });
  }
}
