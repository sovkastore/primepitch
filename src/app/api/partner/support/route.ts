import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { requirePartnerSession, PARTNER_COOKIE } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sess = await requirePartnerSession(request.cookies.get(PARTNER_COOKIE)?.value);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  try {
    const { results } = await d1.prepare(
      "SELECT id, subject, status, created_at, updated_at FROM d1_support_tickets WHERE requester_type = 'partner' AND requester_id = ? ORDER BY updated_at DESC"
    ).bind(sess.pid).all();
    
    // Simulate partner_unread if status is answered
    const tickets = (results ?? []).map((t: any) => ({
      ...t,
      last_message_at: t.updated_at,
      partner_unread: t.status === "answered"
    }));
    
    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json({ error: "Could not load your tickets." }, { status: 500 });
  }
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
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const now = new Date().toISOString();
  const tid = crypto.randomUUID();

  try {
    await d1.prepare(
      "INSERT INTO d1_support_tickets (id, requester_type, requester_id, requester_name, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(tid, "partner", sess.pid, sess.name, subject, message, "open", now, now).run();
    
    return NextResponse.json({ ok: true, id: tid });
  } catch {
    return NextResponse.json({ error: "Could not create the ticket." }, { status: 500 });
  }
}
