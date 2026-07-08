import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { partnerMatches } from "@/lib/matches-engine";
import { getPartnerOverviewD1, getPartnerPulseD1, getPartnerAnalyticsD1, getPartnerVisitorsD1 } from "@/lib/partner-engine";
import { partnerBalances, scopeToOwn } from "@/lib/partner-scope";

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
      const env = (process as any).env;
      const d1 = env.DB as D1Database | undefined;
      if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
      const d1Overview = await getPartnerOverviewD1(d1, code);
      const { fullStats } = await partnerBalances(code);
      const scoped = fullStats ? d1Overview : scopeToOwn(d1Overview);
      return NextResponse.json(scoped);
    }
    if (stat === "pulse") {
      const env = (process as any).env;
      const d1 = env.DB as D1Database | undefined;
      if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
      const d1Pulse = await getPartnerPulseD1(d1, code);
      const { fullStats } = await partnerBalances(code);
      const scoped = fullStats ? d1Pulse : scopeToOwn(d1Pulse);
      return NextResponse.json({ full_stats: fullStats, ...scoped });
    }
    if (stat === "matches") {
      const day = searchParams.get("day");
      const matches = await partnerMatches(code, day);
      return NextResponse.json({ matches });
    }
    if (stat === "analytics") {
      const env = (process as any).env;
      const d1 = env.DB as D1Database | undefined;
      if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
      const now = new Date();
      const start = searchParams.get("start") ||
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const end = searchParams.get("end") || now.toISOString();
      const d1Analytics = await getPartnerAnalyticsD1(d1, code, start, end);
      const { fullStats } = await partnerBalances(code);
      const scoped = fullStats ? d1Analytics : scopeToOwn(d1Analytics);
      return NextResponse.json({ start, end, ...scoped });
    }
    if (stat === "visitors") {
      const env = (process as any).env;
      const d1 = env.DB as D1Database | undefined;
      if (!d1) return NextResponse.json({ error: "D1_BINDING_MISSING" }, { status: 500 });
      const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const d1Visitors = await getPartnerVisitorsD1(d1, code, date);
      const { fullStats } = await partnerBalances(code);
      const scoped = fullStats ? d1Visitors : scopeToOwn(d1Visitors);
      return NextResponse.json({ date, ...scoped });
    }
    return NextResponse.json({ error: "unknown stat" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
