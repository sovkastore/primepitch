import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { signSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .rpc("verify_partner", { p_email: String(email).trim(), p_password: String(password) });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signSession({ pid: row.id, code: row.code, name: row.name });
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
