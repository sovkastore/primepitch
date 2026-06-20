import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "answered", "resolved", "closed"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id, partner_id, subject, status, assignee, created_at")
    .eq("id", id)
    .single();
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = ticket as { id: string; partner_id: string; subject: string; status: string; assignee: string | null; created_at: string };
  const { data: partner } = await sb.from("partners").select("name, code, email").eq("id", t.partner_id).single();
  const { data: messages } = await sb
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  await sb.from("support_tickets").update({ admin_unread: false }).eq("id", id);
  const p = (partner ?? {}) as { name?: string; code?: string; email?: string };
  return NextResponse.json({
    ticket: { id: t.id, subject: t.subject, status: t.status, assignee: t.assignee, created_at: t.created_at,
      partner_name: p.name || "Unknown", partner_code: p.code || "", partner_email: p.email || "" },
    messages: messages ?? [],
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { action?: string; message?: string; status?: string; assignee?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  const action = body.action || "reply";

  if (action === "reply") {
    const message = (body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    await sb.from("support_messages").insert({ ticket_id: id, sender: "admin", body: message });
    await sb.from("support_tickets").update({ status: "answered", partner_unread: true, admin_unread: false, last_message_at: now, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (action === "status") {
    const status = String(body.status || "");
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    await sb.from("support_tickets").update({ status, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (action === "assign") {
    const assignee = (body.assignee || "").trim();
    await sb.from("support_tickets").update({ assignee: assignee || null, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
