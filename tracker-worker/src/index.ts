export interface Env {
  TRACKER: DurableObjectNamespace;
  CRON_SECRET: string;
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const id = env.TRACKER.idFromName("GLOBAL");
    const obj = env.TRACKER.get(id);
    return obj.fetch(request);
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
