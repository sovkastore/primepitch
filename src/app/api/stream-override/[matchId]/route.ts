import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;

    const { data } = await getSupabaseAdmin()
      .from("stream_overrides")
      .select("embed_url, source, server_label, replace_original")
      .eq("match_id", matchId)
      .eq("enabled", true)
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
      return NextResponse.json({ overrides: [], replace_original: false });
    }

    return NextResponse.json({
      overrides: data,
      replace_original: data[0].replace_original ?? false,
    });
  } catch {
    return NextResponse.json({ overrides: [], replace_original: false });
  }
}
