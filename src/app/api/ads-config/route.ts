import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
import { getD1 } from "@/lib/d1";
import { getMatches, type Match } from "@/lib/api";

// Public: ad configuration the client uses to decide whether to inject any ad
// tags. When master is false, the site injects nothing at all.
//
// Formats may carry a `mode`:
//   "on"   -> always enabled
//   "off"  -> always disabled
//   "auto" -> enabled only while football is live (all live matches, or a
//             hand-picked set in autoMatches when autoScope === "selected").
// We compute the effective `enabled` here so the client stays dumb.

function keyOf(m: Match): string {
  const s = m.sources?.[0];
  return s ? `${s.source}--${s.id}` : m.id;
}

// Fold a team name for order-independent matching against push_match_state.
const TEAM_ALIASES: Record<string, string> = {
  southkorea: "korearepublic", korea: "korearepublic",
  usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands",
};
function foldTeam(s: string): string {
  const n = (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[n] || n;
}
function pairKey(a?: string, b?: string): string | null {
  const x = foldTeam(a || "");
  const y = foldTeam(b || "");
  if (!x || !y) return null;
  return [x, y].sort().join("|");
}

// Matches our finish-notification system has already marked FINISHED. This is
// the accurate, immediate signal (same data that fires the "match ended" push),
// so a just-finished match stops counting as live right away — not after the
// kickoff window expires.
async function finishedPairs(): Promise<Set<string>> {
  try {
    const d1 = await getD1();
    if (!d1) return new Set();

    const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
    
    const fetchFinished = (async () => {
      const res = await d1.prepare("SELECT home_team, away_team FROM d1_push_match_state WHERE finished = 1 AND updated_at >= ?").bind(since).all();
      return res.results;
    })();

    const data = await Promise.race([
      fetchFinished,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    const set = new Set<string>();
    for (const r of (data ?? []) as Array<{ home_team: string | null; away_team: string | null }>) {
      const k = pairKey(r.home_team || "", r.away_team || "");
      if (k) set.add(k);
    }
    return set;
  } catch {
    return new Set();
  }
}

// Auto popunder window: start 1 minute BEFORE kickoff (matches the 1-min
// "starting soon" push) and run until ~3h after kickoff (or until finished).
const AD_LEAD_MIN = 1;
const AD_WINDOW_MIN = 180;

// Short cache so we don't recompute live football on every page load.
let liveCache: { live: Match[]; ts: number } | null = null;
async function footballLive(): Promise<Match[]> {
  if (liveCache && Date.now() - liveCache.ts < 15_000) return liveCache.live;
  try {
    const [matches, finished] = await Promise.all([getMatches("football"), finishedPairs()]);
    const live = matches.filter((m) => {
      if (m.ended) return false;
      // Go live 1 minute BEFORE kickoff so people who tap the "starting soon"
      // alert and load the page land inside the ad window.
      const diffMin = (m.date - Date.now()) / 60_000;
      if (!(diffMin <= AD_LEAD_MIN && diffMin > -AD_WINDOW_MIN)) return false;
      // Drop anything the finish-notification system already ended.
      const k = pairKey(m.teams?.home?.name, m.teams?.away?.name);
      if (k && finished.has(k)) return false;
      return true;
    });
    liveCache = { live, ts: Date.now() };
    return live;
  } catch {
    return liveCache?.live ?? [];
  }
}

type Fmt = {
  enabled?: boolean;
  mode?: "off" | "on" | "auto";
  autoScope?: "all" | "selected";
  autoMatches?: string[];
  [k: string]: unknown;
};

const CFG_TTL = 30_000;
let cfgCache: { data: any; ts: number } | null = null;

export async function GET(request: NextRequest) {
  const now = Date.now();
  // We include the referral code in the cache key because partner swaps change the output
  const ref = request.cookies.get("pp_ref")?.value?.trim().toLowerCase() || "none";
  const cacheKey = `ads_${ref}`;
  
  if (cfgCache && now - cfgCache.ts < CFG_TTL) {
    // Only return cache if it's the same partner segment (or no partner)
    if (cfgCache.data.__key === cacheKey) {
       return NextResponse.json(cfgCache.data.body);
    }
  }

  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");

    const fetchConfig = (async () => {
      const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("ads_config").first<{ value: string }>();
      if (!row) return null;
      return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    })();

    const dataValue = await Promise.race([
      fetchConfig,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);

    const cfg = (dataValue ?? { master: false, domains: "all", formats: {} }) as {
      master?: boolean;
      domains?: string;
      formats?: Record<string, Fmt>;
    };

    const formats = cfg.formats || {};
    if (cfg.master) {
      let live: Match[] | null = null;
      for (const f of Object.values(formats)) {
        if (!f || typeof f !== "object") continue;
        if (f.mode === "on") {
          f.enabled = true;
        } else if (f.mode === "off") {
          f.enabled = false;
        } else if (f.mode === "auto") {
          if (live === null) live = await footballLive();
          if (f.autoScope === "selected") {
            const sel = Array.isArray(f.autoMatches) ? f.autoMatches : [];
            f.enabled = live.some((m) => sel.includes(keyOf(m)));
          } else {
            f.enabled = live.length > 0;
          }
        }
        // no mode -> leave the stored enabled as-is
      }
    }

    // ---- Partner popunder swap (manual switch: partner_ads) ----
    if (cfg.master && ref !== "none") {
      try {
        const adRow = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("partner_ads").first<{ value: string }>();
        const adValue = adRow?.value ? (typeof adRow.value === 'string' ? JSON.parse(adRow.value) : adRow.value) : null;
        
        if (adValue === true || adValue === "true") {
          const pr: any = await d1.prepare("SELECT id, active, banned FROM d1_partners WHERE code = ?").bind(ref).first();
          
          if (pr && Boolean(pr.active) && !Boolean(pr.banned)) {
            const { results: zones } = await d1.prepare("SELECT zone_id, full_tag, format FROM d1_partner_zones WHERE partner_id = ?").bind(pr.id).all();
            const zone: any = zones.find((z: any) => z.format === "popunder" || !z.format);
            
            if (zone?.zone_id) {
              // Find the active popunder format to swap the zone ID into (prefers ExoClick or enabled popunder)
              let targetKey = Object.keys(formats).find(k => {
                const f = formats[k];
                return f && f.enabled && (
                  String(f.group).toLowerCase().includes("popunder") ||
                  String(f.label).toLowerCase().includes("popunder") ||
                  k.toLowerCase().includes("popunder")
                );
              });
              if (!targetKey) {
                targetKey = Object.keys(formats).find(k => k.toLowerCase().includes("popunder") || String(formats[k]?.group).toLowerCase().includes("popunder"));
              }

              const target = targetKey ? (formats[targetKey] as ({ enabled?: boolean; zone?: string; src?: string; rawScript?: string } & Fmt) | undefined) : undefined;
              if (target) {
                target.enabled = true;
                const oldZone = target.zone;
                target.zone = zone.zone_id;

                // If rawScript is present (ExoClick popunder), replace old zone ID with partner's zone ID
                if (typeof target.rawScript === "string" && target.rawScript) {
                  if (oldZone) {
                    target.rawScript = target.rawScript.split(oldZone).join(zone.zone_id);
                  }
                  target.rawScript = target.rawScript
                    .replace(/(data-exo-idzone=["']?)(\d+)(["']?)/gi, `$1${zone.zone_id}$3`)
                    .replace(/(["']?idzone["']?\s*:\s*["']?)(\d+)(["']?)/gi, `$1${zone.zone_id}$3`);
                }

                if (zone.full_tag) {
                  const sm = String(zone.full_tag).match(/src=["']?([^"'\s>]+)/i);
                  const zm = String(zone.full_tag).match(/data-zone=["']?([^"'\s>]+)/i);
                  if (sm) target.src = sm[1];
                  if (zm) target.zone = zm[1];
                }
              }
            }
          }
        }
      } catch { /* swap is best-effort; fall back to house ad */ }
    }

    cfgCache = { data: { body: cfg, __key: cacheKey }, ts: now };
    return NextResponse.json(cfg);
  } catch {
    // DB down — serve stale cache so AdsLoader doesn't block the page
    return NextResponse.json(cfgCache?.data?.body ?? { master: false, domains: "all", formats: {} });
  }
}
