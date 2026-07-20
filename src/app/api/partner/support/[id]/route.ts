import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const ticket = await d1.prepare(
    "SELECT id, subject, status, created_at, requester_id, message, admin_reply, admin_reply_at FROM d1_support_tickets WHERE id = ?"
  ).bind(id).first() as any;

  if (!ticket || String(ticket.requester_id) !== String(sess.pid))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = [
    { id: ticket.id + "_msg", sender: "partner", body: ticket.message, created_at: ticket.created_at }
  ];
  if (ticket.admin_reply) {
    messages.push({
      id: ticket.id + "_reply",
      sender: "admin",
      body: ticket.admin_reply,
      created_at: ticket.admin_reply_at || ticket.created_at
    });
  }
  
  // Acknowledge if answered (simulate reading)
  if (ticket.status === "answered") {
      await d1.prepare("UPDATE d1_support_tickets SET status = 'read' WHERE id = ?").bind(id).run();
  }

  return NextResponse.json({ 
    ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status === "answered" ? "read" : ticket.status, created_at: ticket.created_at }, 
    messages 
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { message?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const message = (body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const ticket = await d1.prepare(
    "SELECT requester_id, status, message FROM d1_support_tickets WHERE id = ?"
  ).bind(id).first() as any;

  if (!ticket || String(ticket.requester_id) !== String(sess.pid))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ticket.status === "closed")
    return NextResponse.json({ error: "This ticket is closed. Please open a new one." }, { status: 400 });
    
  const now = new Date().toISOString();
  
  const newMessage = ticket.message + "\n\n--- Follow up ---\n" + message;

  await d1.prepare(
    "UPDATE d1_support_tickets SET message = ?, status = 'open', updated_at = ? WHERE id = ?"
  ).bind(newMessage, now, id).run();

  return NextResponse.json({ ok: true });
}
