import { NextRequest, NextResponse } from "next/server";
import { signAdminSession, ADMIN_COOKIE } from "@/lib/admin-auth";

// POST /api/admin/login — simple email+password admin login.
// Credentials are checked against ADMIN_EMAILS env var and ADMIN_PASSWORD env var.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase());
    const adminPassword = process.env.ADMIN_PASSWORD || "";

    if (!adminEmails.includes(String(email).trim().toLowerCase())) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!adminPassword || String(password) !== adminPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signAdminSession({ email: String(email).trim().toLowerCase() });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: true, path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
