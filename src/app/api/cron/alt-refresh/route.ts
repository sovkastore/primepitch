import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { fetchRapidPage } from "@/lib/rapid-fetch";
import { saveMatchesCache } from "@/lib/match-cache";

// Daily Big Matches refresh, fired by the Cloudflare cron at 05:00 UTC
// (06:00 Lagos). Does what the admin "fetch latest" button does — one list
// request — but replaces the saved list only when the new one is not empty,
// so a provider hiccup never leaves the page blank.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET || "secret"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  const fresh = (await fetchRapidPage("daily refresh", 1)) ?? [];
  if (fresh.length === 0) return NextResponse.json({ ok: false, kept: "previous list" }, { status: 502 });
  await saveMatchesCache(d1, fresh);
  return NextResponse.json({ ok: true, matches: fresh.length });
}
