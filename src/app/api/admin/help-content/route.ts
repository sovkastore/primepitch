import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest, adminGuard } from "@/lib/admin-auth";

const KEY = "help_content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json(null);

    const data = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    return NextResponse.json(data?.value ? JSON.parse(data.value) : null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request as any))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(KEY, JSON.stringify(body), new Date().toISOString()).run();
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
