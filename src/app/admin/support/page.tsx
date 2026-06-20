"use client";

import { useCallback, useEffect, useState } from "react";

type Ticket = { id: string; partner_id: string; partner_name: string; partner_code: string; subject: string; status: string; assignee: string | null; created_at: string; updated_at: string; last_message_at: string; admin_unread: boolean };
type Message = { id: string; sender: string; body: string; created_at: string };
type ThreadTicket = { id: string; subject: string; status: string; assignee: string | null; created_at: string; partner_name: string; partner_code: string; partner_email: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700" },
  answered: { label: "Replied", cls: "bg-[#3cac3b]/10 text-[#3cac3b]" },
  resolved: { label: "Resolved", cls: "bg-gray-100 text-gray-500" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};
const statusMeta = (s?: string) => STATUS[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-500" };
const FILTERS = ["all", "open", "answered", "resolved", "closed"];

function fmt(d: string) {
  try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return d; }
}

const field = "w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#3cac3b]";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [openCount, setOpenCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: ThreadTicket; messages: Message[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/support?status=${encodeURIComponent(f)}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) { setTickets(j.tickets ?? []); setOpenCount(j.openCount ?? 0); setUnread(j.unread ?? 0); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const openTicket = useCallback(async (id: string) => {
    setOpenId(id); setThread(null); setThreadLoading(true); setReply(""); setErr("");
    try {
      const r = await fetch(`/api/admin/support/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) { setThread(j); setAssignee(j.ticket?.assignee || ""); } else setErr(j.error || "Could not open the ticket.");
    } catch { setErr("Could not open the ticket."); }
    setThreadLoading(false);
  }, []);

  async function act(payload: Record<string, unknown>, refreshThread = true): Promise<boolean> {
    if (!openId) return false;
    setBusy(true); setErr("");
    let ok = false;
    try {
      const r = await fetch(`/api/admin/support/${openId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Something went wrong."); setBusy(false); return false; }
      ok = true;
      if (refreshThread) await openTicket(openId);
      await load(filter);
    } catch { setErr("Something went wrong."); }
    setBusy(false);
    return ok;
  }

  // THREAD VIEW
  if (openId) {
    const st = statusMeta(thread?.ticket?.status);
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => { setOpenId(null); setThread(null); load(filter); }} className="text-[13px] font-bold text-gray-500 hover:text-gray-900 mb-3">← Back to inbox</button>
        {threadLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : thread ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h1 className="text-xl font-black text-gray-900">{thread.ticket.subject}</h1>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
            </div>
            <p className="text-[12px] text-gray-400 mb-4">
              {thread.ticket.partner_name}
              {thread.ticket.partner_code ? <span className="font-mono"> · /{thread.ticket.partner_code}</span> : null}
              {thread.ticket.partner_email ? ` · ${thread.ticket.partner_email}` : ""}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Status</label>
              <select value={thread.ticket.status} onChange={(e) => act({ action: "status", status: e.target.value }, true)} disabled={busy} className="text-[13px] font-semibold px-2 py-1.5 rounded-lg border border-gray-200 bg-white">
                <option value="open">Open</option>
                <option value="answered">Replied</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assign to…" className="text-[13px] px-2 py-1.5 rounded-lg border border-gray-200 bg-white w-32" />
              <button onClick={() => act({ action: "assign", assignee }, true)} disabled={busy} className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50">Save</button>
            </div>

            <div className="space-y-3 mb-4">
              {thread.messages.map((m) => (
                <div key={m.id} className={`rounded-2xl p-3.5 ${m.sender === "admin" ? "bg-[#3cac3b]/10 ml-6" : "bg-white border border-gray-200 mr-6"}`}>
                  <p className="text-[11px] font-bold text-gray-400 mb-1">{m.sender === "admin" ? "Support (you)" : thread.ticket.partner_name} · {fmt(m.created_at)}</p>
                  <p className="text-[14px] text-gray-700 whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              ))}
            </div>

            {err && <p className="text-[13px] text-red-600 mb-2">{err}</p>}
            <div className="flex gap-2 items-end">
              <textarea className={`${field} min-h-[64px]`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to the partner…" />
              <button onClick={async () => { if (!reply.trim()) return; const ok = await act({ action: "reply", message: reply }, true); if (ok) setReply(""); }} disabled={busy || !reply.trim()} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d] disabled:opacity-50 shrink-0">{busy ? "…" : "Send reply"}</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-red-600">{err || "Could not open the ticket."}</p>
        )}
      </div>
    );
  }

  // INBOX
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900">Support inbox</h1>
        <div className="flex gap-2 text-[12px]">
          <span className="font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded">{openCount} open</span>
          {unread > 0 && <span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded">{unread} new</span>}
        </div>
      </div>
      <p className="text-[13px] text-gray-400 mb-4">Reply to partners, set a status, and assign tickets.</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-[12px] font-bold px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === f ? "bg-[#3cac3b] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{f}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-gray-400">No tickets here.</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const st = statusMeta(t.status);
            return (
              <button key={t.id} onClick={() => openTicket(t.id)} className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-[#3cac3b]/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-bold text-gray-900 truncate flex items-center gap-2">
                    {t.admin_unread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                    {t.subject}
                  </p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {t.partner_name}{t.partner_code ? <span className="font-mono"> · /{t.partner_code}</span> : null} · updated {fmt(t.last_message_at)}
                  {t.assignee ? <span className="text-gray-500"> · {t.assignee}</span> : null}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
