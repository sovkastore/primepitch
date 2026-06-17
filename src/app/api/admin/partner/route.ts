import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { partnerMatches } from "@/lib/matches-engine";

export const dynamic = "force-dynamic";

// Read-only partner breakdowns for the main admin's p/ pages.
// Same data the partner sees, but admin can pick any partner via ?code=.
export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const stat = searchParams.get("stat") || "overview";
    const code = searchParams.get("code") || "";

    if (stat === "list") {
      const { data } = await sb.from("partners")
        .select("code, name, active").order("created_at", { ascending: true });
      return NextResponse.json({ partners: data ?? [] });
    }
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    if (stat === "overview") {
      const { data, error } = await sb.rpc("partner_overview", { p_ref: code });
      if (error) throw error;
      return NextResponse.json(data);
    }
    if (stat === "pulse") {
      const { data, error } = await sb.rpc("partner_pulse", { p_ref: code });
      if (error) throw error;
      return NextResponse.json(data);
    }
    if (stat === "matches") {
      const day = searchParams.get("day");
      const matches = await partnerMatches(code, day);
      return NextResponse.json({ matches });
    }
    if (stat === "analytics") {
      const now = new Date();
      const start = searchParams.get("start") ||
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const end = searchParams.get("end") || now.toISOString();
      const { data, error } = await sb.rpc("partner_analytics", { p_ref: code, p_start: start, p_end: end });
      if (error) throw error;
      return NextResponse.json({ start, end, ...data });
    }
    if (stat === "visitors") {
      const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const { data, error } = await sb.rpc("partner_visitors", { p_ref: code, p_date: date });
      if (error) throw error;
      return NextResponse.json({ date, ...data });
    }
    return NextResponse.json({ error: "unknown stat" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
