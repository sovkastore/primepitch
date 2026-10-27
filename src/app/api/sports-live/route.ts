import { adminGuard } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Admin API for manual sports live streams management.
// Backed by the 'd1_sports_live_streams' table in D1.
// Schema: id (uuid), title (text), category (text), starts_at (timestamp), status (text), streams (jsonb string)
// streams format: { label: string, url: string, type: 'hls' | 'embed' }

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

    const fetchStreams = (async () => {
      try {
        const { results } = await d1.prepare("SELECT * FROM d1_sports_live_streams ORDER BY starts_at ASC").all();
        return results;
      } catch {
        const { results } = await d1.prepare("SELECT * FROM d1_sports_live_streams ORDER BY created_at DESC").all();
        return results;
      }
    })();

    const data = await Promise.race([
      fetchStreams,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);

    const parsedData = (data ?? []).map((row: any) => ({
      ...row,
      streams: typeof row.streams === 'string' ? JSON.parse(row.streams) : row.streams
    }));

    const result = { matches: parsedData };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    // DB down or timeout — serve stale cache so the page doesn't break
    return NextResponse.json(cache?.data ?? { matches: [] });
  }
}

export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB down" }, { status: 500 });

    const body = await request.json();
    const { id, ...payload } = body;
    const streamsStr = payload.streams ? JSON.stringify(payload.streams) : '[]';

    if (id) {
      await d1.prepare("UPDATE d1_sports_live_streams SET title = ?, category = ?, starts_at = ?, status = ?, streams = ? WHERE id = ?")
        .bind(payload.title || '', payload.category || '', payload.starts_at || null, payload.status || '', streamsStr, id).run();
    } else {
      const newId = crypto.randomUUID();
      await d1.prepare("INSERT INTO d1_sports_live_streams (id, title, category, starts_at, status, streams) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId, payload.title || '', payload.category || '', payload.starts_at || null, payload.status || '', streamsStr).run();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB down" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await d1.prepare("DELETE FROM d1_sports_live_streams WHERE id = ?").bind(id).run();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
