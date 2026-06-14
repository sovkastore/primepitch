"use client";

import { useEffect, useState } from "react";

type PublicSocial = { id: string; label: string; url: string };

export default function ContactPage() {
  const [links, setLinks] = useState<PublicSocial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/social-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLinks(Array.isArray(d.links) ? d.links : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Contact us</h1>
        <p className="text-sm text-gray-600">
          Reach us on any of the channels below — we&rsquo;re happy to help.
        </p>
      </div>

      {!loaded && (
        <p className="text-center text-sm text-gray-500">Loading…</p>
      )}

      {loaded && links.length === 0 && (
        <p className="text-center text-sm text-gray-500">
          Contact channels are being set up. Please check back soon.
        </p>
      )}

      <div className="space-y-2">
        {links.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-800"
          >
            <span>{s.label}</span>
            <span className="text-gray-400">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
