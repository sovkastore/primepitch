import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Admin API for manual sports live streams management.
// Backed by the 'sports_live_streams' table in Supabase.
// Schema: id (uuid), title (text), category (text), starts_at (timestamp), status (text), streams (jsonb[])
// streams format: { label: string, url: string, type: 'hls' | 'embed' }

const TTL = 60_000;
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await Promise.race([
      supabase
        .from("sports_live_streams")
        .select("*")
        .order("starts_at", { ascending: true }),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
    ]);

    if (error) {
      // Re-try with created_at if starts_at fails (compatibility)
      const fallback = await Promise.race([
        supabase
          .from("sports_live_streams")
          .select("*")
          .order("created_at", { ascending: false }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000)),
      ]);
      
      const result = { matches: fallback.data ?? [] };
      cache = { data: result, ts: now };
      return NextResponse.json(result);
    }

    const result = { matches: data ?? [] };
    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    // DB down or timeout — serve stale cache so the page doesn't break
    return NextResponse.json(cache?.data ?? { matches: [] });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const { id, ...payload } = body;

    let result;
    if (id) {
      result = await supabase.from("sports_live_streams").update(payload).eq("id", id);
    } else {
      result = await supabase.from("sports_live_streams").insert([payload]);
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const { error } = await supabase.from("sports_live_streams").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
