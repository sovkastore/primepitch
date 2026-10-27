import { NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { edgeMemo } from "@/lib/edge-memo";

// Lightweight, self-contained admin auth — zero Supabase dependency.
// Admin sessions use the same HMAC-signed cookie pattern as partner auth.
// The signing secret is stored in d1_site_settings under "admin_session_secret".
// If no secret exists, one is generated automatically on first use.

export const ADMIN_COOKIE = "pp_admin";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Read through edgeMemo: one database read per city every 10 minutes, with a
// KV backup — so during a traffic rush a slow database no longer logs the
// admin out (that used to send you back to the login page on big-match nights).
async function getSecret(): Promise<string> {
  return edgeMemo("admin_session_secret", 10 * 60_000, async () => {
    const d1 = await getD1();
    if (!d1) throw new Error("D1_BINDING_MISSING");
    const row = await d1.prepare(`SELECT value FROM d1_site_settings WHERE key = 'admin_session_secret'`).first<{ value: string }>();
    if (row?.value) return row.value;
    // Auto-generate a secret on first use
    const newSecret = crypto.randomUUID() + "-" + crypto.randomUUID();
    await d1.prepare(`INSERT OR REPLACE INTO d1_site_settings (key, value, updated_at) VALUES ('admin_session_secret', ?, datetime('now'))`).bind(newSecret).run();
    return newSecret;
  }, { kv: true });
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToStr(s: string): string {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return atob(t);
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(sig);
}

export interface AdminSession { email: string }

export async function signAdminSession(p: AdminSession): Promise<string> {
  const payload = { ...p, exp: Date.now() + TTL_MS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(await getSecret(), body);
  return `${body}.${sig}`;
}

export async function verifyAdminSession(token: string | null | undefined): Promise<AdminSession | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const expected = await hmac(await getSecret(), body);
    if (sig !== expected) return null;
    const payload = JSON.parse(b64urlToStr(body)) as AdminSession & { exp: number };
    if (!payload?.exp || Date.now() > payload.exp) return null;
    // Verify email is still in ADMIN_EMAILS
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase());
    if (!adminEmails.includes(payload.email?.toLowerCase() || "")) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

// Verifies the caller is a signed-in admin.
// Checks the pp_admin cookie for a valid HMAC-signed session.
export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const session = await verifyAdminSession(token);
    return session !== null;
  } catch {
    return false;
  }
}

// Guard for /api/admin/* handlers: works with a plain Request (reads the
// pp_admin cookie from the header). Returns a 401 response to send back, or
// null when the caller is a signed-in admin.
export async function adminGuard(request: Request): Promise<Response | null> {
  try {
    const m = /(?:^|;\s*)pp_admin=([^;]+)/.exec(request.headers.get("cookie") || "");
    const session = await verifyAdminSession(m ? decodeURIComponent(m[1]) : null);
    if (session) return null;
  } catch {
    /* fall through to 401 */
  }
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
