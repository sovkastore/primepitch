"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ensurePushSubscription,
  isIos,
  isStandalone,
} from "@/lib/push-client";

const STORE = "pp_notify_v1";
function rememberFollow(teamKey: string) {
  try {
    const cur = new Set(JSON.parse(localStorage.getItem(STORE) || "[]") as string[]);
    cur.add(teamKey);
    localStorage.setItem(STORE, JSON.stringify([...cur]));
  } catch {
    /* ignore */
  }
}

type Env = "checking" | "installed" | "needs-install" | "ready";
type Status = "idle" | "working" | "done" | "error";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-[12px] font-black grid place-items-center">
        {n}
      </span>
      <span className="text-[14px] text-gray-700 leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 -mt-0.5 mx-0.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function MatchAlertsInner() {
  const params = useSearchParams();
  const teamKey = params.get("key") || "";
  const home = params.get("home") || "";
  const away = params.get("away") || "";
  const title = params.get("title") || (home && away ? `${home} vs ${away}` : "this match");

  const [env, setEnv] = useState<Env>("checking");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (isIos()) setEnv(isStandalone() ? "installed" : "needs-install");
    else setEnv("ready");
  }, []);

  async function enable() {
    if (!teamKey) {
      setStatus("error");
      setMsg("No match selected. Head back and tap the bell on a fixture.");
      return;
    }
    setStatus("working");
    setMsg("");
    try {
      const ps = await ensurePushSubscription();
      if (ps === "unsupported") {
        setStatus("error");
        setMsg("This browser can't receive alerts. Open PrimePitch from your Home Screen icon.");
        return;
      }
      if (ps === "blocked") {
        setStatus("error");
        setMsg("Notifications are blocked. Turn them on in Settings, then try again.");
        return;
      }
      const res = await fetch("/api/push/notify-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          teamKey,
          title,
          subscription: { endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth } },
          ua: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      rememberFollow(teamKey);
      setStatus("done");
    } catch {
      setStatus("error");
      setMsg("Couldn't turn on alerts. Please try again.");
    }
  }

  const Pill = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
      Match alerts
    </span>
  );

  const matchCard = (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">You&rsquo;ll be alerted for</p>
      <p className="text-[16px] font-extrabold text-gray-900">{title}</p>
      <p className="text-[12px] text-gray-500 mt-0.5">Kick-off, goals, half-time and full-time.</p>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      {Pill}
      <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 leading-tight">
        Get alerts for this match on iPhone
      </h1>

      {teamKey ? matchCard : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-gray-600">
          No match selected. Go back and tap the bell on a fixture to set up its alerts.
        </div>
      )}

      {env === "checking" && (
        <p className="text-[14px] text-gray-400">Checking your device…</p>
      )}

      {/* Already installed (opened from Home Screen) OR non-iPhone → it just works. */}
      {(env === "installed" || env === "ready") && (
        <div className="space-y-3">
          {env === "installed" && (
            <p className="text-[14px] text-gray-700">
              You&rsquo;re in the installed app — you&rsquo;re all set. Tap below to turn on alerts for this match.
            </p>
          )}
          {status === "done" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <p className="text-[15px] font-extrabold text-emerald-700">You&rsquo;re in.</p>
              <p className="text-[13px] text-emerald-700/80 mt-0.5">We&rsquo;ll alert you for {title}.</p>
              <Link href="/world-cup" className="inline-block mt-3 text-[13px] font-bold text-emerald-700 underline">
                Back to fixtures
              </Link>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={enable}
                disabled={status === "working" || !teamKey}
                className={`w-full rounded-2xl px-5 py-3.5 text-[15px] font-extrabold text-white transition-colors ${
                  status === "working" || !teamKey ? "bg-emerald-400" : "bg-emerald-500 hover:bg-emerald-600"
                }`}
              >
                {status === "working" ? "Turning on…" : "Notify me for this match"}
              </button>
              {msg && <p className="text-[13px] text-red-600">{msg}</p>}
            </>
          )}
        </div>
      )}

      {/* iPhone in a normal Safari tab → push can't work here; show the install path. */}
      {env === "needs-install" && (
        <div className="space-y-5">
          <p className="text-[14px] text-gray-700 leading-relaxed">
            On iPhone, Apple only delivers alerts to apps added to your Home Screen. It&rsquo;s a one-time setup —
            after that, every match alert works.
          </p>

          <ol className="space-y-3">
            <Step n={1}>
              Tap the <span className="font-bold">Share</span> button <ShareGlyph /> in your browser&rsquo;s toolbar.
            </Step>
            <Step n={2}>
              Choose <span className="font-bold">Add to Home Screen</span>, then tap <span className="font-bold">Add</span>.
            </Step>
            <Step n={3}>
              Open <span className="font-bold">PrimePitch</span> from the new Home Screen icon.
            </Step>
            <Step n={4}>
              Come back to this match and tap the bell — or return to this page and tap{" "}
              <span className="font-bold">Notify me</span>. You&rsquo;ll be asked to allow notifications once.
            </Step>
          </ol>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            <p className="text-[13px] font-bold text-gray-800">Already added PrimePitch to your Home Screen?</p>
            <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
              Open it from your Home Screen icon (not this Safari tab), then this button will turn on alerts for{" "}
              {teamKey ? title : "your match"}. iPhone can only send alerts from the installed app.
            </p>
          </div>

          <p className="text-[12px] text-gray-400">
            On Android or a computer? The bell on any fixture works straight away — no setup needed.
          </p>
        </div>
      )}
    </div>
  );
}

export default function MatchAlertsPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-10 text-[14px] text-gray-400">Loading…</div>}>
      <MatchAlertsInner />
    </Suspense>
  );
}
