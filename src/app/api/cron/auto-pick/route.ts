import { NextResponse } from "next/server";
import { runAutoPick } from "@/lib/auto-pick";

// Daily big-game picker, fired by the Cloudflare cron trigger each morning.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || "secret"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runAutoPick(false);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
