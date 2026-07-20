import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

// Admin editor for league_config (drives the public football sub-nav + per
// competition behaviour). Re-routed to Cloudflare D1 database.
export const dynamic = "force-dynamic";

const TABS = ["auto", "results", "fixtures", "table"];

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");
    
    const { results } = await d1.prepare(`
      SELECT league_id, label, enabled, display_order, has_table, default_tab
      FROM d1_league_config
      ORDER BY display_order ASC
    `).all();

    const leagues = (results || []).map((l: any) => ({
      ...l,
      enabled: l.enabled === 1,
      has_table: l.has_table === 1,
    }));

    return NextResponse.json({ leagues });
  } catch (err: any) {
    console.error("GET admin leagues error:", err);
    return NextResponse.json({ leagues: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const d1 = await getD1();
    if (!d1) throw new Error("D1 database binding missing");

    const b = (await request.json()) as Record<string, any>;
    const leagueId = Number(b?.league_id);
    if (!Number.isFinite(leagueId)) {
      return NextResponse.json({ ok: false, error: "bad league_id" }, { status: 400 });
    }

    const fields: string[] = [];
    const bindings: any[] = [];

    if (typeof b.label === "string" && b.label.trim()) {
      fields.push("label = ?");
      bindings.push(b.label.trim().slice(0, 80));
    }
    if (typeof b.enabled === "boolean") {
      fields.push("enabled = ?");
      bindings.push(b.enabled ? 1 : 0);
    }
    if (typeof b.has_table === "boolean") {
      fields.push("has_table = ?");
      bindings.push(b.has_table ? 1 : 0);
    }
    if (b.display_order !== undefined && Number.isFinite(Number(b.display_order))) {
      fields.push("display_order = ?");
      bindings.push(Number(b.display_order));
    }
    if (typeof b.default_tab === "string" && TABS.includes(b.default_tab)) {
      fields.push("default_tab = ?");
      bindings.push(b.default_tab);
    }

    if (fields.length === 0) {
      return NextResponse.json({ ok: true, note: "no fields updated" });
    }

    fields.push("updated_at = ?");
    bindings.push(new Date().toISOString());
    bindings.push(leagueId);

    const query = `
      UPDATE d1_league_config
      SET ${fields.join(", ")}
      WHERE league_id = ?
    `;

    await d1.prepare(query).bind(...bindings).run();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST admin leagues error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
