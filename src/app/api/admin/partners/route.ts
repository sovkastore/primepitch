import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Codes that would clash with real site paths (kept in sync with middleware).
const RESERVED = new Set([
  "admin", "api", "watch", "contact", "subscribe", "match-alerts",
  "world-cup", "partner", "_next", "offline", "icons", "alerts",
]);

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await getSupabaseAdmin()
    .from("partners").select("id, code, name, email, active, created_at")
    .order("created_at", { ascending: true });
  return NextResponse.json({ partners: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const code = String(body.code || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = body.password ? String(body.password) : null;
    const active = body.active === undefined ? true : !!body.active;
    const isNew = !!body.create;

    if (!code) return NextResponse.json({ error: "The referral code is required" }, { status: 400 });
    if (!/^[a-z0-9-]{2,30}$/.test(code))
      return NextResponse.json({ error: "Code must be 2–30 characters: lowercase letters, numbers and hyphens only" }, { status: 400 });
    if (RESERVED.has(code))
      return NextResponse.json({ error: `"${code}" is a reserved word — please choose another code` }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    if (isNew && (!password || password.length < 4))
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().rpc("admin_upsert_partner", {
      p_code: code, p_name: name, p_email: email, p_password: password, p_active: active,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("EMAIL_TAKEN")) return NextResponse.json({ error: "That email already belongs to another partner" }, { status: 409 });
      if (msg.includes("PASSWORD_REQUIRED")) return NextResponse.json({ error: "A password is required for a new partner" }, { status: 400 });
      throw error;
    }
    return NextResponse.json({ ok: true, partner: data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
