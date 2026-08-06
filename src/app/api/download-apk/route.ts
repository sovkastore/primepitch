import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

const KEY = "vpn_apk_data";
const META_KEY = "vpn_apk_meta";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const row = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
      .bind(KEY)
      .first<{ value: string }>();

    if (!row?.value) {
      return NextResponse.json({ error: "No APK uploaded" }, { status: 404 });
    }

    const metaRow = await d1
      .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
      .bind(META_KEY)
      .first<{ value: string }>();

    const meta = metaRow?.value ? JSON.parse(metaRow.value) : { name: "proton-vpn.apk" };

    // Strip the data URL prefix to get raw base64
    const base64 = row.value.replace(/^data:[^;]+;base64,/, "");

    // Decode base64 to binary
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${meta.name || "proton-vpn.apk"}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
