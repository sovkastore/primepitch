import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { signSession, PARTNER_COOKIE } from "@/lib/partner-auth";
import { throttle, clientIp } from "@/lib/throttle";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const t = await throttle(`plogin:ip:${clientIp(request)}`, 15, 15 * 60_000);
    if (!t.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

    const row = await d1.prepare(
      "SELECT id, code, name FROM d1_partners WHERE email = ? AND password_hash = ? AND active = 1 AND suspended = 0 AND banned = 0"
    ).bind(String(email).trim(), String(password)).first<{id: string; code: string; name: string}>();

    if (!row) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // New login = the only live session. Whoever was signed in before is out.
    const sid = crypto.randomUUID();
    await d1.prepare("UPDATE d1_partners SET session_id = ? WHERE id = ?").bind(sid, row.id).run();
    const token = await signSession({ pid: String(row.id), code: String(row.code), name: String(row.name), sid });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PARTNER_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: true, path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
