"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PartnerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/partner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
        router.push("/partner");
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Login failed");
        setLoading(false);
      }
    } catch {
      setErr("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-black text-gray-900 text-lg tracking-tight">PrimePitch</span>
          <span className="text-[9px] font-bold text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded">PARTNER</span>
        </div>
        <p className="text-[13px] text-gray-400 font-medium mb-6">Sign in to your partner dashboard</p>

        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#10b981]"
          placeholder="you@example.com"
        />

        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#10b981]"
          placeholder="••••••••"
        />

        {err && <p className="text-[12px] text-red-500 font-semibold mb-3">{err}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[#10b981] text-white text-sm font-bold hover:bg-[#059669] disabled:opacity-60 transition-colors"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
