import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

const KEY = "vpn_config";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const row = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
      .bind(KEY)
      .first<{ value: string }>();

    if (!row?.value) {
      return NextResponse.json({ error: "VPN download not configured" }, { status: 404 });
    }

    const cfg = JSON.parse(row.value);
    if (!cfg?.downloadUrl) {
      return NextResponse.json({ error: "Download URL not configured" }, { status: 404 });
    }

    return NextResponse.redirect(new URL(cfg.downloadUrl, "https://primepitchsports.cc"), 302);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
