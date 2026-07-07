import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

const TTL = 60_000;
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const { data } = await getSupabaseAdmin()
      .from("tv_channels")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    
    const result = { channels: data ?? [] };
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
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { id, ...payload } = body;

    let result;
    if (id) {
      result = await supabase.from("tv_channels").update(payload).eq("id", id);
    } else {
      result = await supabase.from("tv_channels").insert([payload]);
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
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
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const { error } = await supabase.from("tv_channels").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Invalidate cache
    cache = null;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
