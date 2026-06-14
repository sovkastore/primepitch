import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Records that a subscriber tapped a notification. Called by the service worker
// directly (device -> Supabase), so it adds ZERO Cloudflare requests.
// verify_jwt is intentionally OFF: this is a fire-and-forget analytics ping that
// only bumps a counter for an already-existing endpoint (no data is returned,
// no notifications can be sent). Kept as a CORS "simple request" (text/plain) so
// the browser does not issue a preflight.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("no", { status: 405, headers: cors });

  let endpoint = "";
  try {
    const body = JSON.parse(await req.text());
    if (typeof body?.endpoint === "string") endpoint = body.endpoint;
  } catch {
    /* ignore */
  }

  if (endpoint) {
    try {
      await supabase.rpc("bump_open", { ep: endpoint });
    } catch (e) {
      console.error("bump_open failed", (e as Error)?.message);
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
