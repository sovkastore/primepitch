import { NextResponse, NextRequest } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "player-text") {
      const row = await d1.prepare(`
        SELECT value FROM d1_site_settings WHERE key = 'cricket_player_text'
      `).first<{ value: string }>();

      let value = null;
      if (row?.value) {
        try {
          value = JSON.parse(row.value);
        } catch {
          value = row.value;
        }
      }
      return NextResponse.json({ value });
    }

    const adminMode = searchParams.get("admin") === "true";
    let query = `
      SELECT id, title, competition, starts_at, time, status, channel_ids, created_at
      FROM d1_cricket_streams
    `;
    
    if (!adminMode) {
      query += " WHERE status != 'hidden'";
    }

    query += " ORDER BY starts_at ASC";

    const { results } = await d1.prepare(query).all();

    const matches = (results || []).map((m: any) => {
      let channels = [];
      if (m.channel_ids) {
        try {
          channels = JSON.parse(m.channel_ids);
        } catch {
          channels = m.channel_ids;
        }
      }
      return {
        ...m,
        channel_ids: Array.isArray(channels) ? channels : []
      };
    });

    return NextResponse.json(matches);
  } catch (err: any) {
    console.error("GET cricket error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    // All modifications require admin session
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const body = await request.json();

    if (type === "player-text") {
      const valStr = typeof body === "object" ? JSON.stringify(body) : String(body);
      await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES ('cricket_player_text', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind(valStr, new Date().toISOString()).run();

      return NextResponse.json({ success: true });
    }

    const { id, ...payload } = body;

    if (id) {
      // Update
      const fields: string[] = [];
      const bindings: any[] = [];

      if (payload.title !== undefined) { fields.push("title = ?"); bindings.push(payload.title); }
      if (payload.competition !== undefined) { fields.push("competition = ?"); bindings.push(payload.competition); }
      if (payload.starts_at !== undefined) { fields.push("starts_at = ?"); bindings.push(payload.starts_at); }
      if (payload.time !== undefined) { fields.push("time = ?"); bindings.push(payload.time); }
      if (payload.status !== undefined) { fields.push("status = ?"); bindings.push(payload.status); }
      if (payload.channel_ids !== undefined) {
        fields.push("channel_ids = ?");
        bindings.push(typeof payload.channel_ids === "object" ? JSON.stringify(payload.channel_ids) : payload.channel_ids);
      }

      if (fields.length > 0) {
        bindings.push(String(id));
        await d1.prepare(`
          UPDATE d1_cricket_streams
          SET ${fields.join(", ")}
          WHERE id = ?
        `).bind(...bindings).run();
      }
    } else {
      // Insert
      const newId = crypto.randomUUID();
      const channelIds = typeof payload.channel_ids === "object" ? JSON.stringify(payload.channel_ids) : payload.channel_ids || null;
      await d1.prepare(`
        INSERT INTO d1_cricket_streams (id, title, competition, starts_at, time, status, channel_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newId, payload.title || "", payload.competition || null,
        payload.starts_at || null, payload.time || null,
        payload.status || "live", channelIds
      ).run();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST cricket error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await d1.prepare(`DELETE FROM d1_cricket_streams WHERE id = ?`).bind(String(id)).run();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE cricket error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
