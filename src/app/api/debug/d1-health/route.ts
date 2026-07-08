import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;
  const sb = getSupabaseAdmin();
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();

  let d1Status = "Unknown";
  let d1Stats: any = null;
  let sbStats: any = null;

  // 1) Test D1
  if (!d1) {
    d1Status = "Missing Binding (Check Cloudflare Settings)";
  } else {
    try {
      const stats = await d1.prepare(`
        SELECT 'viewers' as type, COUNT(*) as count FROM d1_active_viewers
        UNION ALL
        SELECT 'page_views' as type, COUNT(*) as count FROM d1_page_views
      `).all();
      d1Stats = stats.results;
      d1Status = "Operational";
    } catch (err: any) {
      d1Status = "Query Failed: " + err.message;
    }
  }

  // 2) Test Supabase (The comparison)
  try {
    const { count: sbViews } = await sb.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", todayStart);
    const { count: sbActive } = await sb.from("active_viewers").select("*", { count: "exact", head: true });
    sbStats = { views_today: sbViews, active_now: sbActive };
  } catch (err: any) {
    sbStats = "Error: " + err.message;
  }

  return NextResponse.json({
    status: d1Status === "Operational" ? "success" : "degraded",
    d1: {
      status: d1Status,
      stats: d1Stats
    },
    supabase_backup: {
      stats: sbStats
    },
    recommendation: d1Status === "Operational" 
      ? "D1 is working! You can now safely disable Supabase fallback if you want total D1 isolation."
      : "D1 is NOT receiving data. Keep Supabase enabled as a safety net."
  });
}
