import { getD1 } from "@/lib/d1";

// Lightweight, self-contained auth for the read-only partner portal.
// A session is an HMAC-signed token stored in the `pp_session` cookie.
// The signing secret lives in d1_site_settings (server-only) — independent of
// your admin auth, so the two portals never interfere.

export const PARTNER_COOKIE = "pp_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedSecret: { at: number; val: string } | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret && Date.now() - cachedSecret.at < 5 * 60 * 1000) return cachedSecret.val;
  const d1 = await getD1();
  if (!d1) throw new Error("D1_BINDING_MISSING");
  const row = await d1.prepare(`SELECT value FROM d1_site_settings WHERE key = 'partner_session_secret'`).first<{ value: string }>();
  const val = typeof row?.value === "string" ? row.value : "";
  if (!val) {
    // Auto-generate a secret on first use
    const newSecret = crypto.randomUUID() + "-" + crypto.randomUUID();
    await d1.prepare(`INSERT OR REPLACE INTO d1_site_settings (key, value, updated_at) VALUES ('partner_session_secret', ?, datetime('now'))`).bind(newSecret).run();
    cachedSecret = { at: Date.now(), val: newSecret };
    return newSecret;
  }
  cachedSecret = { at: Date.now(), val };
  return val;
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

export interface PartnerSession { pid: string; code: string; name?: string }

export async function signSession(p: PartnerSession): Promise<string> {
  const payload = { ...p, exp: Date.now() + TTL_MS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(await getSecret(), body);
  return `${body}.${sig}`;
}

export async function verifySession(token: string | null | undefined): Promise<PartnerSession | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = await hmac(await getSecret(), body);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(b64urlToStr(body)) as PartnerSession & { exp: number };
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return { pid: payload.pid, code: payload.code, name: payload.name };
  } catch {
    return null;
  }
}

// Like verifySession, but also re-checks the partner is still allowed in right
// now (exists, not suspended, not banned). Use for every dashboard page/request
// so suspend/ban take effect immediately — even on an already-issued cookie.
export async function requirePartnerSession(token: string | null | undefined): Promise<PartnerSession | null> {
  const sess = await verifySession(token);
  if (!sess) return null;
  const d1 = await getD1();
  if (!d1) return null;
  const row = await d1.prepare(
    `SELECT suspended, banned FROM d1_partners WHERE code = ?`
  ).bind(sess.code).first<{ suspended: number; banned: number }>();
  if (!row || row.suspended || row.banned) return null;
  return sess;
}
