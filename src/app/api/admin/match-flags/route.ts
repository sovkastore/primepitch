import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Admin: per-match flags (hide / force-live / featured / disable auto-fallback).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ flags: [] });

    const { results } = await d1.prepare("SELECT * FROM d1_match_flags").all();
    return NextResponse.json({ flags: results ?? [] });
  } catch {
    return NextResponse.json({ flags: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { match_id, match_data, hidden, hide_one, forced_live, featured, disable_auto, auto_fallback, display_title, force_ended, hot, custom_notice } =
      await request.json();
    if (!match_id) {
      return NextResponse.json({ error: "match_id required" }, { status: 400 });
    }

    const row: Record<string, unknown> = {
      match_id,
      updated_at: new Date().toISOString(),
    };
    if (typeof hidden === "boolean") row.hidden = hidden;
    if (typeof hide_one === "boolean") row.hide_one = hide_one;
    if (typeof forced_live === "boolean") row.forced_live = forced_live;
    if (typeof featured === "boolean") row.featured = featured;
    if (typeof disable_auto === "boolean") row.disable_auto = disable_auto;
    if (typeof auto_fallback === "boolean") row.auto_fallback = auto_fallback;
    if (match_data) row.match_data = typeof match_data === 'object' ? JSON.stringify(match_data) : match_data;
    if (typeof display_title === "string") row.display_title = display_title.trim() || null;
    if (typeof force_ended === "boolean") row.force_ended = force_ended;
    if (typeof hot === "boolean") row.hot = hot;
    if (typeof custom_notice === "string") row.custom_notice = custom_notice.trim() || null;
    else if (custom_notice === null) row.custom_notice = null;

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const keys = Object.keys(row);
    const values = Object.values(row);
    const setClause = keys.map(k => `${k} = excluded.${k}`).join(", ");
    
    const query = `
      INSERT INTO d1_match_flags (${keys.join(", ")})
      VALUES (${keys.map(() => "?").join(", ")})
      ON CONFLICT(match_id) DO UPDATE SET ${setClause};
    `;

    try {
      await d1.prepare(query).bind(...values).run();
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep analytics labels in sync so renamed matches don't fragment in the
    // admin merge (labels only — no metrics are touched).
    if (typeof display_title === "string" && display_title.trim()) {
      const t = display_title.trim();
      await d1.prepare("UPDATE d1_match_summaries SET match_title = ? WHERE match_id = ?").bind(t, match_id).run();
      await d1.prepare("UPDATE d1_match_views SET match_title = ? WHERE match_id = ?").bind(t, match_id).run();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
