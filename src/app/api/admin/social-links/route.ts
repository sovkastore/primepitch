import { adminGuard } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "social_links";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

const DEFAULTS: SocialLink[] = [
  { id: "telegram", label: "Telegram", enabled: true, url: "https://t.me/primepitchlive" },
  { id: "x", label: "X", enabled: false, url: "" },
  { id: "whatsapp", label: "WhatsApp", enabled: false, url: "" },
];

const ALLOWED = new Set(DEFAULTS.map((d) => d.id));

// Admin: read every social link (including disabled) for editing.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ links: DEFAULTS });

    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const links = row?.value ? JSON.parse(row.value) : DEFAULTS;
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ links: DEFAULTS });
  }
}

// Admin: save the full set of links (toggle + URL per channel).
export async function POST(request: NextRequest) {
  const denied = await adminGuard(request as unknown as Request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const incoming = Array.isArray(body?.links) ? (body.links as SocialLink[]) : [];
    // Sanitize: only known ids, coerce types, trim urls.
    const clean: SocialLink[] = DEFAULTS.map((d) => {
      const found = incoming.find((l) => l.id === d.id);
      return {
        id: d.id,
        label: d.label,
        enabled: !!found?.enabled,
        url: typeof found?.url === "string" ? found.url.trim() : "",
      };
    }).filter((l) => ALLOWED.has(l.id));

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    try {
      await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(KEY, JSON.stringify(clean), new Date().toISOString()).run();
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, links: clean });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
