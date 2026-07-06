import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin API for manual sports live streams management.
// Backed by the 'sports_live_streams' table in Supabase.
// Schema: id (uuid), title (text), category (text), starts_at (timestamp), status (text), streams (jsonb[])
// streams format: { label: string, url: string, type: 'hls' | 'embed' }

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("sports_live_streams")
      .select("*")
      .order("starts_at", { ascending: true });

    if (error) {
      // Re-try with created_at if starts_at fails (compatibility)
      const fallback = await supabase
        .from("sports_live_streams")
        .select("*")
        .order("created_at", { ascending: false });
      return NextResponse.json({ matches: fallback.data ?? [] });
    }

    return NextResponse.json({ matches: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ matches: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
