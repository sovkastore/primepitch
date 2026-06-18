import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

// Admin editor for league_config (drives the public football sub-nav + per
// competition behaviour). RLS is public-read only, so writes go through the
// service-role client here, gated by the admin session.
export const dynamic = "force-dynamic";

const TABS = ["auto", "results", "fixtures", "table"];

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { data } = await getSupabaseAdmin()
      .from("league_config")
      .select("league_id,label,enabled,display_order,has_table,default_tab")
      .order("display_order", { ascending: true });
    return NextResponse.json({ leagues: data ?? [] });
  } catch {
    return NextResponse.json({ leagues: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const b = (await request.json()) as Record<string, unknown>;
    const leagueId = Number(b?.league_id);
    if (!Number.isFinite(leagueId)) {
      return NextResponse.json({ ok: false, error: "bad league_id" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.label === "string" && b.label.trim()) patch.label = b.label.trim().slice(0, 80);
    if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
    if (typeof b.has_table === "boolean") patch.has_table = b.has_table;
    if (b.display_order !== undefined && Number.isFinite(Number(b.display_order))) {
      patch.display_order = Number(b.display_order);
    }
    if (typeof b.default_tab === "string" && TABS.includes(b.default_tab)) {
      patch.default_tab = b.default_tab;
    }
    const { error } = await getSupabaseAdmin()
      .from("league_config")
      .update(patch)
      .eq("league_id", leagueId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
