export interface Env {
  TRACKER: DurableObjectNamespace;
}

export class TrackerObject {
  private viewers: Map<string, { m: string; p: string; r: string; t: number }> = new Map();

  constructor(state: DurableObjectState, env: Env) {}

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

      return new Response(JSON.stringify(stats), {
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
  }
};
