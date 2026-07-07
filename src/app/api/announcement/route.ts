import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Public: the site-wide announcement banner config the client reads. When
// `enabled` is false (the default) nothing shows. The link is sanitised on
// write, but we keep this read tolerant.
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: "info" | "success" | "warning";
  reshowHours: number;
};

const EMPTY: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
  reshowHours: 0,
};

const TTL = 60_000;
let cache: { data: Announcement; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const { data } = await Promise.race([
      getSupabaseAdmin()
        .from("site_settings")
        .select("value")
        .eq("key", "announcement")
        .maybeSingle(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const cfg = { ...EMPTY, ...(data?.value ?? {}) } as Announcement;
    // Never advertise an enabled banner with no text.
    if (!cfg.message.trim()) cfg.enabled = false;
    
    cache = { data: cfg, ts: now };
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json(cache?.data ?? EMPTY);
  }
}
