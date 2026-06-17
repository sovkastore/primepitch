"use client";

import { useCallback, useEffect, useState } from "react";

interface Partner {
  id: string; code: string; name: string; email: string;
  active: boolean; suspended: boolean; banned: boolean; created_at: string;
}

interface Confirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string };
  run: (value: string) => void;
}

const SITE = "https://xellnetwork.xyz";

export default function PartnersAdmin() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // New-partner form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Confirmation modal
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modalInput, setModalInput] = useState("");

  const ask = (c: Confirm, initial = "") => { setModalInput(initial); setConfirm(c); };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/partners", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setPartners(j.partners ?? []);
    } catch {
      setMsg({ type: "err", text: "Couldn't load partners." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/partners", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: "err", text: j.error || "Something went wrong" }); return false; }
      setMsg({ type: "ok", text: okText });
      await load();
      return true;
    } catch {
      setMsg({ type: "err", text: "Something went wrong" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createPartner() {
    if (busy) return;
    const ok = await post({ create: true, name, code, email, password, active: true }, `Added ${name || code}.`);
    if (ok) { setName(""); setCode(""); setEmail(""); setPassword(""); }
  }

  // ---- actions (each goes through the confirm modal) ----
  function toggleReferral(p: Partner) {
    ask({
      title: p.active ? "Turn referral link off?" : "Turn referral link on?",
      body: p.active
        ? `${p.name}'s link ${SITE}/${p.code} will stop tagging new visitors. They can still log in to their dashboard.`
        : `${p.name}'s link ${SITE}/${p.code} will start working again.`,
      confirmLabel: p.active ? "Turn off" : "Turn on",
      run: () => post({ action: "state", code: p.code, active: !p.active }, `${p.name}: referral turned ${p.active ? "off" : "on"}.`),
    });
  }
  function toggleSuspend(p: Partner) {
    ask({
      title: p.suspended ? "Restore login?" : "Suspend login?",
      body: p.suspended
        ? `${p.name} will be able to log into their dashboard again.`
        : `${p.name} won't be able to log into their dashboard. Their referral link keeps working.`,
      confirmLabel: p.suspended ? "Restore login" : "Suspend",
      run: () => post({ action: "state", code: p.code, suspended: !p.suspended }, `${p.name}: ${p.suspended ? "login restored" : "login suspended"}.`),
    });
  }
  function toggleBan(p: Partner) {
    ask({
      title: p.banned ? "Unban partner?" : "Ban partner?",
      body: p.banned
        ? `${p.name} will be restored. Their referral link returns to ${p.active ? "on" : "off"} and they can log in again${p.suspended ? " (still suspended)" : ""}.`
        : `Full cutoff: ${p.name}'s referral link stops working AND they can't log in. This is reversible.`,
      confirmLabel: p.banned ? "Unban" : "Ban",
      danger: true,
      run: () => post({ action: "state", code: p.code, banned: !p.banned }, `${p.name}: ${p.banned ? "unbanned" : "banned"}.`),
    });
  }
  function rename(p: Partner) {
    ask({
      title: `Rename ${p.name}?`,
      body: "This changes their display name only — their code and login stay the same.",
      confirmLabel: "Save name",
      input: { label: "New display name" },
      run: (v) => { const nn = v.trim(); if (!nn || nn === p.name) { setConfirm(null); return; } post({ code: p.code, name: nn, email: p.email, active: p.active }, `Renamed to ${nn}.`); },
    }, p.name);
  }
  function resetPw(p: Partner) {
    ask({
      title: `Reset password for ${p.name}?`,
      body: "They'll need the new password to log in. Their current password stops working immediately.",
      confirmLabel: "Reset password",
      danger: true,
      input: { label: "New password", placeholder: "at least 4 characters" },
      run: (v) => { if (!v || v.length < 4) { setMsg({ type: "err", text: "Password must be at least 4 characters" }); return; } post({ code: p.code, name: p.name, email: p.email, active: p.active, password: v }, `Password updated for ${p.name}.`); },
    });
  }

  const field = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const btn = "text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60";

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-black text-gray-900">Partners</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Add and manage referral partners. Each gets a link <span className="font-mono text-gray-600">/their-code</span> and a login at <span className="font-mono text-gray-600">/partner/login</span>.
      </p>

      {msg && (
        <div className={`mb-4 text-[13px] font-semibold px-3 py-2 rounded-xl ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      {/* Add new */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6">
        <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-3">Add a partner</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gims" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Referral code (their link)</label>
            <input className={field} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="e.g. gims" />
            {code && <p className="text-[11px] text-gray-400 mt-1 font-mono">{SITE}/{code}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Login email</label>
            <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Login password</label>
            <input className={field} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 4 characters" />
          </div>
        </div>
        <button onClick={createPartner} disabled={busy}
          className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {busy ? "Saving…" : "Add partner"}
        </button>
      </div>

      {/* Existing */}
      <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-2">Existing partners</p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-gray-400">No partners yet.</p>
      ) : (
        <div className="space-y-2.5">
          {partners.map((p) => (
            <div key={p.id} className={`bg-white rounded-2xl border p-4 ${p.banned ? "border-red-200" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-gray-900">{p.name}</span>
                    <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">/{p.code}</span>
                    {p.banned ? (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600">Banned</span>
                    ) : (
                      <>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                          {p.active ? "Referral on" : "Referral off"}
                        </span>
                        {p.suspended && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">Login suspended</span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1">{p.email}</p>
                  <p className="text-[12px] text-gray-400 font-mono mt-1">{SITE}/{p.code}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!p.banned && (
                    <>
                      <button onClick={() => toggleReferral(p)} disabled={busy} className={btn}>
                        {p.active ? "Turn off" : "Turn on"}
                      </button>
                      <button onClick={() => toggleSuspend(p)} disabled={busy} className={btn}>
                        {p.suspended ? "Restore login" : "Suspend"}
                      </button>
                    </>
                  )}
                  <button onClick={() => toggleBan(p)} disabled={busy}
                    className={`text-[12px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-60 ${p.banned ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                    {p.banned ? "Unban" : "Ban"}
                  </button>
                  <button onClick={() => rename(p)} disabled={busy} className={btn}>Rename</button>
                  <button onClick={() => resetPw(p)} disabled={busy} className={btn}>Reset password</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-gray-900">{confirm.title}</p>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{confirm.body}</p>
            {confirm.input && (
              <div className="mt-3">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">{confirm.input.label}</label>
                <input className={field} value={modalInput} autoFocus
                  placeholder={confirm.input.placeholder}
                  onChange={(e) => setModalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { const fn = confirm.run; const v = modalInput; setConfirm(null); fn(v); } }} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={() => { const fn = confirm.run; const v = modalInput; setConfirm(null); fn(v); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${confirm.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
