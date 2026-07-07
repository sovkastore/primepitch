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
      .from("tv_page_config")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    
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
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    
    const { error } = await supabase
      .from("tv_page_config")
      .upsert({ ...body, id: "global", updated_at: new Date().toISOString() }, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Invalidate cache
    cache = null;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
