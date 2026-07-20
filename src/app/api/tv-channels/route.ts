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
    
    const { results } = await d1.prepare("SELECT * FROM d1_tv_channels ORDER BY position ASC").all();
    
    const result = { channels: results ?? [] };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ channels: [], error: err.message }, { status: 500 });
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
    const { id, ...payload } = body;
    const pos = payload.position ?? payload.display_order ?? 0;
    const enabled = payload.enabled ? 1 : 0;

    if (id) {
       await d1.prepare("UPDATE d1_tv_channels SET name=?, logo=?, embed_url=?, enabled=?, position=? WHERE id=?")
         .bind(payload.name, payload.logo, payload.embed_url, enabled, pos, id).run();
    } else {
       const newId = crypto.randomUUID();
       await d1.prepare("INSERT INTO d1_tv_channels (id, name, logo, embed_url, enabled, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
         .bind(newId, payload.name, payload.logo, payload.embed_url, enabled, pos, new Date().toISOString()).run();
    }

    // Invalidate cache
    cache = null;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminRequest(request as any))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await d1.prepare("DELETE FROM d1_tv_channels WHERE id = ?").bind(id).run();

    // Invalidate cache
    cache = null;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
