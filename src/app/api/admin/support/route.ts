import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status") || "";
  const sb = getSupabaseAdmin();
  let q = sb
    .from("support_tickets")
    .select("id, partner_id, subject, status, assignee, created_at, updated_at, last_message_at, admin_unread")
    .order("updated_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data: tickets, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  const rows = (tickets ?? []) as Record<string, unknown>[];
  const ids = Array.from(new Set(rows.map((t) => String(t.partner_id))));
  const nameById: Record<string, { name: string; code: string }> = {};
  if (ids.length) {
    const { data: parts } = await sb.from("partners").select("id, name, code").in("id", ids);
    for (const p of parts ?? []) {
      const r = p as { id: string; name: string; code: string };
      nameById[r.id] = { name: r.name, code: r.code };
    }
  }
  const out = rows.map((t) => ({
    ...t,
    partner_name: nameById[String(t.partner_id)]?.name || "Unknown",
    partner_code: nameById[String(t.partner_id)]?.code || "",
  }));
  const openCount = out.filter((t) => t.status === "open").length;
  const unread = out.filter((t) => t.admin_unread).length;
  return NextResponse.json({ tickets: out, openCount, unread });
}
