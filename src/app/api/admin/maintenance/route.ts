import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

// Site-wide maintenance switch. Stored in site_settings under key "maintenance"
// as { on: boolean, message: string }. The middleware reads it (via the
// maintenance_state RPC) and turns non-admin visitors away when on.
export const dynamic = "force-dynamic";

const KEY = "maintenance";
const DEFAULTS = { on: false, message: "", disable_tracking: false, timeouts_enabled: true };

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    const value = { ...DEFAULTS, ...((data?.value as object) ?? {}) };
    return NextResponse.json(value);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  // This can take the entire public site offline, so only a signed-in admin may flip it.
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { on?: unknown; message?: unknown; disable_tracking?: unknown; timeouts_enabled?: unknown };
    const value = {
      on: body.on === true,
      message: typeof body.message === "string" ? body.message.trim().slice(0, 300) : "",
      disable_tracking: body.disable_tracking === true,
      timeouts_enabled: body.timeouts_enabled !== false,
    };
    const { error } = await getSupabaseAdmin()
      .from("site_settings")
      .upsert(
        { key: KEY, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true, value });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
