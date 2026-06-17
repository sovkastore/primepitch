"use client";

import { useCallback, useEffect, useState } from "react";

interface Partner { id: string; code: string; name: string; email: string; active: boolean; created_at: string }

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

  async function toggle(p: Partner) {
    await post({ code: p.code, name: p.name, email: p.email, active: !p.active }, `${p.name} turned ${p.active ? "off" : "on"}.`);
  }
  async function resetPw(p: Partner) {
    const pw = window.prompt(`New password for ${p.name}:`);
    if (!pw) return;
    await post({ code: p.code, name: p.name, email: p.email, active: p.active, password: pw }, `Password updated for ${p.name}.`);
  }
  async function rename(p: Partner) {
    const nn = window.prompt("New display name:", p.name);
    if (!nn || nn.trim() === p.name) return;
    await post({ code: p.code, name: nn.trim(), email: p.email, active: p.active }, `Renamed to ${nn.trim()}.`);
  }

  const field = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

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
        <button
          onClick={createPartner}
          disabled={busy}
          className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
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
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-gray-900">{p.name}</span>
                    <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">/{p.code}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                      {p.active ? "Active" : "Off"}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1">{p.email}</p>
                  <p className="text-[12px] text-gray-400 font-mono mt-1">{SITE}/{p.code}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => toggle(p)} disabled={busy}
                    className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                    {p.active ? "Turn off" : "Turn on"}
                  </button>
                  <button onClick={() => rename(p)} disabled={busy}
                    className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                    Rename
                  </button>
                  <button onClick={() => resetPw(p)} disabled={busy}
                    className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                    Reset password
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
