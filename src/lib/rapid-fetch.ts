// Single shared RapidAPI fetcher used by the robot, the manual buttons, and
// the visitor-cache path.
//
// Key management: the working key index is persisted in D1, so once key #1's
// daily quota dies, every later fetch starts straight at the live key instead
// of burning (and miscounting) an attempt on the dead one. When a key fails
// with a quota error, rotation advances and the new index is remembered.
//
// Counting: only requests that actually consumed quota (HTTP 200) are counted
// toward the 📊 meter — quota-rejected attempts cost nothing at RapidAPI and
// are no longer counted, so the meter matches real consumption.
import { getD1 } from "@/lib/d1";
import { countRapidRequest } from "@/lib/rapid-count";

const RAPID_API_HOST = "football-live-streaming-api.p.rapidapi.com";
const KEY_INDEX_SETTING = "rapid_key_index";

export interface RapidFeedMatch {
  home_team_name: string;
  away_team_name: string;
  match_time: string | number;
  match_status?: string;
  league_name?: string;
  home_team_logo?: string;
  away_team_logo?: string;
  servers?: unknown[];
}

function getKeys(): string[] {
  return (process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

async function getStartIndex(d1: D1Database | undefined, keyCount: number): Promise<number> {
  try {
    if (d1) {
      const row = await d1
        .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
        .bind(KEY_INDEX_SETTING)
        .first<{ value: string }>();
      const i = Number(row?.value ?? 0);
      if (Number.isInteger(i) && i >= 0 && i < keyCount) return i;
    }
  } catch {
    /* default to first key */
  }
  return 0;
}

async function saveStartIndex(d1: D1Database | undefined, index: number) {
  try {
    if (d1) {
      await d1
        .prepare(
          "INSERT INTO d1_site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        .bind(KEY_INDEX_SETTING, String(index))
        .run();
    }
  } catch {
    /* remembering the key is best-effort */
  }
}

// Fetch one feed page (1-based). Returns the match list, or null when every
// key failed. Exactly one metered request per successful call.
export async function fetchRapidPage(source: string, page = 1): Promise<RapidFeedMatch[] | null> {
  const keys = getKeys();
  if (keys.length === 0) return null;

  const d1 = await getD1();
  const start = await getStartIndex(d1, keys.length);

  for (let n = 0; n < keys.length; n++) {
    const idx = (start + n) % keys.length;
    try {
      const res = await fetch(`https://${RAPID_API_HOST}/matches?page=${page}`, {
        headers: { "x-rapidapi-host": RAPID_API_HOST, "x-rapidapi-key": keys[idx] },
      });
      if (!res.ok) continue; // dead/limited key — consumed nothing, count nothing

      await countRapidRequest(source);
      if (idx !== start) await saveStartIndex(d1, idx);

      const data = (await res.json()) as
        | RapidFeedMatch[]
        | { matches?: RapidFeedMatch[]; data?: RapidFeedMatch[]; results?: RapidFeedMatch[] };
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.matches)) return data.matches;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.results)) return data.results;
      return null; // quota spent but unusable shape — caller treats as failure
    } catch {
      /* network error — try next key */
    }
  }
  return null;
}
