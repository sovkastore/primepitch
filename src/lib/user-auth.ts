import { getD1 } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Member accounts (VIP).
//
// An account is an email + password. On its own it gives nothing: VIP is a
// date on the account (`vip_until`) that is set when a payment is confirmed
// or when an admin grants it, and the site is ad-free while that date is in
// the future.
//
// One person at a time: every login mints a new session id and writes it on
// the account. The cookie carries the session id, and every check compares
// it with the one on the account — so the moment someone else logs in, the
// earlier cookie stops matching and that device is signed out.
// ---------------------------------------------------------------------------

export const USER_COOKIE = "pp_user";
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const PBKDF2_ITER = 100_000;

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  vip_until: string | null;
  session_id: string | null;
  session_ua: string | null;
  session_at: string | null;
  status: string;
  note: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type UserSession = { uid: string; sid: string };

export type Me = {
  id: string;
  email: string;
  vip: boolean;
  vipUntil: string | null;
};

// ---- secret ---------------------------------------------------------------
let cachedSecret: { at: number; val: string } | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret && Date.now() - cachedSecret.at < 5 * 60 * 1000) return cachedSecret.val;
  const d1 = await getD1();
  if (!d1) throw new Error("D1_BINDING_MISSING");
  const row = await d1
    .prepare(`SELECT value FROM d1_site_settings WHERE key = 'user_session_secret'`)
    .first<{ value: string }>();
  if (row?.value) {
    cachedSecret = { at: Date.now(), val: row.value };
    return row.value;
  }
  const fresh = crypto.randomUUID() + "-" + crypto.randomUUID();
  await d1
    .prepare(`INSERT OR REPLACE INTO d1_site_settings (key, value, updated_at) VALUES ('user_session_secret', ?, datetime('now'))`)
    .bind(fresh)
    .run();
  cachedSecret = { at: Date.now(), val: fresh };
  return fresh;
}

// ---- encoding helpers -----------------------------------------------------
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

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- passwords ------------------------------------------------------------
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = new Uint8Array(saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: hex(bits), salt: hex(salt) };
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyPassword(password: string, row: Pick<UserRow, "password_hash" | "salt">): Promise<boolean> {
  const { hash } = await hashPassword(password, row.salt);
  return timingSafeEqual(hash, row.password_hash);
}

// ---- session tokens -------------------------------------------------------
export async function signUserSession(s: UserSession): Promise<string> {
  const payload = { ...s, exp: Date.now() + TTL_MS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(await getSecret(), body);
  return `${body}.${sig}`;
}

export async function verifyUserToken(token: string | null | undefined): Promise<UserSession | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  let expected: string;
  try {
    expected = await hmac(await getSecret(), body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlToStr(body)) as UserSession & { exp: number };
    if (!payload?.exp || Date.now() > payload.exp || !payload.uid || !payload.sid) return null;
    return { uid: payload.uid, sid: payload.sid };
  } catch {
    return null;
  }
}

export const USER_COOKIE_OPTS = {
  maxAge: TTL_MS / 1000,
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
};

// ---- helpers ------------------------------------------------------------
export function normalizeEmail(e: unknown): string {
  return String(e || "").trim().toLowerCase();
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
}

export function vipActive(vipUntil: string | null | undefined): boolean {
  if (!vipUntil) return false;
  const t = Date.parse(vipUntil);
  return Number.isFinite(t) && t > Date.now();
}

export function toMe(row: Pick<UserRow, "id" | "email" | "vip_until">): Me {
  return { id: row.id, email: row.email, vip: vipActive(row.vip_until), vipUntil: row.vip_until };
}

// The account behind a cookie, but only if that cookie is still the ONE live
// session on the account. Returns a reason so the client can explain why.
export type Resolved =
  | { ok: true; user: UserRow }
  | { ok: false; reason: "none" | "invalid" | "replaced" | "disabled" };

export async function resolveUser(token: string | null | undefined): Promise<Resolved> {
  if (!token) return { ok: false, reason: "none" };
  const sess = await verifyUserToken(token);
  if (!sess) return { ok: false, reason: "invalid" };
  const d1 = await getD1();
  if (!d1) return { ok: false, reason: "invalid" };
  const row = await d1.prepare(`SELECT * FROM d1_users WHERE id = ?`).bind(sess.uid).first<UserRow>();
  if (!row) return { ok: false, reason: "invalid" };
  if (row.status !== "active") return { ok: false, reason: "disabled" };
  if (!row.session_id || row.session_id !== sess.sid) return { ok: false, reason: "replaced" };
  return { ok: true, user: row };
}

// Cheap check for the ads path: is this cookie an active VIP right now?
export async function isActiveVip(token: string | null | undefined): Promise<boolean> {
  try {
    const r = await resolveUser(token);
    return r.ok && vipActive(r.user.vip_until);
  } catch {
    return false;
  }
}

// Add time to an account's VIP. Stacks on top of what's left; starts now if
// nothing is left.
export async function grantVip(userId: string, ms: number): Promise<string> {
  const d1 = await getD1();
  if (!d1) throw new Error("D1_BINDING_MISSING");
  const row = await d1.prepare(`SELECT vip_until FROM d1_users WHERE id = ?`).bind(userId).first<{ vip_until: string | null }>();
  const base = row?.vip_until && vipActive(row.vip_until) ? Date.parse(row.vip_until) : Date.now();
  const until = new Date(base + ms).toISOString();
  await d1.prepare(`UPDATE d1_users SET vip_until = ? WHERE id = ?`).bind(until, userId).run();
  return until;
}
