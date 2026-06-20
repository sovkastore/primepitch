import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at, last_message_at, partner_unread")
    .eq("partner_id", sess.pid)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load your tickets." }, { status: 500 });
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { subject?: string; message?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject || !message) return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
  if (subject.length > 200) return NextResponse.json({ error: "That subject is too long." }, { status: 400 });
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: ticket, error } = await sb
    .from("support_tickets")
    .insert({ partner_id: sess.pid, subject, status: "open", last_message_at: now, admin_unread: true, partner_unread: false })
    .select("id")
    .single();
  if (error || !ticket) return NextResponse.json({ error: "Could not create the ticket." }, { status: 500 });
  const tid = (ticket as { id: string }).id;
  await sb.from("support_messages").insert({ ticket_id: tid, sender: "partner", body: message });
  return NextResponse.json({ ok: true, id: tid });
}
