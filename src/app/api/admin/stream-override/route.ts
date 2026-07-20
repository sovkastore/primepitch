import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

// Insert rows; if an optional column doesn't exist yet (match_data before
// migration 002, position before migration 011), drop it and retry so override
// creation never hard-fails on a not-yet-applied migration.
async function insertWithFallback(rows: Record<string, unknown>[]) {
  const d1 = await getD1();
  if (!d1) return { message: "DB unavailable" };

  for (let row of rows) {
    let attempt = { ...row };
    const OPTIONAL = ["match_data", "position", "hd"];
    
    let success = false;
    let lastError: any = null;
    
    for (let i = 0; i <= OPTIONAL.length; i++) {
      const keys = Object.keys(attempt);
      const values = Object.values(attempt);
      const query = `INSERT INTO d1_stream_overrides (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
      
      try {
        await d1.prepare(query).bind(...values).run();
        success = true;
        break;
      } catch (error: any) {
        lastError = error;
        const msg = error.message || "";
        const missing = OPTIONAL.find((col) => msg.includes(col) && col in attempt);
        if (!missing) break;
        
        // Remove the offending column and retry
        const nextAttempt = { ...attempt };
        delete nextAttempt[missing];
        attempt = nextAttempt;
      }
    }
    
    if (!success) return lastError;
  }
  
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const match_id = searchParams.get("match_id");

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    let query = "SELECT * FROM d1_stream_overrides";
    const args: any[] = [];
    
    if (match_id) {
      query += " WHERE match_id = ?";
      args.push(match_id);
    }
    
    query += " ORDER BY created_at ASC";

    const { results } = await d1.prepare(query).bind(...args).all();
    return NextResponse.json({ overrides: results || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { match_id, match_title, match_data, replace_original, streams, embed_url, source, server_label, append, position, hd } =
      await request.json();

    if (!match_id) {
      return NextResponse.json({ error: "match_id required" }, { status: 400 });
    }

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const replaceFlag = replace_original ?? false;

    // If NOT appending, disable existing overrides first
    if (!append) {
      await d1.prepare("DELETE FROM d1_stream_overrides WHERE match_id = ?").bind(match_id).run();
    }

    // Multi-stream insert. Each row's `position` (server display order) defaults
    // to its index, so the array order = the order viewers see on the watch page.
    if (Array.isArray(streams) && streams.length > 0) {
      const rows = streams.map((s: { embed_url: string; source: string; server_label: string; position?: number; hd?: boolean }, i: number) => ({
        match_id,
        match_data: typeof match_data === 'object' ? JSON.stringify(match_data) : match_data ?? null,
        embed_url: s.embed_url,
        source: s.source || "fallback",
        server_label: s.server_label || null,
        replace_original: replaceFlag,
        enabled: true,
        position: typeof s.position === "number" ? s.position : i,
        hd: typeof s.hd === "boolean" ? s.hd : true,
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
      match_data: typeof match_data === 'object' ? JSON.stringify(match_data) : match_data ?? null,
      embed_url,
      source: source || "manual",
      server_label: server_label || "Manual",
      replace_original: replaceFlag,
      enabled: true,
      hd: typeof hd === "boolean" ? hd : true,
      ...(typeof position === "number" ? { position } : {}),
    }]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: 1 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, enabled, replace_original, server_label, match_id, position } = await request.json();
    
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    if (id) {
      const update: Record<string, unknown> = {};
      if (typeof enabled === "boolean") update.enabled = enabled;
      if (typeof replace_original === "boolean") update.replace_original = replace_original;
      if (typeof server_label === "string") update.server_label = server_label;
      if (typeof position === "number") update.position = position;

      const keys = Object.keys(update);
      if (keys.length > 0) {
        const values = Object.values(update);
        const setClause = keys.map(k => `${k} = ?`).join(", ");
        await d1.prepare(`UPDATE d1_stream_overrides SET ${setClause} WHERE id = ?`).bind(...values, id).run();
      }
      return NextResponse.json({ ok: true });
    }

    if (match_id && typeof replace_original === "boolean") {
      await d1.prepare("UPDATE d1_stream_overrides SET replace_original = ? WHERE match_id = ?").bind(replace_original, match_id).run();
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

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    if (id) {
      await d1.prepare("DELETE FROM d1_stream_overrides WHERE id = ?").bind(id).run();
      return NextResponse.json({ ok: true });
    }

    if (match_id) {
      await d1.prepare("DELETE FROM d1_stream_overrides WHERE match_id = ?").bind(match_id).run();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "id or match_id required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
