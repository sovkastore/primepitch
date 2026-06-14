import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Records that a device dismissed the announcement banner. Called by the
// banner component directly (device -> Supabase), so it adds ZERO Cloudflare
// requests. verify_jwt is intentionally OFF: this is a fire-and-forget
// analytics ping that only upserts (device_id, signature). The PK makes it
// idempotent, so one device dismissing the same message twice counts once.
// Kept as a CORS "simple request" (text/plain) so the browser issues no
// preflight.
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

  let deviceId = "";
  let signature = "";
  try {
    const body = JSON.parse(await req.text());
    if (typeof body?.device_id === "string") deviceId = body.device_id.slice(0, 100);
    if (typeof body?.signature === "string") signature = body.signature.slice(0, 40);
  } catch {
    /* ignore */
  }

  if (deviceId && signature) {
    try {
      await supabase
        .from("announcement_dismissals")
        .upsert(
          { device_id: deviceId, signature, dismissed_at: new Date().toISOString() },
          { onConflict: "device_id,signature" },
        );
    } catch (e) {
      console.error("dismiss upsert failed", (e as Error)?.message);
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
