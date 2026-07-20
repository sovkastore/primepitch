import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "answered", "resolved", "closed"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const ticket = await d1
    .prepare("SELECT id, partner_id, subject, status, assignee, created_at FROM d1_support_tickets WHERE id = ?")
    .bind(id)
    .first();
    
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  
  const t = ticket as { id: string; partner_id: string; subject: string; status: string; assignee: string | null; created_at: string };
  
  const partner = await d1.prepare("SELECT name, code, email FROM d1_partners WHERE id = ?").bind(t.partner_id).first();
  
  const { results: messages } = await d1
    .prepare("SELECT id, sender, body, created_at FROM d1_support_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .bind(id)
    .all();
    
  await d1.prepare("UPDATE d1_support_tickets SET admin_unread = false WHERE id = ?").bind(id).run();
  
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
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const now = new Date().toISOString();
  const action = body.action || "reply";

  if (action === "reply") {
    const message = (body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    
    await d1.prepare("INSERT INTO d1_support_messages (ticket_id, sender, body) VALUES (?, 'admin', ?)").bind(id, message).run();
    await d1.prepare("UPDATE d1_support_tickets SET status = 'answered', partner_unread = true, admin_unread = false, last_message_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
    return NextResponse.json({ ok: true });
  }
  
  if (action === "status") {
    const status = String(body.status || "");
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    await d1.prepare("UPDATE d1_support_tickets SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
    return NextResponse.json({ ok: true });
  }
  
  if (action === "assign") {
    const assignee = (body.assignee || "").trim();
    await d1.prepare("UPDATE d1_support_tickets SET assignee = ?, updated_at = ? WHERE id = ?").bind(assignee || null, now, id).run();
    return NextResponse.json({ ok: true });
  }
  
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
