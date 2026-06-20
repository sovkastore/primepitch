import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

// Manual per-match push trigger. The /api/* tree is excluded from middleware,
// so this route authenticates itself (admin session + ADMIN_EMAILS) before
// forwarding to the push-sender edge function's "announce" mode. The Supabase
// service-role key (server-only) is a valid JWT, satisfying push-sender's
// verify_jwt — it is never exposed to the client.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { home?: string; away?: string; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* invalid body — validated below */
  }
  const home = (body.home || "").trim();
  const away = (body.away || "").trim();
  const kind = (body.kind || "live").trim();
  if (!home || !away) {
    return NextResponse.json({ error: "home and away required" }, { status: 400 });
  }
  if (!["soon5", "soon1", "live"].includes(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/functions/v1/push-sender?mode=announce`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ home, away, kind }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json({ error: "Send failed", detail: data }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: data.sent ?? 0, match: data.match ?? `${home} vs ${away}` });
  } catch (e) {
    return NextResponse.json({ error: "Send error: " + String(e) }, { status: 502 });
  }
}
