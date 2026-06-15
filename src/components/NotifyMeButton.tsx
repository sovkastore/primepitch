"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normTeamKey } from "@/lib/api";
import { ensurePushSubscription, getExistingPush, isIosBrowserTab } from "@/lib/push-client";

// A small bell on a match card. Tap to get this fixture's alerts (15 min / 1 min
// / kick-off / goals / half-time / full-time). Prompts for notification
// permission right there if it isn't granted yet. Green bell = following.
// Follow state is remembered per device in localStorage so the bell shows the
// right state on return.

const STORE = "pp_notify_v1";

function readSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(s: Set<string>) {
  try {
    localStorage.setItem(STORE, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export default function NotifyMeButton({
  home,
  away,
  title,
  className = "",
}: {
  home: string;
  away: string;
  title?: string;
  className?: string;
}) {
  const teamKey = normTeamKey({ teams: { home: { name: home }, away: { name: away } } });
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setOn(readSet().has(teamKey));
  }, [teamKey]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      if (!on) {
        // iPhone/iPad in a normal browser tab can't receive push at all — send
        // them to the dedicated setup page, carrying this match with them.
        if (isIosBrowserTab()) {
          const qs = new URLSearchParams({
            key: teamKey,
            title: title || `${home} vs ${away}`,
            home,
            away,
          });
          router.push(`/match-alerts?${qs.toString()}`);
          return;
        }
        const ps = await ensurePushSubscription();
        if (ps === "unsupported") {
          setNote("Not supported on this browser");
          return;
        }
        if (ps === "blocked") {
          setNote("Allow notifications to get alerts");
          return;
        }
        const res = await fetch("/api/push/notify-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            teamKey,
            title: title || `${home} vs ${away}`,
            subscription: { endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth } },
            ua: navigator.userAgent,
          }),
        });
        if (!res.ok) throw new Error("save failed");
        const s = readSet();
        s.add(teamKey);
        writeSet(s);
        setOn(true);
      } else {
        const ps = await getExistingPush();
        if (ps) {
          await fetch("/api/push/notify-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "remove",
              teamKey,
              subscription: { endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth } },
            }),
          });
        }
        const s = readSet();
        s.delete(teamKey);
        writeSet(s);
        setOn(false);
      }
    } catch {
      setNote("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? "Stop alerts for this match" : "Notify me about this match"}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
          on
            ? "bg-emerald-500 text-white"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        } ${busy ? "opacity-60" : ""}`}
      >
        {on ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M12 2a6 6 0 0 0-6 6v3.6L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 11.6V8a6 6 0 0 0-6-6Zm0 20a2.8 2.8 0 0 0 2.8-2.4H9.2A2.8 2.8 0 0 0 12 22Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a2 2 0 0 0 3 0" />
          </svg>
        )}
      </button>
      <span className={`text-[8px] font-bold leading-tight ${on ? "text-emerald-600" : "text-gray-400"}`}>
        {note || (on ? "Alerts on" : "Notify me")}
      </span>
    </span>
  );
}
