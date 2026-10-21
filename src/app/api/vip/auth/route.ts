import { NextResponse, type NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import {
  USER_COOKIE, USER_COOKIE_OPTS, hashPassword, verifyPassword, signUserSession,
  normalizeEmail, isValidEmail, resolveUser, toMe, type UserRow,
} from "@/lib/user-auth";
import { throttle, clientIp } from "@/lib/throttle";

export const dynamic = "force-dynamic";

// POST { action: "signup" | "login" | "logout", email?, password? }
//
// Signing up logs the person straight in. Logging in anywhere replaces the
// account's live session, so whoever was signed in before is signed out on
// their next check.
export async function POST(request: NextRequest) {
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const action = String(body?.action || "");

  if (action === "logout") {
    const token = request.cookies.get(USER_COOKIE)?.value;
    const r = await resolveUser(token);
    if (r.ok) {
      const d1 = await getD1();
      // Only clear the live session if it is still ours — never kick the
      // person who replaced us.
      await d1?.prepare(`UPDATE d1_users SET session_id = NULL WHERE id = ? AND session_id = ?`)
        .bind(r.user.id, r.user.session_id).run();
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(USER_COOKIE, "", { ...USER_COOKIE_OPTS, maxAge: 0 });
    return res;
  }

  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  if (password.length > 200) return NextResponse.json({ error: "Password is too long." }, { status: 400 });

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "Service unavailable. Try again in a moment." }, { status: 503 });

  // Brute-force / spam guard: per IP and per email, shared across all Workers.
  const ip = clientIp(request);
  const limits = action === "signup"
    ? [throttle(`signup:ip:${ip}`, 5, 60 * 60_000)]
    : [throttle(`login:ip:${ip}`, 20, 15 * 60_000), throttle(`login:email:${email}`, 8, 15 * 60_000)];
  for (const t of await Promise.all(limits)) {
    if (!t.ok) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(t.retryAfterSec / 60)} min.` }, { status: 429 });
  }

  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  const now = new Date().toISOString();

  if (action === "signup") {
    const exists = await d1.prepare(`SELECT id FROM d1_users WHERE email = ?`).bind(email).first<{ id: string }>();
    if (exists) return NextResponse.json({ error: "An account with this email already exists. Log in instead." }, { status: 409 });
    const { hash, salt } = await hashPassword(password);
    const id = crypto.randomUUID();
    const sid = crypto.randomUUID();
    // Partner attribution: the referral cookie set when they first arrived
    // through a partner link. Locked to the account for life.
    const refCode = (request.cookies.get("pp_ref")?.value || "").trim().toLowerCase().slice(0, 40) || null;
    await d1.prepare(
      `INSERT INTO d1_users (id, email, password_hash, salt, session_id, session_ua, session_at, created_at, last_login_at, ref_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, hash, salt, sid, ua, now, now, now, refCode).run();
    const token = await signUserSession({ uid: id, sid });
    const res = NextResponse.json({ ok: true, me: { id, email, vip: false, vipUntil: null } });
    res.cookies.set(USER_COOKIE, token, USER_COOKIE_OPTS);
    return res;
  }

  if (action === "login") {
    const row = await d1.prepare(`SELECT * FROM d1_users WHERE email = ?`).bind(email).first<UserRow>();
    if (!row || !(await verifyPassword(password, row))) {
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }
    if (row.status !== "active") {
      return NextResponse.json({ error: "This account has been disabled. Contact support." }, { status: 403 });
    }
    const sid = crypto.randomUUID();
    await d1.prepare(
      `UPDATE d1_users SET session_id = ?, session_ua = ?, session_at = ?, last_login_at = ? WHERE id = ?`
    ).bind(sid, ua, now, now, row.id).run();
    const token = await signUserSession({ uid: row.id, sid });
    const res = NextResponse.json({ ok: true, me: toMe(row) });
    res.cookies.set(USER_COOKIE, token, USER_COOKIE_OPTS);
    return res;
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
