export interface Env {
  TRACKER: DurableObjectNamespace;
  CRON_SECRET: string;
  SITE_URL?: string;
}

export class TrackerObject {
  private viewers: Map<string, { m: string; p: string; r: string; t: number }> = new Map();
  private joinQueue: any[] = [];
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ensureAlarm();
  }

  async ensureAlarm() {
    const current = await this.state.storage.getAlarm();
    if (!current) {
      await this.state.storage.setAlarm(Date.now() + 15000);
    }
  }

  async alarm() {
    if (this.joinQueue.length > 0) {
      const batch = [...this.joinQueue];
      this.joinQueue = [];
      try {
        const targetHost = this.env.SITE_URL || "https://primepitch.daxonicstudios.workers.dev";
        const res = await fetch(`${targetHost}/api/internal/flush-joins`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.env.CRON_SECRET || 'secret'}` },
          body: JSON.stringify({ joins: batch })
        });
        if (!res.ok) {
           this.joinQueue.push(...batch);
        }
      } catch(e) {
        this.joinQueue.push(...batch);
      }
    }
    
    // Clean up stale viewers directly in alarm so it accurately checks if empty
    const now = Date.now();
    const cutoff = now - 6 * 60 * 1000;
    for (const [vid, v] of this.viewers.entries()) {
      if (v.t < cutoff) this.viewers.delete(vid);
    }

    if (this.viewers.size > 0 || this.joinQueue.length > 0) {
      await this.state.storage.setAlarm(Date.now() + 15000);
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/join") {
      try {
        const body = await request.json() as any;
        this.joinQueue.push(body);
        this.ensureAlarm();
        return new Response("ok", { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
      } catch (e) {
        return new Response("bad request", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
      }
    }

    if (request.method === "POST" && url.pathname === "/ping") {
      try {
        const body = await request.json() as any;
        const { visitor_id, match_id, path, ref_code } = body;
        if (visitor_id) {
          this.viewers.set(visitor_id, {
            m: match_id || "",
            p: path || "/",
            r: ref_code || "",
            t: Date.now()
          });
        }
        this.ensureAlarm();
        return new Response("ok", { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
      } catch (e) {
        return new Response("bad request", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
      }
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      const now = Date.now();
      const cutoff = now - 6 * 60 * 1000; // 6 minutes
      
      const stats = {
        total: 0,
        matches: {} as Record<string, { total: number; refs: Record<string, number> }>,
        pages: {} as Record<string, { total: number; refs: Record<string, number> }>,
      };

      for (const [vid, v] of this.viewers.entries()) {
        if (v.t < cutoff) {
          this.viewers.delete(vid);
          continue;
        }

        stats.total++;

        // Track by match
        if (v.m) {
          if (!stats.matches[v.m]) stats.matches[v.m] = { total: 0, refs: {} };
          stats.matches[v.m].total++;
          const ref = v.r || "none";
          stats.matches[v.m].refs[ref] = (stats.matches[v.m].refs[ref] || 0) + 1;
        }

        // Track by page
        if (v.p) {
          if (!stats.pages[v.p]) stats.pages[v.p] = { total: 0, refs: {} };
          stats.pages[v.p].total++;
          const ref = v.r || "none";
          stats.pages[v.p].refs[ref] = (stats.pages[v.p].refs[ref] || 0) + 1;
        }
      }

      let watchers_total = 0;
      for (const mData of Object.values(stats.matches)) {
        watchers_total += mData.total;
      }

      return new Response(JSON.stringify({
        total: stats.total,
        total_online: stats.total,
        watchers_total,
        matches: stats.matches,
        pages: stats.pages,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response("not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

// ---------------------------------------------------------------------------
// Sharding. One Durable Object handles its requests one at a time, so a single
// "GLOBAL" counter tops out around a thousand-odd heartbeats a second — about
// 30-40k viewers at one heartbeat every 30 s. Visitors are spread over SHARDS
// counters by a hash of their visitor id (the same visitor always lands on the
// same shard, so nobody is counted twice), and /stats adds the shards up.
// 32 shards = room for well over 500k concurrent viewers.
// ---------------------------------------------------------------------------
const SHARDS = 32;
const STATS_CACHE_MS = 5_000;

function shardOf(visitorId: string): number {
  // FNV-1a — fast, stable, evenly spread.
  let h = 0x811c9dc5;
  for (let i = 0; i < visitorId.length; i++) {
    h ^= visitorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % SHARDS;
}

function shardStub(env: Env, n: number) {
  return env.TRACKER.get(env.TRACKER.idFromName(`SHARD-${n}`));
}

type Bucket = { total: number; refs: Record<string, number> };
type Stats = {
  total: number;
  total_online: number;
  watchers_total: number;
  matches: Record<string, Bucket>;
  pages: Record<string, Bucket>;
};

function mergeInto(into: Record<string, Bucket>, from: Record<string, Bucket> | undefined) {
  for (const [k, b] of Object.entries(from || {})) {
    const t = (into[k] ||= { total: 0, refs: {} });
    t.total += b.total || 0;
    for (const [r, n] of Object.entries(b.refs || {})) t.refs[r] = (t.refs[r] || 0) + n;
  }
}

let statsCache: { at: number; body: string } | null = null;
let statsInflight: Promise<string> | null = null;

async function mergedStats(env: Env): Promise<string> {
  if (statsCache && Date.now() - statsCache.at < STATS_CACHE_MS) return statsCache.body;
  if (statsInflight) return statsInflight;
  statsInflight = (async () => {
    const parts = await Promise.all(
      Array.from({ length: SHARDS }, (_, n) =>
        shardStub(env, n)
          .fetch("https://shard/stats")
          .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
          .catch(() => null)
      )
    );
    const out: Stats = { total: 0, total_online: 0, watchers_total: 0, matches: {}, pages: {} };
    for (const p of parts) {
      if (!p) continue;
      out.total += p.total || 0;
      out.watchers_total += p.watchers_total || 0;
      mergeInto(out.matches, p.matches);
      mergeInto(out.pages, p.pages);
    }
    out.total_online = out.total;
    const body = JSON.stringify(out);
    statsCache = { at: Date.now(), body };
    return body;
  })().finally(() => {
    statsInflight = null;
  });
  return statsInflight;
}

const CORS = { "Access-Control-Allow-Origin": "*" };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      const body = await mergedStats(env);
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
    }

    if (request.method === "POST" && (url.pathname === "/ping" || url.pathname === "/join")) {
      // Read the body once to find the visitor's shard, then hand it on.
      const text = await request.text();
      let vid = "";
      try {
        vid = String((JSON.parse(text) as { visitor_id?: string }).visitor_id || "");
      } catch {
        return new Response("bad request", { status: 400, headers: CORS });
      }
      const stub = shardStub(env, shardOf(vid || crypto.randomUUID()));
      return stub.fetch(`https://shard${url.pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
  
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    // Ping the main site's API to trigger GA4 Sync
    try {
      const res = await fetch("https://primepitch.live/api/cron/sync-ga4", {
        headers: {
          "Authorization": "Bearer secret"
        }
      });
      console.log("GA4 Sync Result:", await res.text());
    } catch (e) {
      console.error("Failed to trigger GA4 Sync", e);
    }
  }
};
