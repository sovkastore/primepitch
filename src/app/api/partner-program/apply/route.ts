import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(request: NextRequest) {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const setting = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = 'partner_public_page'").first() as any;
    const open = setting?.value === true || setting?.value === "true" || setting?.value === '{"true"}';
    if (!open) return NextResponse.json({ error: "Applications are closed right now." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    if (clip(body.website, 1)) return NextResponse.json({ ok: true });

    const name = clip(body.name, 80);
    const email = clip(body.email, 120).toLowerCase();
    const country = clip(body.country, 60);
    const platform = clip(body.platform, 40);
    const audience_size = clip(body.audience_size, 60);
    const contact_handle = clip(body.contact_handle, 80);

    if (!name || !email || !contact_handle)
      return NextResponse.json({ error: "Name, email and a contact handle are required." }, { status: 400 });
    if (!email.includes("@") || email.length < 5)
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });

    const dupeApp = await d1.prepare("SELECT id FROM d1_partner_applications WHERE email = ? AND status IN ('pending', 'approved')").bind(email).first();
    if (dupeApp) return NextResponse.json({ ok: true, already: true });

    const existingPartner = await d1.prepare("SELECT id FROM d1_partners WHERE email = ?").bind(email).first();
    if (existingPartner) return NextResponse.json({ ok: true, already: true });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await d1.prepare(
      "INSERT INTO d1_partner_applications (id, name, email, country, platform, audience_size, contact_handle, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
    ).bind(id, name, email, country, platform, audience_size, contact_handle, now).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
