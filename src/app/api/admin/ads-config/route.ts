import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "ads_config";

type Delay = "0" | "15s" | "30s" | "1m" | "2m" | "3m" | "4m" | "5m" | "10m";
type FmtPlacement = string; // Comma-separated page IDs or "all"
type Format = {
  label: string;
  enabled: boolean;
  network: string;
  group: string;
  placement: FmtPlacement;
  zone: string;
  src: string;
  cap: number;
  delay: Delay;
  mode?: "off" | "on" | "auto";
  autoScope?: "all" | "selected";
  autoMatches?: string[];
};
type Trigger = "visit" | "interval" | "match" | "server";
type Placement = "watch" | "home" | "both" | "sports-live";
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
type SmartLinks = {
  enabled: boolean;
  url: string;
  targets: Record<string, boolean>; // key (sport id or league id) -> enabled
};
type PageNotification = {
  enabled: boolean;
  title: string;
  text: string;
};
type PageNotifications = {
  wait_banner: PageNotification;
  tap_warning: PageNotification;
};
type PromoBannerConfig = {
  enabled: boolean;
  link: string;
  whatsappMessage: string;
  imagePath: string;
};
type AdsConfig = {
  master: boolean;
  domains: "all" | "workers_dev" | "xellnetwork";
  formats: Record<string, Format>;
  preroll: Preroll;
  smartLinks?: SmartLinks;
  notifications?: PageNotifications;
  promoBanner?: PromoBannerConfig;
};

const DEFAULTS: AdsConfig = {
  master: false,
  domains: "all",
  formats: {
    inpage_push: { label: "In-Page Push", enabled: false, network: "Monetag", group: "notification", placement: "all", zone: "11143361", src: "https://nap5k.com/tag.min.js", cap: 60, delay: "0" },
    vignette: { label: "Vignette Banner", enabled: false, network: "Monetag", group: "interstitial", placement: "all", zone: "11143456", src: "https://n6wxm.com/vignette.min.js", cap: 60, delay: "0" },
    social_bar: { label: "Social Bar", enabled: false, network: "Adsterra", group: "notification", placement: "all", zone: "", src: "", cap: 60, delay: "0" },
    popunder: { label: "Popunder", enabled: false, network: "Adsterra", group: "popunder", placement: "all", zone: "", src: "https://pl29767070.effectivecpmnetwork.com/30/ab/f5/30abf5ef48f19536833cf036986d6551.js", cap: 0, delay: "0" },
    monetag_popunder: { label: "Popunder", enabled: false, network: "Monetag", group: "popunder", placement: "home", zone: "11157914", src: "https://al5sm.com/tag.min.js", cap: 0, delay: "0" },
  },
  preroll: { enabled: false, vastTag: "", trigger: "interval", placement: "watch", cap: 5, skipAfter: 5, noFillTimeout: 3, mode: "silent" },
  smartLinks: { enabled: false, url: "", targets: {} },
  notifications: {
    wait_banner: {
      enabled: true,
      title: "Give the stream a moment to load.",
      text: "Depending on your region, the player can take a little time to appear. Please wait and don't tap anything until the video shows.",
    },
    tap_warning: {
      enabled: true,
      title: "Please wait — don't tap until the player appears.",
      text: "",
    },
  },
  promoBanner: {
    enabled: true,
    link: "https://chat.whatsapp.com/GZIDDAtkCOg9r8p25itF9t",
    whatsappMessage: "",
    imagePath: "/promo-banner.png"
  },
};

const ALLOWED_DOMAINS = new Set(["all", "workers_dev", "xellnetwork"]);
const ALLOWED_DELAYS = new Set(["0", "15s", "30s", "1m", "2m", "3m", "4m", "5m", "10m"]);
const MAX_CAP_MIN = 10080; // 7 days

// minutes between loads; 0 = no limit. Tolerates legacy string values.
function cleanCap(v: unknown): number {
  const legacy: Record<string, number> = { off: 0, "30m": 30, "1h": 60, "2h": 120, "24h": 1440 };
  const n = typeof v === "string" && v in legacy ? legacy[v] : Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CAP_MIN);
}
// These two always render so the core toggles never disappear; any other
// (admin-created or seeded) format is allowed too. Only the admin can POST here.
const CORE_FORMATS = ["inpage_push", "vignette", "social_bar", "popunder", "monetag_popunder"];
// Any string is allowed for placement now (comma-separated IDs)
const MAX_FORMATS = 24;

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function cleanKey(v: string): boolean {
  return /^[a-z0-9_]{1,40}$/i.test(v);
}

