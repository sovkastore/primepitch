import { getCloudflareContext } from "@opennextjs/cloudflare";

// Shared, crowd-proof read of a value that is the same for every visitor
// (a settings row, a feed copy, a signing secret).
//
//   1. this Worker instance's memory
//   2. Cloudflare's edge cache in the visitor's city (shared by every
//      instance there; a no-op on *.workers.dev)
//   3. optionally KV — a global last-good copy for values that must never
//      be missing (signing secrets)
//   4. the loader (usually the database) — only when the copy is older than
//      `freshMs`, so database reads stay roughly constant however big the
//      crowd gets.
//
// If the loader fails, the newest copy from any layer is returned instead —
// a slow database never turns into an empty page or a logout.

type Entry<T> = { at: number; value: T };
// Minimal shape of the KV binding (SNAP in wrangler.toml).
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const CACHE_HOST = "https://edge-memo.primepitch.internal/";
const KEEP_SEC = 24 * 3600; // how long the edge cache keeps a stale copy

interface Options {
  // Also keep a global copy in KV (written only when it changes).
  kv?: boolean;
}

function edgeCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

async function kvBinding(): Promise<KVNamespace | null> {
  try {
    const { env } = (await getCloudflareContext()) as unknown as { env: { SNAP?: KVNamespace } };
    return env.SNAP ?? null;
  } catch {
    return null;
  }
}

async function readEdge<T>(key: string): Promise<Entry<T> | null> {
  const c = edgeCache();
  if (!c) return null;
  try {
    const r = await c.match(new Request(CACHE_HOST + encodeURIComponent(key)));
    return r ? ((await r.json()) as Entry<T>) : null;
  } catch {
    return null;
  }
}

async function writeEdge<T>(key: string, e: Entry<T>) {
  const c = edgeCache();
  if (!c) return;
  try {
    await c.put(
      new Request(CACHE_HOST + encodeURIComponent(key)),
      new Response(JSON.stringify(e), {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${KEEP_SEC}` },
      })
    );
  } catch {
    /* best effort */
  }
}

export async function edgeMemo<T>(
  key: string,
  freshMs: number,
  loader: () => Promise<T>,
  opts: Options = {}
): Promise<T> {
  const now = Date.now();
  const m = mem.get(key) as Entry<T> | undefined;
  if (m && now - m.at < freshMs) return m.value;

  const shared = await readEdge<T>(key);
  if (shared && now - shared.at < freshMs) {
    mem.set(key, shared);
    return shared.value;
  }

  // One load per instance at a time; everyone else waits for that one.
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const value = await loader();
      const e = { at: Date.now(), value };
      mem.set(key, e);
      await writeEdge(key, e);
      if (opts.kv) {
        const kv = await kvBinding();
        if (kv) {
          try {
            const prev = await kv.get("memo:" + key);
            const next = JSON.stringify(value);
            if (prev !== next) await kv.put("memo:" + key, next);
          } catch {
            /* best effort */
          }
        }
      }
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }

  try {
    return await p;
  } catch (err) {
    // Loader failed: newest copy we have, from any layer.
    const stale = [m, shared].filter(Boolean).sort((a, b) => b!.at - a!.at)[0];
    if (stale) return stale.value;
    if (opts.kv) {
      const kv = await kvBinding();
      try {
        const v = kv ? await kv.get("memo:" + key) : null;
        if (v != null) return JSON.parse(v) as T;
      } catch {
        /* fall through */
      }
    }
    throw err;
  }
}

// Forget the copy in this instance and this city (after an admin change), so
// the next read loads the new value.
export async function edgeMemoForget(key: string): Promise<void> {
  mem.delete(key);
  const c = edgeCache();
  try {
    await c?.delete(new Request(CACHE_HOST + encodeURIComponent(key)));
  } catch {
    /* best effort */
  }
}
