import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ overrides: [], replace_original: false });

    const { results } = await d1.prepare(
      "SELECT embed_url, source, server_label, replace_original FROM d1_stream_overrides WHERE match_id = ? AND enabled = 1 ORDER BY created_at ASC"
    )
      .bind(matchId)
      .all();

    const data = results as any[];

    if (!data || data.length === 0) {
      return NextResponse.json({ overrides: [], replace_original: false });
    }

    return NextResponse.json({
      overrides: data,
      replace_original: Boolean(data[0].replace_original) ?? false,
    });
  } catch {
    return NextResponse.json({ overrides: [], replace_original: false });
  }
}
