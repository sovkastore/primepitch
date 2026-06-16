import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMatches, getMatchStatus, type Match } from "@/lib/api";

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

// Short cache so we don't recompute live football on every page load.
let liveCache: { live: Match[]; ts: number } | null = null;
async function footballLive(): Promise<Match[]> {
  if (liveCache && Date.now() - liveCache.ts < 15_000) return liveCache.live;
  try {
    const matches = await getMatches("football");
    const live = matches.filter((m) => !m.ended && getMatchStatus(m) === "live");
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

export async function GET() {
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

    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ master: false, domains: "all", formats: {} });
  }
}
