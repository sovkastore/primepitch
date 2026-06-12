import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Insert rows; if the optional match_data column doesn't exist yet, retry without it
// so override creation never breaks before the schema migration is applied.
async function insertWithFallback(rows: Record<string, unknown>[]) {
  const sb = getSupabaseAdmin();
  let { error } = await sb.from("stream_overrides").insert(rows);
  if (error && /match_data/.test(error.message || "")) {
    const stripped = rows.map((r) => {
      const c = { ...r };
      delete c.match_data;
      return c;
    });
    ({ error } = await sb.from("stream_overrides").insert(stripped));
  }
  return error;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const match_id = searchParams.get("match_id");

    let query = getSupabaseAdmin().from("stream_overrides").select("*");
    if (match_id) query = query.eq("match_id", match_id);

    const { data } = await query.order("created_at", { ascending: true });
    return NextResponse.json({ overrides: data || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { match_id, match_title, match_data, replace_original, streams, embed_url, source, server_label, append } =
      await request.json();

    if (!match_id) {
      return NextResponse.json({ error: "match_id required" }, { status: 400 });
    }

    const replaceFlag = replace_original ?? false;

    // If NOT appending, disable existing overrides first
    if (!append) {
      await getSupabaseAdmin()
        .from("stream_overrides")
        .delete()
        .eq("match_id", match_id);
    }

    // Multi-stream insert
    if (Array.isArray(streams) && streams.length > 0) {
      const rows = streams.map((s: { embed_url: string; source: string; server_label: string }) => ({
        match_id,
        match_title: match_title || null,
        match_data: match_data ?? null,
        embed_url: s.embed_url,
        source: s.source || "fallback",
        server_label: s.server_label || null,
        replace_original: replaceFlag,
        enabled: true,
      }));

      const error = await insertWithFallback(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, count: rows.length });
    }

    // Single stream insert
    if (!embed_url) {
      return NextResponse.json({ error: "embed_url or streams required" }, { status: 400 });
    }

    const error = await insertWithFallback([{
      match_id,
      match_title: match_title || null,
      match_data: match_data ?? null,
      embed_url,
      source: source || "manual",
      server_label: server_label || "Manual",
      replace_original: replaceFlag,
      enabled: true,
    }]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: 1 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, enabled, replace_original, server_label, match_id } = await request.json();

    if (id) {
      const update: Record<string, unknown> = {};
      if (typeof enabled === "boolean") update.enabled = enabled;
      if (typeof replace_original === "boolean") update.replace_original = replace_original;
      if (typeof server_label === "string") update.server_label = server_label;

      await getSupabaseAdmin().from("stream_overrides").update(update).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (match_id && typeof replace_original === "boolean") {
      await getSupabaseAdmin()
        .from("stream_overrides")
        .update({ replace_original })
        .eq("match_id", match_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "id or match_id required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const match_id = searchParams.get("match_id");
    const id = searchParams.get("id");

    if (id) {
      await getSupabaseAdmin().from("stream_overrides").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (match_id) {
      await getSupabaseAdmin().from("stream_overrides").delete().eq("match_id", match_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "id or match_id required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
