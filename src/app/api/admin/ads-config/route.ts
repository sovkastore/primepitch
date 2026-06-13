import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "ads_config";

type Cap = "off" | "session" | "daily";
type Format = { label: string; enabled: boolean; zone: string; src: string; cap: Cap };
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
};

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: "off" },
  },
};

const ALLOWED_DOMAINS = new Set(["all", "workers_dev", "xellnetwork"]);
const ALLOWED_CAPS = new Set(["off", "session", "daily"]);
// Only known formats can be saved (prevents arbitrary script injection).
const ALLOWED_FORMATS = new Set(["inpage_push"]);

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
        cap: ALLOWED_CAPS.has(f.cap as string) ? (f.cap as Cap) : "off",
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
