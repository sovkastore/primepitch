import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchFallbackStreams } from "@/lib/fallback-streams";

// Single source of truth for "what can actually play for this match", used by both
// the public list (/api/live-matches) and the watch page (/api/match-streams).
// Priority: manual admin overrides → echo → auto-fallback (only when nothing else).

export interface ResolvedStream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

export interface ResolvedStreams {
  streams: ResolvedStream[];
  replace_original: boolean;
  /** how the served streams were found, for admin display */
  serving: "echo" | "override" | "auto" | "none";
}

// Short TTL so admin actions (add/remove override, hide) reflect quickly. Module
// caches are per-Worker-isolate and can't be cross-busted, so we rely on a short
// window + a cache key that includes the auto-fallback flag.
const TTL = 12_000;
const cache = new Map<string, { data: ResolvedStreams; ts: number }>();

async function echoStreams(source: string, id: string): Promise<ResolvedStream[]> {
  try {
    const res = await fetch(`https://streamed.pk/api/stream/${source}/${id}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((s, i: number) => ({
        id: s.id || `echo-${i}`,
        streamNo: typeof s.streamNo === "number" ? s.streamNo : i + 1,
        language: s.language || "English",
        hd: !!s.hd,
        embedUrl: s.embedUrl,
        source: s.source || source,
      }))
      .filter((s: ResolvedStream) => !!s.embedUrl);
  } catch {
    return [];
  }
}

interface OverrideRow {
  embed_url: string;
  source: string | null;
  server_label: string | null;
  replace_original: boolean | null;
}

async function overrideStreams(
  matchId: string
): Promise<{ streams: ResolvedStream[]; replace_original: boolean }> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("stream_overrides")
      .select("embed_url, source, server_label, replace_original")
      .eq("match_id", matchId)
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as OverrideRow[];
    const streams = rows.map((o, i) => ({
      id: `override-${i}`,
      streamNo: i + 1,
      language: o.server_label || "English",
      hd: true,
      embedUrl: o.embed_url,
      source: o.source || "fallback",
    }));
    return { streams, replace_original: rows[0]?.replace_original ?? false };
  } catch {
    return { streams: [], replace_original: false };
  }
}

export async function resolveStreams(opts: {
  source: string;
  id: string;
  title?: string;
  sport?: string;
  disableAuto?: boolean;
}): Promise<ResolvedStreams> {
  const { source, id, title = "", sport = "football", disableAuto = false } = opts;
  const matchId = `${source}--${id}`;
  // Key includes the auto-fallback flag so toggling "Disable auto-fallback" re-resolves
  // immediately (instead of serving a cached SportSRC result).
  const cacheKey = `${matchId}|${disableAuto ? "na" : "a"}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.ts < TTL) return hit.data;

  const [ov, echo] = await Promise.all([
    overrideStreams(matchId),
    echoStreams(source, id),
  ]);

  let streams: ResolvedStream[];
  let replace = false;
  let serving: ResolvedStreams["serving"];

  if (ov.streams.length > 0 && ov.replace_original) {
    streams = ov.streams;
    replace = true;
    serving = "override";
  } else {
    streams = [...ov.streams, ...echo];
    serving = ov.streams.length > 0 ? "override" : echo.length > 0 ? "echo" : "none";
    // Self-heal: only when nothing else is available and auto isn't disabled.
    if (streams.length === 0 && !disableAuto && title) {
      const fb = await searchFallbackStreams(title, sport);
      if (fb.length > 0) {
        streams = fb.map((s, i) => ({
          id: `auto-${i}`,
          streamNo: i + 1,
          language: s.server || "Auto",
          hd: true,
          embedUrl: s.embedUrl,
          source: `auto-${s.source}`,
        }));
        serving = "auto";
      }
    }
  }

  // Sequential server numbers regardless of origin.
  streams = streams.map((s, i) => ({ ...s, streamNo: i + 1 }));

  const result: ResolvedStreams = { streams, replace_original: replace, serving };
  // Only cache successful resolutions. Caching an empty/cold-miss would lock the
  // match out for the full TTL; leaving it uncached lets the next attempt re-resolve
  // immediately against the now-warm provider cache.
  if (streams.length > 0) cache.set(cacheKey, { data: result, ts: now });
  return result;
}
