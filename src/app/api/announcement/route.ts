import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

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
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");
    const fetchAnnouncement = (async () => {
      const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("announcement").first<{ value: string }>();
      return row ? { value: JSON.parse(row.value) } : null;
    })();
    const data = await Promise.race([
      fetchAnnouncement,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const cfg = { ...EMPTY, ...(data?.value ?? {}) } as Announcement;
    // Never advertise an enabled banner with no text.
    if (!cfg.message.trim()) cfg.enabled = false;
    
    cache = { data: cfg, ts: now };
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json(cache?.data ?? EMPTY, { headers: { "x-pp-degraded": "1" } });
  }
}
