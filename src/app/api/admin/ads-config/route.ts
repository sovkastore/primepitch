import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "ads_config";

type Delay = "0" | "1m" | "2m" | "3m" | "5m" | "10m";
type Format = { label: string; enabled: boolean; zone: string; src: string; cap: number; delay: Delay };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
};

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: 60, delay: "0" },
    vignette: { label: "Vignette Banner", enabled: false, zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: 60, delay: "0" },
  },
};

const ALLOWED_DOMAINS = new Set(["all", "workers_dev", "xellnetwork"]);
const ALLOWED_DELAYS = new Set(["0", "1m", "2m", "3m", "5m", "10m"]);
const MAX_CAP_MIN = 10080; // 7 days

// minutes between loads; 0 = no limit. Tolerates legacy string values.
function cleanCap(v: unknown): number {
  const legacy: Record<string, number> = { off: 0, "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };
  let n = typeof v === "string" && v in legacy ? legacy[v] : Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CAP_MIN);
}
// Only known formats can be saved (prevents arbitrary script injection).
const ALLOWED_FORMATS = new Set(["inpage_push", "vignette"]);

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    return NextResponse.json((data?.value as AdsConfig) ?? DEFAULTS);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AdsConfig>;

    // Sanitize: coerce types, keep only known formats/values.
    const formats: Record<string, Format> = {};
    for (const [id, f] of Object.entries(body.formats ?? {})) {
      if (!ALLOWED_FORMATS.has(id) || !f) continue;
      const def = DEFAULTS.formats[id];
      formats[id] = {
        label: def?.label ?? id,
        enabled: !!f.enabled,
        zone: typeof f.zone === "string" ? f.zone.trim().replace(/[^0-9]/g, "") : "",
        src: typeof f.src === "string" && /^https:\/\/[a-z0-9.\-/_]+$/i.test(f.src.trim()) ? f.src.trim() : "",
        cap: cleanCap(f.cap),
        delay: ALLOWED_DELAYS.has(f.delay as string) ? (f.delay as Delay) : "0",
      };
    }
    // Make sure every known format exists (so toggles always render).
    for (const id of ALLOWED_FORMATS) {
      if (!formats[id]) formats[id] = { ...DEFAULTS.formats[id] };
    }

    const clean: AdsConfig = {
      master: !!body.master,
      domains: ALLOWED_DOMAINS.has(body.domains as string) ? (body.domains as AdsConfig["domains"]) : "all",
      formats,
    };

    const { error } = await getSupabaseAdmin()
      .from("site_settings")
      .upsert({ key: KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, config: clean });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
