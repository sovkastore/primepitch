import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status") || "";
  
  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let q = "SELECT id, partner_id, subject, status, assignee, created_at, updated_at, last_message_at, admin_unread FROM d1_support_tickets";
  const args: any[] = [];
  
  if (status && status !== "all") {
    q += " WHERE status = ?";
    args.push(status);
  }
  
  q += " ORDER BY updated_at DESC";

  const { results: tickets } = await d1.prepare(q).bind(...args).all();
  
  if (!tickets) return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  
  type Row = { id: string; partner_id: string; subject: string; status: string; assignee: string | null; created_at: string; updated_at: string; last_message_at: string; admin_unread: boolean | number };
  const rows = (tickets ?? []) as Row[];
  
  const ids = Array.from(new Set(rows.map((t) => t.partner_id)));
  const nameById: Record<string, { name: string; code: string }> = {};
  
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results: parts } = await d1.prepare(`SELECT id, name, code FROM d1_partners WHERE id IN (${placeholders})`).bind(...ids).all();
    for (const p of parts ?? []) {
      const r = p as { id: string; name: string; code: string };
      nameById[r.id] = { name: r.name, code: r.code };
    }
  }
  
  const out = rows.map((t) => ({
    ...t,
    admin_unread: !!t.admin_unread,
    partner_name: nameById[String(t.partner_id)]?.name || "Unknown",
    partner_code: nameById[String(t.partner_id)]?.code || "",
  }));
  
  const openCount = out.filter((t) => t.status === "open").length;
  const unread = out.filter((t) => t.admin_unread).length;
  
  return NextResponse.json({ tickets: out, openCount, unread });
}
