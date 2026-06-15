import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "ads_config";

type Delay = "0" | "1m" | "2m" | "3m" | "5m" | "10m";
type Format = { label: string; enabled: boolean; zone: string; src: string; cap: number; delay: Delay };
type Trigger = "visit" | "interval" | "match" | "server";
type Placement = "watch" | "home" | "both";
type Mode = "silent" | "gate";
type Preroll = {
  enabled: boolean;
  vastTag: string;
  trigger: Trigger;
  placement: Placement;
  cap: number; // minutes between plays (interval mode)
  skipAfter: number; // seconds (best-effort; creative skipoffset wins)
  noFillTimeout: number; // seconds to wait for an ad before revealing the stream
  mode: Mode; // "silent" = invisible until a real ad; "gate" = black screen while checking
};
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
  preroll: Preroll;
};

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: 60, delay: "0" },
    vignette: { label: "Vignette Banner", enabled: false, zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: 60, delay: "0" },
  },
  preroll: { enabled: false, vastTag: "", trigger: "interval", placement: "watch", cap: 5, skipAfter: 5, noFillTimeout: 3, mode: "silent" },
};

const ALLOWED_DOMAINS = new Set(["all", "workers_dev", "xellnetwork"]);
const ALLOWED_DELAYS = new Set(["0", "1m", "2m", "3m", "5m", "10m"]);
const MAX_CAP_MIN = 10080; // 7 days

// minutes between loads; 0 = no limit. Tolerates legacy string values.
function cleanCap(v: unknown): number {
  const legacy: Record<string, number> = { off: 0, "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };
  const n = typeof v === "string" && v in legacy ? legacy[v] : Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CAP_MIN);
}
// Only known formats can be saved (prevents arbitrary script injection).
const ALLOWED_FORMATS = new Set(["inpage_push", "vignette"]);

const ALLOWED_TRIGGERS = new Set(["visit", "interval", "match", "server"]);
const ALLOWED_PLACEMENTS = new Set(["watch", "home", "both"]);
const ALLOWED_MODES = new Set(["silent", "gate"]);
function cleanUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  try {
    return new URL(s).protocol === "https:" ? s : "";
  } catch {
    return "";
  }
}
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function cleanPreroll(v: unknown): Preroll {
  const p = (v ?? {}) as Partial<Preroll>;
  return {
    enabled: !!p.enabled,
    vastTag: cleanUrl(p.vastTag),
    trigger: ALLOWED_TRIGGERS.has(p.trigger as string) ? (p.trigger as Trigger) : "interval",
    placement: ALLOWED_PLACEMENTS.has(p.placement as string) ? (p.placement as Placement) : "watch",
    cap: cleanCap(p.cap),
    skipAfter: clampInt(p.skipAfter, 0, 60, 5),
    noFillTimeout: clampInt(p.noFillTimeout, 1, 15, 3),
    mode: ALLOWED_MODES.has(p.mode as string) ? (p.mode as Mode) : "silent",
  };
}

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    const stored = (data?.value as Partial<AdsConfig>) ?? DEFAULTS;
    return NextResponse.json({
      ...DEFAULTS,
      ...stored,
      preroll: { ...DEFAULTS.preroll, ...(stored.preroll ?? {}) },
    });
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
      preroll: cleanPreroll(body.preroll),
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
