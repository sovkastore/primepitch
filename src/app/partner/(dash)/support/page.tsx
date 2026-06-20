"use client";

import { useCallback, useEffect, useState } from "react";

type Ticket = { id: string; subject: string; status: string; created_at: string; updated_at: string; last_message_at: string; partner_unread: boolean };
type Message = { id: string; sender: string; body: string; created_at: string };
type ThreadTicket = { id: string; subject: string; status: string; created_at: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700" },
  answered: { label: "Replied", cls: "bg-[#3cac3b]/10 text-[#3cac3b]" },
  resolved: { label: "Resolved", cls: "bg-gray-100 text-gray-500" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
};
const statusMeta = (s?: string) => STATUS[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-500" };

function fmt(d: string) {
  try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return d; }
}

const field = "w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#3cac3b]";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "new">("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: ThreadTicket; messages: Message[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/partner/support", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setTickets(j.tickets ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTicket = useCallback(async (id: string) => {
    setOpenId(id); setThread(null); setThreadLoading(true); setReply(""); setErr("");
    try {
      const r = await fetch(`/api/partner/support/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setThread(j); else setErr(j.error || "Could not open the ticket.");
    } catch { setErr("Could not open the ticket."); }
    setThreadLoading(false);
  }, []);

  async function createTicket() {
    if (busy) return;
    if (!subject.trim() || !message.trim()) { setErr("Add a subject and a message."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/partner/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, message }) });
      const j = await r.json();
      if (r.ok) { setSubject(""); setMessage(""); setView("list"); await load(); openTicket(j.id); }
      else setErr(j.error || "Could not create the ticket.");
    } catch { setErr("Could not create the ticket."); }
    setBusy(false);
  }

  async function sendReply() {
    if (busy || !openId || !reply.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/partner/support/${openId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: reply }) });
      const j = await r.json();
      if (r.ok) { setReply(""); await openTicket(openId); await load(); }
      else setErr(j.error || "Could not send your reply.");
    } catch { setErr("Could not send your reply."); }
    setBusy(false);
  }

  // THREAD VIEW
  if (openId) {
    const st = statusMeta(thread?.ticket?.status);
    const closed = thread?.ticket?.status === "closed";
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => { setOpenId(null); setThread(null); load(); }} className="text-[13px] font-bold text-gray-500 hover:text-gray-900 mb-3">← Back to tickets</button>
        {threadLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : thread ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h1 className="text-xl font-black text-gray-900">{thread.ticket.subject}</h1>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
            </div>
            <div className="space-y-3 mb-4">
              {thread.messages.map((m) => (
                <div key={m.id} className={`rounded-2xl p-3.5 ${m.sender === "partner" ? "bg-[#3cac3b]/10 ml-6" : "bg-white border border-gray-200 mr-6"}`}>
                  <p className="text-[11px] font-bold text-gray-400 mb-1">{m.sender === "partner" ? "You" : "PrimePitch Support"} · {fmt(m.created_at)}</p>
                  <p className="text-[14px] text-gray-700 whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              ))}
            </div>
            {err && <p className="text-[13px] text-red-600 mb-2">{err}</p>}
            {closed ? (
              <p className="text-[13px] text-gray-400 bg-gray-50 rounded-xl p-3">This ticket is closed. If you still need help, open a new ticket.</p>
            ) : (
              <div className="flex gap-2 items-end">
                <textarea className={`${field} min-h-[56px]`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                <button onClick={sendReply} disabled={busy || !reply.trim()} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d] disabled:opacity-50 shrink-0">{busy ? "…" : "Send"}</button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-red-600">{err || "Could not open the ticket."}</p>
        )}
      </div>
    );
  }

  // NEW TICKET VIEW
  if (view === "new") {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => { setView("list"); setErr(""); }} className="text-[13px] font-bold text-gray-500 hover:text-gray-900 mb-3">← Back</button>
        <h1 className="text-xl font-black text-gray-900 mb-1">New support ticket</h1>
        <p className="text-[13px] text-gray-400 mb-4">Tell us what’s going on and we’ll get back to you right here.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-bold text-gray-500 mb-1">Subject</label>
            <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. My payout hasn’t arrived" />
          </div>
          <div>
            <label className="block text-[12px] font-bold text-gray-500 mb-1">Message</label>
            <textarea className={`${field} min-h-[140px]`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the issue in as much detail as you can…" />
          </div>
          {err && <p className="text-[13px] text-red-600">{err}</p>}
          <button onClick={createTicket} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d] disabled:opacity-50">{busy ? "Sending…" : "Submit ticket"}</button>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900">Support</h1>
        <button onClick={() => { setView("new"); setErr(""); }} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d]">New ticket</button>
      </div>
      <p className="text-[13px] text-gray-400 mb-4">Reach our team and track your conversations here.</p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">You haven’t opened any tickets yet.</p>
          <button onClick={() => setView("new")} className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d]">Open your first ticket</button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const st = statusMeta(t.status);
            return (
              <button key={t.id} onClick={() => openTicket(t.id)} className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-[#3cac3b]/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-bold text-gray-900 truncate flex items-center gap-2">
                    {t.partner_unread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                    {t.subject}
                  </p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Updated {fmt(t.last_message_at)}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
