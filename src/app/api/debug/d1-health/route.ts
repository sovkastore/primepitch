import { NextResponse } from "next/server";

export async function GET() {
  const env = (process as any).env;
  const d1 = env.DB as D1Database | undefined;
  
  if (!d1) {
    return NextResponse.json({ 
      status: "error", 
      message: "D1 Database binding 'DB' not found in environment.",
      env_keys: Object.keys(env).filter(k => !k.includes("KEY") && !k.includes("SECRET"))
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
