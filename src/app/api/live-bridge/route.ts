import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveStreams } from "@/lib/streams";
import type { Match } from "@/lib/api";

// Bridges the gap between "countdown hit zero" and "streamed.pk lists it live".
// The homepage sends matches that have just kicked off but aren't in the curated
// live list yet; we resolve each one's stream (echo / override / auto-fallback)
// and return those that are actually watchable — so they appear as real LIVE
// cards immediately, with no vanish and no placeholder. Only matches that
// genuinely resolve to a stream come back.

function keyOf(m: Match): string {
  const s = m.sources?.[0];
  return s ? `${s.source}--${s.id}` : m.id;
}

interface Flags {
  hidden: Set<string>;
  disableAuto: Set<string>;
  renames: Map<string, string>;
  forceEnded: Set<string>;
}

async function getFlags(): Promise<Flags> {
  const hidden = new Set<string>();
  const disableAuto = new Set<string>();
  const renames = new Map<string, string>();
  const forceEnded = new Set<string>();
  try {
    const { data } = await Promise.race([
      getSupabaseAdmin()
        .from("match_flags")
        .select("match_id, hidden, disable_auto, display_title, force_ended"),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);
    for (const r of (data ?? []) as Array<{
      match_id: string;
      hidden: boolean;
      disable_auto: boolean;
      display_title?: string | null;
      force_ended?: boolean | null;
    }>) {
      if (r.hidden) hidden.add(r.match_id);
      if (r.disable_auto) disableAuto.add(r.match_id);
      if (r.display_title) renames.set(r.match_id, r.display_title);
      if (r.force_ended) forceEnded.add(r.match_id);
    }
  } catch {
    /* DB timeout — degrade to no flags */
  }
  return { hidden, disableAuto, renames, forceEnded };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const candidates: Match[] = Array.isArray(body?.candidates) ? body.candidates.slice(0, 30) : [];
    if (candidates.length === 0) return NextResponse.json({ matches: [] });

    const flags = await getFlags();

    const resolved = await Promise.all(
      candidates.map(async (m) => {
        const mid = keyOf(m);
        if (flags.hidden.has(mid)) return null;
        const s = m.sources?.[0];
        if (!s) return null;
        const r = await resolveStreams({
          source: s.source,
          id: s.id,
          title: m.title,
          sport: m.category,
          disableAuto: flags.disableAuto.has(mid),
        });
        if (r.streams.length === 0) return null;
        // Apply admin rename / forced-ended so bridged cards match the rest.
        let out = m;
        if (flags.renames.has(mid)) out = { ...out, title: flags.renames.get(mid)! };
        if (flags.forceEnded.has(mid)) out = { ...out, ended: true };
        return out;
      })
    );

    return NextResponse.json({ matches: resolved.filter((m): m is Match => m !== null) });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