const ALLOWED_TRIGGERS = new Set(["visit", "interval", "match", "server"]);
const ALLOWED_PLACEMENTS = new Set(["watch", "home", "both", "sports-live"]);
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
function cleanSmartLinks(v: unknown): SmartLinks {
  const s = (v ?? {}) as Partial<SmartLinks>;
  const rawTargets = (s.targets ?? {}) as Record<string, unknown>;
  const targets: Record<string, boolean> = {};
  for (const [k, on] of Object.entries(rawTargets)) {
    if (typeof k === "string" && k.length < 50) targets[k] = !!on;
  }
  return {
    enabled: !!s.enabled,
    url: typeof s.url === "string" ? s.url.trim() : "",
    targets,
  };
}
function cleanNotifications(v: unknown): PageNotifications {
  const n = (v ?? {}) as Partial<PageNotifications>;
  const w = (n.wait_banner ?? {}) as Partial<PageNotification>;
  const t = (n.tap_warning ?? {}) as Partial<PageNotification>;
  return {
    wait_banner: {
      enabled: w.enabled !== undefined ? !!w.enabled : (DEFAULTS.notifications?.wait_banner.enabled ?? true),
      title: typeof w.title === "string" ? w.title.trim().slice(0, 200) : (DEFAULTS.notifications?.wait_banner.title ?? ""),
      text: typeof w.text === "string" ? w.text.trim().slice(0, 500) : (DEFAULTS.notifications?.wait_banner.text ?? ""),
    },
    tap_warning: {
      enabled: t.enabled !== undefined ? !!t.enabled : (DEFAULTS.notifications?.tap_warning.enabled ?? true),
      title: typeof t.title === "string" ? t.title.trim().slice(0, 200) : (DEFAULTS.notifications?.tap_warning.title ?? ""),
      text: typeof t.text === "string" ? t.text.trim().slice(0, 500) : (DEFAULTS.notifications?.tap_warning.text ?? ""),
    },
  };
}

function cleanPromoBanner(v: unknown): PromoBannerConfig {
  const p = (v ?? {}) as Partial<PromoBannerConfig>;
  return {
    enabled: p.enabled !== undefined ? !!p.enabled : (DEFAULTS.promoBanner?.enabled ?? true),
    link: typeof p.link === "string" ? p.link.trim().slice(0, 500) : (DEFAULTS.promoBanner?.link ?? ""),
    whatsappMessage: typeof p.whatsappMessage === "string" ? p.whatsappMessage.trim().slice(0, 1000) : (DEFAULTS.promoBanner?.whatsappMessage ?? ""),
    imagePath: typeof p.imagePath === "string" ? p.imagePath.trim().slice(0, 500) : (DEFAULTS.promoBanner?.imagePath ?? ""),
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json(DEFAULTS);

    const data = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const stored = data?.value ? JSON.parse(data.value) : DEFAULTS;
    
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

    // Sanitize: coerce types. Admin-only route, so named/custom ads are allowed.
    const formats: Record<string, Format> = {};
    let count = 0;
    for (const [id, f] of Object.entries(body.formats ?? {})) {
      if (!cleanKey(id) || !f || count >= MAX_FORMATS) continue;
      count++;
      const def = DEFAULTS.formats[id];
      const label = cleanStr(f.label, 60) || def?.label || id;
      const network = cleanStr(f.network, 24) || def?.network || "";
      const group = cleanKey(cleanStr(f.group, 40)) ? cleanStr(f.group, 40) : def?.group || "standalone";
      const placement = typeof f.placement === "string" ? f.placement.trim().slice(0, 500) : (def?.placement || "all");
      const rawSrc = typeof f.src === "string" ? f.src.trim() : "";
      const src = cleanUrl(rawSrc.startsWith("//") ? `https:${rawSrc}` : rawSrc);
      formats[id] = {
        label,
        enabled: !!f.enabled,
        network,
        group,
        placement,
        zone: typeof f.zone === "string" ? f.zone.trim().replace(/[^0-9]/g, "") : "",
        src,
        cap: cleanCap(f.cap),
        delay: ALLOWED_DELAYS.has(f.delay as string) ? (f.delay as Delay) : "0",
        ...(["off", "on", "auto"].includes(f.mode as string)
          ? { mode: f.mode as "off" | "on" | "auto" }
          : {}),
        autoScope: f.autoScope === "selected" ? "selected" : "all",
        autoMatches: Array.isArray(f.autoMatches)
          ? f.autoMatches
              .filter((x): x is string => typeof x === "string")
              .slice(0, 60)
              .map((x) => x.slice(0, 100))
          : [],
      };
    }
    // Make sure the core formats exist (so toggles always render).
    for (const id of CORE_FORMATS) {
      if (!formats[id] && DEFAULTS.formats[id]) formats[id] = { ...DEFAULTS.formats[id] };
    }

    const clean: AdsConfig = {
      master: !!body.master,
      domains: ALLOWED_DOMAINS.has(body.domains as string) ? (body.domains as AdsConfig["domains"]) : "all",
      formats,
      preroll: cleanPreroll(body.preroll),
      smartLinks: cleanSmartLinks(body.smartLinks),
      notifications: cleanNotifications(body.notifications),
      promoBanner: cleanPromoBanner(body.promoBanner),
    };

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    try {
      await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(KEY, JSON.stringify(clean), new Date().toISOString()).run();
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, config: clean });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
