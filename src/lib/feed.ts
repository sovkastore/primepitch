import { edgeMemo } from "@/lib/edge-memo";
import { normalizeTeamName, sameFixture } from "@/lib/team-match";
import type { Match, Stream } from "@/lib/api";

// ---------------------------------------------------------------------------
// Match + stream feed for the main site (server side only).
//
// streamed.pk closed on 27 Oct 2026. The main site now reads two public feeds
// and presents them in the same shape the rest of the app always used
// (Match / Stream), so pages, flags, overrides and the watch page carry on
// unchanged:
//
//   • ppv.st      — primary. Big football coverage plus NBA/NFL/NHL/etc.
//                   api.ppv.st/api/streams; mirrors from /api/ping are tried
//                   automatically when the main domain fails.
//                   Their rules: server-side use with caching (~1 request a
//                   minute) is allowed; their embed must be shown as-is (no
//                   sandboxing, no ad blocking) or they may block us.
//   • streamfree  — backup. streamfree.top/api/v1/streams, public, no key;
//                   asks to be cached (we fetch it once a minute per city).
//
// When both list the same match, it becomes ONE match with both sources, and
// the watch page shows the servers of both. If one feed is down, the other
// keeps the site running.
// ---------------------------------------------------------------------------

const FEED_FRESH_MS = 60_000; // both feeds ask for ~1 request a minute
const FETCH_TIMEOUT_MS = 8_000;
const PPV_DEFAULT_DOMAINS = ["ppv.st", "ppv.tj", "ppvs.pk", "ppv.rw", "ppv.ms", "ppv.bi", "ppv.ug"];
const SF_BASE = "https://streamfree.top";
// ppv.st blocks Cloudflare's shared server IPs unless the request carries our
// developer key (X-DevKey, given by ppv support). The key lives only in the
// Cloudflare secret PPV_DEVKEY — never in code. No key → ppv is skipped and
// the site runs on streamfree alone.
const ppvKey = (): string => process.env.PPV_DEVKEY || "";
// What viewers see on streamfree servers (our private codename for that source).
const SF_LABEL = "Nova";

// Our sport ids (the ones the site has always used) ← each feed's categories.
const PPV_SPORT: Record<string, string> = {
  "football": "football",
  "soccer": "football",
  "basketball": "basketball",
  "american football": "american-football",
  "ice hockey": "hockey",
  "hockey": "hockey",
  "baseball": "baseball",
  "motorsport": "motor-sports",
  "motorsports": "motor-sports",
  "motor sports": "motor-sports",
  "racing": "motor-sports",
  "combat sports": "fight",
  "boxing": "fight",
  "mma": "fight",
  "ufc": "fight",
  "wrestling": "fight",
  "tennis": "tennis",
  "rugby": "rugby",
  "golf": "golf",
  "snooker": "billiards",
  "billiards": "billiards",
  "australian football": "afl",
  "darts": "darts",
  "cricket": "cricket",
  "24/7 streams": "other",
};
const SF_SPORT: Record<string, string> = {
  soccer: "football",
  basketball: "basketball",
  football: "american-football",
  hockey: "hockey",
  baseball: "baseball",
  racing: "motor-sports",
  combat: "fight",
  tennis: "tennis",
  cricket: "cricket",
};

export const SPORT_IDS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "fight", "tennis", "rugby", "golf", "billiards",
  "afl", "darts", "cricket", "other",
];

// Leagues / competitions that count as "Popular" (the home page's Popular tab).
const POPULAR_TAGS = [
  "premier league", "la liga", "laliga", "serie a", "bundesliga", "ligue 1",
  "champions league", "europa league", "conference league", "fa cup", "copa del rey",
  "dfb-pokal", "coppa italia", "carabao", "efl cup", "world cup", "euro", "nations league",
  "copa america", "afcon", "africa cup", "saudi pro league", "mls", "eredivisie", "primeira liga",
  "super lig", "süper lig", "nba", "nfl", "nhl", "ufc", "boxing", "formula 1", "f1", "wwe",
];

// ---- raw feed types ---------------------------------------------------------

interface PpvStream {
  id: number;
  name: string;
  tag?: string;
  source_tag?: string;
  poster?: string;
  uri_name?: string;
  starts_at?: number;
  ends_at?: number;
  always_live?: number | boolean;
  locale?: string;
  category_name?: string;
  iframe?: string;
  substreams?: { id: number; name?: string; source_tag?: string; locale?: string; iframe?: string }[];
  viewers?: string | number;
}
interface PpvFeed {
  streams?: { category: string; id: number; always_live?: number | boolean; streams: PpvStream[] }[];
}
interface SfStream {
  name: string;
  category: string;
  league?: string;
  stream_key: string;
  match_timestamp?: number;
  sources?: string[];
  thumbnail_url?: string;
}
interface SfFeed {
  streams?: SfStream[];
}

// ---- fetching ---------------------------------------------------------------

