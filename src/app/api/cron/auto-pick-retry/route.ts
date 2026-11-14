import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { runAutoPick, getAutoPickRunStatus } from "@/lib/auto-pick";

// Hourly safety net for the daily picker (cron "5 * * * *"). Does nothing when
// today's run already succeeded with the AI. Otherwise — the midnight run
// failed, never ran, or only the keyword fallback picked — it runs the picker
// again. Re-runs never duplicate picks or bring back ones an admin turned off.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET || "secret"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500 });
  const today = new Date().toISOString().split("T")[0];
  const last = await getAutoPickRunStatus(d1);
  if (last && last.date === today && last.ok && last.method === "ai") {
    return NextResponse.json({ ok: true, skipped: "today's AI run already succeeded" });
  }
  const summary = await runAutoPick(false);
  return NextResponse.json({ retried: true, ...summary }, { status: summary.ok ? 200 : 502 });
}
