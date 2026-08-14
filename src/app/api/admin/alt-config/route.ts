import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

const CONFIG_KEY = "alt_api_config";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const row = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
      .bind(CONFIG_KEY)
      .first<{ value: string }>();

    let config = { auto_fetch: true, cache_minutes: 30, global_notice: "", live_refresh_minutes: 5 };
    if (row && row.value) {
      try {
        config = { ...config, ...JSON.parse(row.value) };
      } catch (e) {
        // ignore JSON parse error
      }
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to load alt config:", error);
    return NextResponse.json({ auto_fetch: true, cache_minutes: 30 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    // Merge with the stored config so partial saves (e.g. only the live
    // refresh interval from the robot panel) never wipe the other fields.
    let existing = { auto_fetch: true, cache_minutes: 30, global_notice: "", live_refresh_minutes: 5 };
    try {
      const row = await d1
        .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
        .bind(CONFIG_KEY)
        .first<{ value: string }>();
      if (row?.value) existing = { ...existing, ...JSON.parse(row.value) };
    } catch {
      // keep defaults
    }

    const config = {
      auto_fetch: body.auto_fetch !== undefined ? Boolean(body.auto_fetch) : existing.auto_fetch,
      cache_minutes: body.cache_minutes !== undefined ? Number(body.cache_minutes) : existing.cache_minutes,
      global_notice: body.global_notice !== undefined ? body.global_notice || "" : existing.global_notice,
      live_refresh_minutes:
        body.live_refresh_minutes !== undefined
          ? Math.max(1, Number(body.live_refresh_minutes) || 5)
          : existing.live_refresh_minutes,
    };

    await d1
      .prepare(
        "INSERT INTO d1_site_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(CONFIG_KEY, JSON.stringify(config))
      .run();

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Failed to save alt config:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
