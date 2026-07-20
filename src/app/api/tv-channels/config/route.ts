import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

const TTL = 60_000;
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const d1 = await getD1();
    if (!d1) throw new Error("DB unavailable");
    
    const row = await d1.prepare("SELECT * FROM d1_tv_page_config WHERE id = 'global'").first<any>();
    const data = row ? {
      ...row,
      banner_json: typeof row.banner_json === 'string' ? JSON.parse(row.banner_json) : row.banner_json,
      notification_json: typeof row.notification_json === 'string' ? JSON.parse(row.notification_json) : row.notification_json
    } : null;
    
    const result = data || { 
      page_title: "Live TV Channels",
      meta_description: "Watch live sports channels and entertainment streams",
      banner_json: {},
      notification_json: {}
    };
    
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request as any))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    
    const body = await request.json();
    const bannerJson = body.banner_json ? JSON.stringify(body.banner_json) : null;
    const notificationJson = body.notification_json ? JSON.stringify(body.notification_json) : null;
    
    await d1.prepare(`
      INSERT OR REPLACE INTO d1_tv_page_config (id, page_title, meta_description, banner_json, notification_json, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind("global", body.page_title, body.meta_description, bannerJson, notificationJson, new Date().toISOString()).run();

    // Invalidate cache
    cache = null;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
