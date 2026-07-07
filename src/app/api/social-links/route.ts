import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

const TTL = 60_000;
let cache: { data: any; ts: number } | null = null;

// Public: only the links that are toggled on AND have a URL.
export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return NextResponse.json(cache.data);

  try {
    const { data } = await Promise.race([
      getSupabaseAdmin()
        .from("site_settings")
        .select("value")
        .eq("key", "social_links")
        .maybeSingle(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const all = (data?.value as SocialLink[] | undefined) ?? [];
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