async function getJson<T>(url: string, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "primepitch", accept: "application/json", ...extra },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ppv.st's own list of working domains, refreshed every 6 h.
async function ppvDomains(): Promise<string[]> {
  try {
    return await edgeMemo("ppv_domains", 6 * 3600_000, async () => {
      for (const d of PPV_DEFAULT_DOMAINS) {
        try {
          const j = await getJson<{ domains?: string[] }>(`https://api.${d}/api/ping`, { "X-DevKey": ppvKey() });
          if (Array.isArray(j.domains) && j.domains.length) return j.domains;
        } catch {
          /* try the next one */
        }
      }
      throw new Error("no ppv domain answered ping");
    });
  } catch {
    return PPV_DEFAULT_DOMAINS;
  }
}

async function ppvFeed(): Promise<PpvFeed> {
  if (!ppvKey()) throw new Error("ppv key missing");
  return edgeMemo("ppv_feed", FEED_FRESH_MS, async () => {
    const domains = await ppvDomains();
    let lastErr: unknown = null;
    for (const d of domains) {
      try {
        const j = await getJson<PpvFeed & { success?: boolean }>(`https://api.${d}/api/streams`, { "X-DevKey": ppvKey() });
        if (Array.isArray(j.streams)) return { streams: j.streams };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("ppv feed unavailable");
  });
}

async function sfFeed(): Promise<SfFeed> {
  return edgeMemo("sf_feed", FEED_FRESH_MS, async () => {
    const j = await getJson<SfFeed>(`${SF_BASE}/api/v1/streams`);
    return { streams: Array.isArray(j.streams) ? j.streams : [] };
  });
}

// ---- normalising ------------------------------------------------------------

function splitTeams(title: string): { home?: string; away?: string } {
  const t = title.replace(/\s+/g, " ").trim();
  let m = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(t);
  if (m) return { home: m[1].trim(), away: m[2].trim() };
  // US style "Away at Home"
  m = /^(.+?)\s+at\s+(.+)$/i.exec(t);
  if (m) return { home: m[2].trim(), away: m[1].trim() };
  return {};
}

function cleanTitle(title: string): string {
  return title.replace(/\s+vs\.\s+/gi, " vs ").replace(/\s+/g, " ").trim();
}

function isPopular(tag: string | undefined, viewers: number): boolean {
  const t = (tag || "").toLowerCase();
  return viewers >= 100 || POPULAR_TAGS.some((p) => t.includes(p));
}

interface FeedMatch extends Match {
  /** end of the event (ms), when the feed gives one */
  endsAt?: number;
  /** league / competition label */
  league?: string;
  /** feed says it is a permanent channel, not a fixture */
  alwaysLive?: boolean;
  /** internal: what to compare when merging */
  _h?: string;
  _a?: string;
}

function fromPpv(feed: PpvFeed): FeedMatch[] {
  const out: FeedMatch[] = [];
  for (const cat of feed.streams || []) {
    const sport = PPV_SPORT[(cat.category || "").toLowerCase()] || "other";
    for (const s of cat.streams || []) {
      if (!s?.id || !s.name) continue;
      const teams = splitTeams(s.name);
      const viewers = Number(s.viewers || 0) || 0;
      const alwaysLive = !!(s.always_live || cat.always_live);
      out.push({
        id: `ppv-${s.id}`,
        title: cleanTitle(s.name),
        category: sport,
        date: (s.starts_at || 0) * 1000,
        endsAt: s.ends_at ? s.ends_at * 1000 : undefined,
        poster: s.poster || undefined,
        popular: isPopular(s.tag, viewers),
        league: s.tag || undefined,
        alwaysLive,
        sources: [{ source: "ppv", id: String(s.id) }],
        ...(teams.home && teams.away ? { teams: { home: { name: teams.home }, away: { name: teams.away } } } : {}),
        _h: teams.home ? normalizeTeamName(teams.home) : undefined,
        _a: teams.away ? normalizeTeamName(teams.away) : undefined,
      });
    }
  }
  return out;
}

function fromSf(feed: SfFeed): FeedMatch[] {
  const out: FeedMatch[] = [];
  for (const s of feed.streams || []) {
    if (!s?.stream_key || !s.name) continue;
    const sport = SF_SPORT[(s.category || "").toLowerCase()] || "other";
    const teams = splitTeams(s.name);
    out.push({
      id: `sf-${s.stream_key}`,
      title: cleanTitle(s.name),
      category: sport,
      date: (s.match_timestamp || 0) * 1000,
      poster: s.thumbnail_url || undefined,
      popular: isPopular(s.league, 0),
      league: s.league || undefined,
      // Rows without "A vs B" are channels (RedZone, Sky Sports F1, Willow…).
      alwaysLive: !(teams.home && teams.away),
      sources: [{ source: "sf", id: s.stream_key }],
      ...(teams.home && teams.away ? { teams: { home: { name: teams.home }, away: { name: teams.away } } } : {}),
      _h: teams.home ? normalizeTeamName(teams.home) : undefined,
      _a: teams.away ? normalizeTeamName(teams.away) : undefined,
    });
  }
  return out;
}

// One list per sport: ppv first; a streamfree entry for the same match is
// folded into it as an extra source, the rest are added on their own.
function merge(ppv: FeedMatch[], sf: FeedMatch[]): FeedMatch[] {
  const out = [...ppv];
  for (const s of sf) {
    const twin =
      s._h && s._a
        ? out.find(
            (p) =>
              p.category === s.category &&
              p._h &&
              p._a &&
              !p.sources.some((x) => x.source === "sf") &&
              sameFixture(
                { home: p._h, away: p._a, time: Math.round(p.date / 1000), rawHome: p.teams?.home?.name, rawAway: p.teams?.away?.name },
                { home: s._h as string, away: s._a as string, time: Math.round(s.date / 1000), rawHome: s.teams?.home?.name, rawAway: s.teams?.away?.name }
              )
          )
        : undefined;
    if (twin) {
      twin.sources = [...twin.sources, ...s.sources];
      twin.popular = twin.popular || s.popular;
      if (!twin.poster && s.poster) twin.poster = s.poster;
    } else {
      out.push(s);
    }
  }
  return out;
}

function publicMatch(m: FeedMatch): Match {
  // drop internal fields before it leaves the server
  const { _h, _a, ...rest } = m;
  void _h;
  void _a;
  return rest;
}

// Both feeds, normalised and merged. Either feed failing just means fewer
// matches; both failing throws (callers keep their last good copy).
export async function allFeedMatches(): Promise<FeedMatch[]> {
  const [p, s] = await Promise.allSettled([ppvFeed(), sfFeed()]);
  if (p.status === "rejected" && s.status === "rejected") {
    throw new Error("both match feeds are unavailable");
  }
  const ppv = p.status === "fulfilled" ? fromPpv(p.value) : [];
  const sf = s.status === "fulfilled" ? fromSf(s.value) : [];
  return merge(ppv, sf);
}

// ---- public API (same shapes the app has always used) -----------------------

/** Every match (upcoming + live) for one of our sport ids. */
export async function getFeedMatches(sport: string): Promise<Match[]> {
  const all = await allFeedMatches();
  return all.filter((m) => m.category === sport && !m.alwaysLive).map(publicMatch);
}

/** Live right now: from 10 min before the listed start to the listed end
 *  (or 3 h after start when the feed gives no end). 24/7 channels excluded. */
export async function getFeedLive(): Promise<Match[]> {
  const now = Date.now();
  const all = await allFeedMatches();
  return all
    .filter((m) => {
      if (m.alwaysLive || !m.date) return false;
      const end = m.endsAt || m.date + 3 * 3600_000;
      return now >= m.date - 10 * 60_000 && now < end;
    })
    .map((m) => ({ ...publicMatch(m), isLive: true }));
}

/** Playable servers for one source of a match ("ppv" / "sf"). */
export async function getFeedStreams(source: string, id: string): Promise<Stream[]> {
  if (source === "ppv") {
    const feed = await ppvFeed();
    const s = (feed.streams || []).flatMap((c) => c.streams || []).find((x) => String(x.id) === id);
    if (!s) return [];
    const list: Stream[] = [];
    if (s.iframe) {
      list.push({ id: `ppv-${s.id}`, streamNo: 1, language: s.source_tag || "Main", hd: true, embedUrl: s.iframe, source: "ppv" });
    }
    for (const sub of s.substreams || []) {
      if (!sub?.iframe) continue;
      list.push({
        id: `ppv-${sub.id}`,
        streamNo: list.length + 1,
        language: sub.source_tag || "Alt",
        hd: true,
        embedUrl: sub.iframe,
        source: "ppv",
      });
    }
    return list;
  }
  if (source === "sf") {
    const feed = await sfFeed();
    const s = (feed.streams || []).find((x) => x.stream_key === id);
    // Same quality twice → "Nova 1080p", "Nova 1080p 2" so viewers can tell them apart.
    const seen = new Map<string, number>();
    return (s?.sources || []).map((url, i) => {
      const q = /(\d{3,4})p/i.exec(url)?.[1];
      const base = q ? `${SF_LABEL} ${q}p` : SF_LABEL;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return {
        id: `sf-${id}-${i}`,
        streamNo: i + 1,
        language: n > 1 ? `${base} ${n}` : base,
        hd: !!q && Number(q) >= 720,
        embedUrl: url,
        source: "sf",
      };
    });
  }
  return [];
}

/** Every server for the match that carries this source — ppv servers first,
 *  then the streamfree ones when both feeds list the same fixture. */
export async function getFeedMatchStreams(source: string, id: string): Promise<Stream[]> {
  let sources: { source: string; id: string }[] = [{ source, id }];
  try {
    const all = await allFeedMatches();
    const m = all.find((x) => x.sources.some((s) => s.source === source && s.id === id));
    if (m) sources = m.sources;
  } catch {
    /* fall back to just the one source */
  }
  const lists = await Promise.all(sources.map((s) => getFeedStreams(s.source, s.id).catch(() => [] as Stream[])));
  return lists.flat().map((s, i) => ({ ...s, streamNo: i + 1 }));
}

export const __test = { fromPpv, fromSf, merge };
