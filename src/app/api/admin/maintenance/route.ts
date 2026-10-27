import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest, adminGuard } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Site-wide maintenance switch. Stored in site_settings under key "maintenance"
// as { on: boolean, message: string }. The middleware reads it (via the
// maintenance_state RPC) and turns non-admin visitors away when on.

const KEY = "maintenance";
const DEFAULTS = { on: false, message: "", disable_tracking: false, timeouts_enabled: true };

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json(DEFAULTS);

    const data = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const stored = data?.value ? JSON.parse(data.value) : DEFAULTS;
    const value = { ...DEFAULTS, ...stored };
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
    
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500 });

    await d1.prepare(`
      INSERT INTO d1_site_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(KEY, JSON.stringify(value), new Date().toISOString()).run();

    return NextResponse.json({ ok: true, value });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
