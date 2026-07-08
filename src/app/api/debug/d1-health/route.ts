import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function GET() {
  const d1 = await getD1();
  
  if (!d1) {
    return NextResponse.json({ 
      status: "error", 
      message: "D1 Database binding 'DB' not found in environment."
    }, { status: 500 });
  }

  try {
    const stats = await d1.prepare(`
      SELECT 'viewers' as type, COUNT(*) as count FROM d1_active_viewers
      UNION ALL
      SELECT 'page_views' as type, COUNT(*) as count FROM d1_page_views
    `).all();

    const last_views = await d1.prepare(`
      SELECT * FROM d1_page_views ORDER BY created_at DESC LIMIT 5
    `).all();

    return NextResponse.json({
      status: "success",
      message: "D1 Database is connected and tracking.",
      stats: stats.results,
      last_5_views: last_views.results
    });
  } catch (err: any) {
    return NextResponse.json({ 
      status: "error", 
      message: "D1 Query Failed. Schema might not be initialized.",
      error: err.message
    }, { status: 500 });
  }
}
