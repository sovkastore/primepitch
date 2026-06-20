import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();

    // Only accept applications while the public program page is switched on.
    const { data: setting } = await sb
      .from("site_settings").select("value").eq("key", "partner_public_page").maybeSingle();
    const open = setting?.value === true || setting?.value === "true";
    if (!open) return NextResponse.json({ error: "Applications are closed right now." }, { status: 403 });

    const body = await request.json().catch(() => ({}));

    // Honeypot: real users never fill this. Pretend success so bots don't retry.
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

    // De-dupe: don't pile up duplicates from the same email, and don't let an
    // existing partner re-apply. Respond OK either way (no info leak, no friction).
    const { data: dupeApp } = await sb
      .from("partner_applications").select("id").eq("email", email).in("status", ["pending", "approved"]).maybeSingle();
    if (dupeApp) return NextResponse.json({ ok: true, already: true });

    const { data: existingPartner } = await sb
      .from("partners").select("id").eq("email", email).maybeSingle();
    if (existingPartner) return NextResponse.json({ ok: true, already: true });

    const { error } = await sb.from("partner_applications").insert({
      name, email, country, platform, audience_size, contact_handle, status: "pending",
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
