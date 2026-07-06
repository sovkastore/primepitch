import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
    const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
    const { data } = await getSupabaseAdmin()
      .from("push_match_state")
      .select("home_team, away_team")
      .eq("finished", true)
      .gte("updated_at", since);
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
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "ads_config")
      .maybeSingle();
    const cfg = (data?.value ?? { master: false, domains: "all", formats: {} }) as {
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
        const sb = getSupabaseAdmin();
        const { data: ad } = await sb
          .from("site_settings").select("value").eq("key", "partner_ads").maybeSingle();
        if (ad?.value === true || ad?.value === "true") {
          const { data: partner } = await sb
            .from("partners")
            .select("id, active, banned, partner_zones(zone_id, full_tag, format)")
            .eq("code", ref)
            .maybeSingle();
          const pr = partner as
            | { id: string; active: boolean; banned: boolean; partner_zones?: Array<{ zone_id: string; full_tag: string | null; format: string }> }
            | null;
          if (pr && pr.active && !pr.banned) {
            const zone = (pr.partner_zones || []).find((z) => z.format === "popunder");
            const target = formats["monetag_popunder"] as ({ enabled?: boolean; zone?: string; src?: string } & Fmt) | undefined;
            if (zone?.zone_id && target && target.enabled) {
              target.zone = zone.zone_id;
              if (zone.full_tag) {
                const sm = String(zone.full_tag).match(/src=["']?([^"'\s>]+)/i);
                const zm = String(zone.full_tag).match(/data-zone=["']?([^"'\s>]+)/i);
                if (sm) target.src = sm[1];
                if (zm) target.zone = zm[1];
              }
            }
          }
        }
      } catch { /* swap is best-effort; fall back to house ad */ }
    }

    cfgCache = { data: { body: cfg, __key: cacheKey }, ts: now };
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ master: false, domains: "all", formats: {} });
  }
}
