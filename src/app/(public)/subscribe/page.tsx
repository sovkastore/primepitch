"use client";

import { useEffect, useState } from "react";

// Public VAPID key — safe to ship to the browser. The matching private key
// lives server-side only.
const VAPID_PUBLIC =
  "BJAtbwmAROyuFpfNhPIVwZAfVOAF6AMHKfuac7GtxAfRGHNoKr_ZLniCsL3xfinHOK-7Nu-DRSdttIQ5Sx-OOPw";
const SW_URL = "/alerts/sw.js";

type Status =
  | "checking"
  | "unsupported"
  | "ios-needs-install"
  | "ready"
  | "subscribed"
  | "blocked"
  | "working";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports as Mac with touch
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

export default function SubscribePage() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    // Deferred so state updates happen in a callback, not synchronously in the
    // effect body, and only on the client where these APIs exist.
    Promise.resolve().then(() => {
      if (!alive) return;
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        // On iPhone, push only exists once the site is added to the home screen.
        setStatus(isIos() && !isStandalone() ? "ios-needs-install" : "unsupported");
        return;
      }
      if (isIos() && !isStandalone()) {
        setStatus("ios-needs-install");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }
      navigator.serviceWorker
        .getRegistration(SW_URL)
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => {
          if (alive) setStatus(sub ? "subscribed" : "ready");
        })
        .catch(() => {
          if (alive) setStatus("ready");
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setError("");
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "ready");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), ua: navigator.userAgent }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("subscribed");
    } catch {
      setError("Something went wrong turning on alerts. Please try again.");
      setStatus("ready");
    }
  }

  async function disable() {
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("ready");
    } catch {
      setStatus("subscribed");
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <div className="text-center space-y-2">
        <div className="text-4xl">🔔</div>
        <h1 className="text-2xl font-bold text-gray-900">Live goal alerts</h1>
        <p className="text-sm text-gray-600">
          Get a notification the moment a goal goes in — even when the site is
          closed. No account needed.
        </p>
      </div>

      {status === "checking" && (
        <p className="text-center text-sm text-gray-500">Checking your device…</p>
      )}

      {status === "ready" && (
        <button
          onClick={enable}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
        >
          Turn on goal alerts
        </button>
      )}

      {status === "working" && (
        <button
          disabled
          className="w-full py-3 rounded-xl bg-emerald-600/60 text-white font-semibold text-sm"
        >
          One moment…
        </button>
      )}

      {status === "subscribed" && (
        <div className="space-y-3">
          <div className="w-full py-3 rounded-xl bg-emerald-50 text-emerald-700 font-semibold text-sm text-center">
            ✓ Goal alerts are on
          </div>
          <button
            onClick={disable}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm"
          >
            Turn off
          </button>
        </div>
      )}

      {status === "blocked" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          Notifications are blocked for this site in your browser settings. Turn
          them back on for PrimePitch, then reload this page.
        </div>
      )}

      {status === "ios-needs-install" && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 space-y-2">
          <p className="font-semibold">One quick step on iPhone first:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open this site in <b>Safari</b> (not another browser).</li>
            <li>Tap the <b>Share</b> button (the square with an up-arrow).</li>
            <li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open PrimePitch from the new <b>home-screen icon</b> and come back here.</li>
          </ol>
          <p className="text-xs text-blue-800/80">
            Apple only allows alerts for sites added to the home screen.
          </p>
        </div>
      )}

      {status === "unsupported" && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
          Your browser doesn&rsquo;t support push notifications. Try Chrome on
          Android or desktop, or our app.
        </div>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <p className="text-center text-xs text-gray-400">
        You can turn alerts off any time, here or in your browser settings.
      </p>
    </div>
  );
}
