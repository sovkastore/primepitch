import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "social_links";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

const DEFAULTS: SocialLink[] = [
  { id: "telegram", label: "Telegram", enabled: true, url: "https://t.me/primepitchlive" },
  { id: "x", label: "X", enabled: false, url: "" },
  { id: "whatsapp", label: "WhatsApp", enabled: false, url: "" },
];

const ALLOWED = new Set(DEFAULTS.map((d) => d.id));

// Admin: read every social link (including disabled) for editing.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    const links = (data?.value as SocialLink[] | undefined) ?? DEFAULTS;
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ links: DEFAULTS });
  }
}

// Admin: save the full set of links (toggle + URL per channel).
export async function POST(request: NextRequest) {
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

    const { error } = await getSupabaseAdmin()
      .from("site_settings")
      .upsert({ key: KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, links: clean });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
