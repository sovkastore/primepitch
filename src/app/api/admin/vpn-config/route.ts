import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "vpn_config";

export type VpnConfig = {
  enabled: boolean;
  name: string;
  description: string;
  downloadUrl: string;
  recommendedServer: string;
  fileSize: string;
  version: string;
};

const DEFAULTS: VpnConfig = {
  enabled: false,
  name: "Proton VPN",
  description: "Watch every match with no buffering, no blocks, and no ads slowing you down. Takes 2 minutes to set up.",
  downloadUrl: "",
  recommendedServer: "Singapore",
  fileSize: "52 MB",
  version: "Latest",
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json(DEFAULTS);
    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const cfg = row?.value ? { ...DEFAULTS, ...JSON.parse(row.value) } : DEFAULTS;
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<VpnConfig>;
    const clean: VpnConfig = {
      enabled: !!body.enabled,
      name: typeof body.name === "string" ? body.name.trim() : DEFAULTS.name,
      description: typeof body.description === "string" ? body.description.trim() : DEFAULTS.description,
      downloadUrl: typeof body.downloadUrl === "string" ? body.downloadUrl.trim() : "",
      recommendedServer: typeof body.recommendedServer === "string" ? body.recommendedServer.trim() : DEFAULTS.recommendedServer,
      fileSize: typeof body.fileSize === "string" ? body.fileSize.trim() : DEFAULTS.fileSize,
      version: typeof body.version === "string" ? body.version.trim() : DEFAULTS.version,
    };

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    await d1.prepare(`
      INSERT INTO d1_site_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(KEY, JSON.stringify(clean), new Date().toISOString()).run();

    return NextResponse.json({ ok: true, config: clean });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
