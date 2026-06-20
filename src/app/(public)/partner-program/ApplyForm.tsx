"use client";

import { useState, type ChangeEvent } from "react";

const PLATFORMS = ["Telegram", "YouTube", "TikTok", "Instagram", "Other"];

type Form = {
  name: string; email: string; country: string;
  platform: string; audience_size: string; contact_handle: string;
  website: string; // honeypot — real people leave this empty
};

const EMPTY: Form = { name: "", email: "", country: "", platform: "Telegram", audience_size: "", contact_handle: "", website: "" };

export default function ApplyForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setErr(null);
    if (!form.name.trim() || !form.email.trim() || !form.contact_handle.trim()) {
      setErr("Please add your name, email and a contact handle.");
      return;
    }
    if (!form.email.includes("@")) { setErr("Please enter a valid email."); return; }
    setStatus("sending");
    try {
      const r = await fetch("/api/partner-program/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Something went wrong. Please try again."); setStatus("idle"); return; }
      setStatus("done");
    } catch {
      setErr("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-black">✓</div>
        <h3 className="mt-4 text-xl font-black text-gray-900">Application received</h3>
        <p className="mt-2 text-[15px] text-gray-600 leading-relaxed max-w-md mx-auto">
          Thanks — we’ve got it. We’ll reach out personally on the handle you gave us, so keep an eye on it. No automated emails yet, so this is the fastest way we’ll connect.
        </p>
      </div>
    );
  }

  const field = "w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "block text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
      <h3 className="text-xl font-black text-gray-900">Apply to become a partner</h3>
      <p className="mt-1.5 text-[14px] text-gray-500">Tell us about your audience. It takes a minute.</p>

      {err && <div className="mt-4 text-[13px] font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-600">{err}</div>}

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Your name</label>
          <input className={field} value={form.name} onChange={set("name")} placeholder="Full name" />
        </div>
        <div>
          <label className={label}>Email</label>
          <input className={field} value={form.email} onChange={set("email")} placeholder="you@example.com" inputMode="email" />
        </div>
        <div>
          <label className={label}>Country</label>
          <input className={field} value={form.country} onChange={set("country")} placeholder="Where you’re based" />
        </div>
        <div>
          <label className={label}>Main platform</label>
          <select className={field} value={form.platform} onChange={set("platform")}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Audience size</label>
          <input className={field} value={form.audience_size} onChange={set("audience_size")} placeholder="e.g. 12k followers / 3k group" />
        </div>
        <div>
          <label className={label}>Best way to reach you</label>
          <input className={field} value={form.contact_handle} onChange={set("contact_handle")} placeholder="Telegram or WhatsApp handle" />
        </div>
      </div>

      {/* honeypot: hidden from real users */}
      <input
        type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")}
        className="absolute left-[-9999px] w-px h-px opacity-0" aria-hidden="true"
      />

      <p className="mt-4 text-[13px] text-gray-400 leading-relaxed">
        We don’t have automated emails yet — leave a Telegram or WhatsApp handle and we’ll personally get in touch.
      </p>

      <button onClick={submit} disabled={status === "sending"}
        className="mt-5 w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 text-white text-[15px] font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors">
        {status === "sending" ? "Sending…" : "Submit application"}
      </button>
    </div>
  );
}
