"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
};

const STYLES: Record<Variant, string> = {
  info: "bg-blue-600 text-white",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-black",
};

// A short, stable id for the current message so a dismissal sticks until the
// admin changes the text/link ("say it once").
function signatureOf(a: Announcement): string {
  let h = 0;
  const s = `${a.message}|${a.linkUrl}|${a.linkLabel}|${a.variant}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export default function AnnouncementBar() {
  const [a, setA] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume dismissed until checked

  useEffect(() => {
    let alive = true;
    fetch("/api/announcement", { cache: "no-store" })
      .then((r) => r.json())
      .then((cfg: Announcement) => {
        if (!alive || !cfg?.enabled || !cfg.message) return;
        setA(cfg);
        try {
          const seen = localStorage.getItem("pp_announce_dismissed");
          setDismissed(seen === signatureOf(cfg));
        } catch {
          setDismissed(false);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!a || dismissed) return null;

  const close = () => {
    try {
      localStorage.setItem("pp_announce_dismissed", signatureOf(a));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const isExternal = /^https?:\/\//i.test(a.linkUrl);
  const link =
    a.linkUrl && a.linkLabel ? (
      isExternal ? (
        <a
          href={a.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold whitespace-nowrap"
        >
          {a.linkLabel}
        </a>
      ) : (
        <Link href={a.linkUrl} className="underline font-semibold whitespace-nowrap">
          {a.linkLabel}
        </Link>
      )
    ) : null;

  return (
    <div className={`w-full ${STYLES[a.variant]}`}>
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <p className="flex-1 text-center">
          {a.message} {link}
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 opacity-80 hover:opacity-100 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
