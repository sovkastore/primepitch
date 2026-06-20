import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id, subject, status, created_at, partner_id")
    .eq("id", id)
    .single();
  if (!ticket || (ticket as { partner_id: string }).partner_id !== sess.pid)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: messages } = await sb
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  await sb.from("support_tickets").update({ partner_unread: false }).eq("id", id);
  const t = ticket as { id: string; subject: string; status: string; created_at: string };
  return NextResponse.json({ ticket: { id: t.id, subject: t.subject, status: t.status, created_at: t.created_at }, messages: messages ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { message?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const message = (body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: ticket } = await sb.from("support_tickets").select("partner_id, status").eq("id", id).single();
  if (!ticket || (ticket as { partner_id: string }).partner_id !== sess.pid)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((ticket as { status: string }).status === "closed")
    return NextResponse.json({ error: "This ticket is closed. Please open a new one." }, { status: 400 });
  const now = new Date().toISOString();
  await sb.from("support_messages").insert({ ticket_id: id, sender: "partner", body: message });
  await sb.from("support_tickets").update({ status: "open", admin_unread: true, last_message_at: now, updated_at: now }).eq("id", id);
  return NextResponse.json({ ok: true });
}
