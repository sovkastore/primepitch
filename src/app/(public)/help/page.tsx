"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { VPN_GUIDE } from "@/lib/vpnGuide";

// ISO-3166 two-letter code -> flag emoji
function flag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const POPULAR = ["India", "Pakistan", "Nigeria", "United States", "United Kingdom", "Brazil"];

export default function HelpPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return [];
    const starts = VPN_GUIDE.filter((e) => e.country.toLowerCase().startsWith(query));
    const incl = VPN_GUIDE.filter(
      (e) => e.country.toLowerCase().includes(query) && !starts.includes(e)
    );
    return [...starts, ...incl].slice(0, 8);
  }, [query]);

  const top = matches[0];
  const others = matches.slice(1);

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8">
      {/* Hero */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700 tracking-wide">
          STREAMING HELP
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
          Can&apos;t watch the stream?
        </h1>
        <p className="mt-3 text-[15px] text-gray-600 leading-relaxed max-w-xl mx-auto">
          If a match won&apos;t play for you, it&apos;s almost always your network or region
          blocking the video — not PrimePitch. Here&apos;s how to fix it in a couple of minutes.
        </p>
      </div>

      {/* Did you wait? — the most common cause */}
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-black text-gray-900">First — did you wait for it to load?</h2>
            <p className="mt-1 text-[13.5px] text-gray-700 leading-relaxed">
              Streams can take <strong>30–60 seconds</strong> to start, especially on a slower or
              restricted connection. Stay on the player and don&apos;t tap anything while it loads.
              Only if it has <strong>finished loading and you still see a grey or blank box</strong>{" "}
              should you follow the steps below.
            </p>
          </div>
        </div>
      </div>

      {/* What you might see */}
      <section className="mt-9">
        <h2 className="text-lg font-black text-gray-900">What you might be seeing</h2>
        <p className="mt-1 text-[13.5px] text-gray-600">
          Recognise either of these? Your connection is being blocked from the stream — the fix
          below works.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <figure className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <img
              src="/help-stuck-loading.jpg"
              alt="Page stuck on Loading live matches"
              loading="lazy"
              className="w-full h-56 object-cover object-top bg-gray-50"
            />
            <figcaption className="p-3.5">
              <p className="text-[13px] font-bold text-gray-900">Stuck on “Loading…”</p>
              <p className="text-[12px] text-gray-500 mt-0.5">The page never finishes loading.</p>
            </figcaption>
          </figure>
          <figure className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <img
              src="/help-broken-player.jpg"
              alt="Grey broken box where the video player should be"
              loading="lazy"
              className="w-full h-56 object-cover object-top bg-gray-50"
            />
            <figcaption className="p-3.5">
              <p className="text-[13px] font-bold text-gray-900">A grey box, no video</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Scores load, but the player can&apos;t.
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Why */}
      <section className="mt-9">
        <h2 className="text-lg font-black text-gray-900">Why this happens</h2>
        <p className="mt-1.5 text-[13.5px] text-gray-700 leading-relaxed">
          Some internet providers and countries block the servers that carry the live video.
          Everything else on PrimePitch still works — which is exactly why you can see the match
          list and scores, but the video won&apos;t play. The fix is to route your connection
          through a region that isn&apos;t blocked.
        </p>
      </section>

      {/* Quick fixes first */}
      <section className="mt-9">
        <h2 className="text-lg font-black text-gray-900">Quick things to try first</h2>
        <ul className="mt-3 space-y-2.5">
          {[
            ["Try another source", "Tap a different option under “Choose stream”. Each one is a separate server — one may not be blocked."],
            ["Refresh fully", "Wait a few seconds, then reload or reopen the match page."],
            ["Switch network", "Flip between Wi-Fi and mobile data — one is sometimes less restricted."],
            ["Change your DNS", "Set your phone’s DNS to 1.1.1.1 or 8.8.8.8."],
          ].map(([t, d]) => (
            <li key={t} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <svg className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-[13.5px] font-bold text-gray-900">{t}</p>
                <p className="text-[12.5px] text-gray-600 mt-0.5">{d}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-gray-500">
          Still stuck? The reliable fix is a VPN — set it up below. ↓
        </p>
      </section>

      {/* The reliable fix: VPN steps */}
      <section className="mt-9">
        <h2 className="text-lg font-black text-gray-900">The reliable fix: use a VPN</h2>
        <p className="mt-1 text-[13.5px] text-gray-600">
          A VPN makes your connection look like it&apos;s coming from another country, so the block
          no longer applies. It takes about two minutes.
        </p>
        <ol className="mt-4 space-y-3">
          {[
            "Install a VPN app from your app store (any reputable one works).",
            "Connect to the country we recommend for you — search yours just below.",
            "Come back and fully refresh / reopen the match page.",
            "Press play. If it still won’t start, try another source or a backup country.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-600 text-white text-[13px] font-black flex items-center justify-center">
                {i + 1}
              </span>
              <p className="text-[13.5px] text-gray-800 leading-relaxed pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ⭐ Country -> VPN lookup */}
      <section className="mt-10 rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white p-5 sm:p-6">
        <h2 className="text-xl font-black text-gray-900 text-center">Find your VPN country</h2>
        <p className="mt-1.5 text-[13px] text-gray-600 text-center max-w-md mx-auto">
          Search your country to see which location to set your VPN to. Try the first one — if it
          doesn&apos;t work, use a backup.
        </p>

        <div className="mt-4 relative">
          <svg className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type your country, e.g. India"
            className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            autoComplete="off"
          />
        </div>

        {/* Result */}
        {top ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-white border border-emerald-200 shadow-sm p-5">
              <p className="text-[12px] font-semibold text-gray-500">
                <span className="mr-1">{flag(top.code)}</span>You&apos;re in {top.country}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-3xl leading-none">{flag(top.recommend.code)}</span>
                <div>
                  <p className="text-[12px] font-bold text-emerald-700 uppercase tracking-wide">
                    Set your VPN to
                  </p>
                  <p className="text-xl font-black text-gray-900 leading-tight">
                    {top.recommend.name}
                  </p>
                </div>
              </div>
              {top.backups.length > 0 && (
                <p className="mt-3 pt-3 border-t border-gray-100 text-[13px] text-gray-600">
                  <span className="font-semibold text-gray-700">If that doesn&apos;t work:</span>{" "}
                  {top.backups.map((b, i) => (
                    <span key={b.code}>
                      {i > 0 && <span className="text-gray-300"> · </span>}
                      <span className="mr-1">{flag(b.code)}</span>
                      {b.name}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {others.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {others.map((e) => (
                  <button
                    key={e.code}
                    onClick={() => setQ(e.country)}
                    className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[12.5px] font-medium text-gray-700 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                  >
                    <span className="mr-1">{flag(e.code)}</span>
                    {e.country}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : query ? (
          <div className="mt-4 rounded-2xl bg-white border border-gray-200 p-5 text-center">
            <p className="text-[13.5px] text-gray-700">
              No match for “{q.trim()}”. Pick the closest country, or just try{" "}
              <span className="font-semibold">🇸🇬 Singapore</span>,{" "}
              <span className="font-semibold">🇬🇧 UK</span>, or{" "}
              <span className="font-semibold">🇩🇪 Germany</span> — they work for most regions.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-[12px] font-semibold text-gray-400 text-center mb-2">
              Or tap a popular one
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR.map((c) => (
                <button
                  key={c}
                  onClick={() => setQ(c)}
                  className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[12.5px] font-medium text-gray-700 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Footer note */}
      <section className="mt-9 rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <h3 className="text-[13.5px] font-black text-gray-900">A few tips for a smooth stream</h3>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-gray-600 leading-relaxed list-disc pl-5">
          <li>A paid VPN is usually faster and more reliable than free ones, which can be slow or overloaded.</li>
          <li>After connecting the VPN, always <strong>fully refresh or reopen</strong> the match page.</li>
          <li>These are general recommendations, not guarantees — if one location doesn&apos;t work, try a backup.</li>
        </ul>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700 transition-colors"
        >
          ← Back to matches
        </Link>
      </div>
    </div>
  );
}
