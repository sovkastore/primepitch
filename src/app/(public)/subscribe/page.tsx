"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Public VAPID key — safe in the browser. Private key stays server-side.
const VAPID_PUBLIC =
  "BJAtbwmAROyuFpfNhPIVwZAfVOAF6AMHKfuac7GtxAfRGHNoKr_ZLniCsL3xfinHOK-7Nu-DRSdttIQ5Sx-OOPw";
const SW_URL = "/alerts/sw.js";
const TOPICS_KEY = "pp_topics";

type Status =
  | "checking"
  | "unsupported"
  | "ios"
  | "ready"
  | "subscribed"
  | "blocked"
  | "working";

const SPORTS: { slug: string; label: string }[] = [
  { slug: "football", label: "Football" },
  { slug: "basketball", label: "Basketball" },
  { slug: "american-football", label: "NFL" },
  { slug: "ufc", label: "UFC" },
  { slug: "wwe", label: "WWE" },
  { slug: "boxing", label: "Boxing" },
  { slug: "motor-sports", label: "Motorsport" },
  { slug: "tennis", label: "Tennis" },
  { slug: "cricket", label: "Cricket" },
  { slug: "hockey", label: "Hockey" },
  { slug: "baseball", label: "Baseball" },
  { slug: "rugby", label: "Rugby" },
  { slug: "golf", label: "Golf" },
];

const FOOTBALL_COMPS: { slug: string; label: string }[] = [
  { slug: "football:world-cup", label: "World Cup 2026" },
  { slug: "football:premier-league", label: "Premier League" },
  { slug: "football:champions-league", label: "Champions League" },
  { slug: "football:la-liga", label: "La Liga" },
  { slug: "football:serie-a", label: "Serie A" },
  { slug: "football:bundesliga", label: "Bundesliga" },
  { slug: "football:ligue-1", label: "Ligue 1" },
];

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

// Wait for THIS registration to activate. (We can't use serviceWorker.ready —
// the alerts worker lives at /alerts/ and doesn't control this page, so .ready
// would never resolve here.)
async function waitForActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return;
  const sw = reg.installing || reg.waiting;
  if (!sw) return;
  await new Promise<void>((resolve) => {
    const onChange = () => {
      if (sw.state === "activated") {
        sw.removeEventListener("statechange", onChange);
        resolve();
      }
    };
    sw.addEventListener("statechange", onChange);
  });
}

function Pill({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full font-semibold border transition-colors ${
        small ? "px-3 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]"
      } ${
        active
          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/20"
          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function IosGuide() {
  const steps: ReactNode[] = [
    <>Open <b>xellnetwork.xyz</b> in <b>Safari</b> (not another browser).</>,
    <>Tap the <b>Share</b> button — the square with an up-arrow.</>,
    <>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</>,
    <>Open PrimePitch from the new <b>home-screen icon</b>, then come back here.</>,
  ];
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-bold grid place-items-center">
            {i + 1}
          </span>
          <span className="text-[13px] text-gray-600 leading-relaxed pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function SubscribePage() {
  const [status, setStatus] = useState<Status>("checking");
  const [topics, setTopics] = useState<string[]>([]);
  const [footballOpen, setFootballOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [error, setError] = useState("");
  const subRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      try {
        const saved = localStorage.getItem(TOPICS_KEY);
        const arr: unknown = saved ? JSON.parse(saved) : null;
        if (alive && Array.isArray(arr)) {
          setTopics(arr.filter((t): t is string => typeof t === "string"));
        }
      } catch {
        /* ignore */
      }
      if (!alive) return;
      if (isIos() && !isStandalone()) {
        setStatus("ios");
        return;
      }
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL);
        const sub = (await reg?.pushManager.getSubscription()) ?? null;
        subRef.current = sub;
        if (alive) setStatus(sub ? "subscribed" : "ready");
      } catch {
        if (alive) setStatus("ready");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  function persistTopics(next: string[]) {
    setTopics(next);
    try {
      localStorage.setItem(TOPICS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (subRef.current) {
      fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subRef.current.toJSON(),
          topics: next,
          ua: navigator.userAgent,
        }),
      }).catch(() => {});
    }
  }

  const footballAll = topics.includes("football");

  function toggleSport(slug: string) {
    if (slug === "football") {
      if (footballAll) {
        persistTopics(topics.filter((t) => t !== "football"));
      } else {
        persistTopics([...topics.filter((t) => !t.startsWith("football")), "football"]);
      }
      return;
    }
    persistTopics(
      topics.includes(slug) ? topics.filter((t) => t !== slug) : [...topics, slug]
    );
  }

  function toggleComp(slug: string) {
    const has = topics.includes(slug);
    const next = has
      ? topics.filter((t) => t !== slug)
      : [...topics.filter((t) => t !== "football"), slug];
    persistTopics(next);
  }

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
      await waitForActive(reg);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      subRef.current = sub;
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), topics, ua: navigator.userAgent }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("subscribed");
    } catch {
      setError("Couldn't turn on alerts. Make sure notifications aren't blocked, then try again.");
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
      subRef.current = null;
      setStatus("ready");
    } catch {
      setStatus("subscribed");
    }
  }

  const showPicker = status === "ready" || status === "subscribed" || status === "working";

  return (
    <div className="max-w-md mx-auto px-4 py-10 space-y-6">
      <header className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 grid place-items-center shadow-lg shadow-emerald-500/25">
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor" aria-hidden="true">
            <path d="M12 2a1 1 0 0 1 1 1v.6a6 6 0 0 1 5 5.9v3.2l1.7 2.6a1 1 0 0 1-.84 1.55H5.14a1 1 0 0 1-.84-1.55L6 12.7V9.5a6 6 0 0 1 5-5.9V3a1 1 0 0 1 1-1Zm0 20a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 22Z" />
          </svg>
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900">Never miss a goal</h1>
        <p className="text-[14px] text-gray-500 leading-relaxed">
          Get a buzz the moment the ball hits the net — even with the site closed.
          Free, no sign-up, and off whenever you like.
        </p>
      </header>

      {status === "checking" && (
        <p className="text-center text-sm text-gray-400">Checking your device…</p>
      )}

      {showPicker && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">What do you want alerts for?</h2>
            {topics.length === 0 && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                All sports
              </span>
            )}
          </div>
          <p className="text-[12px] text-gray-400 -mt-2">
            Pick your sports, or leave them all off to get every match.
          </p>

          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <Pill
                key={s.slug}
                active={s.slug === "football" ? footballAll : topics.includes(s.slug)}
                onClick={() => toggleSport(s.slug)}
              >
                {s.label}
              </Pill>
            ))}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setFootballOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700"
            >
              {footballOpen ? "Hide" : "Or pick"} football leagues
              <svg
                className={`w-3.5 h-3.5 transition-transform ${footballOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {footballOpen && (
              <div className="mt-3 flex flex-wrap gap-2">
                {FOOTBALL_COMPS.map((c) => (
                  <Pill key={c.slug} small active={topics.includes(c.slug)} onClick={() => toggleComp(c.slug)}>
                    {c.label}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {status === "ready" && (
        <button
          onClick={enable}
          className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-[15px] shadow-lg shadow-emerald-600/25 transition-colors"
        >
          Turn on alerts
        </button>
      )}

      {status === "working" && (
        <button disabled className="w-full py-3.5 rounded-2xl bg-emerald-600/60 text-white font-bold text-[15px]">
          Turning on…
        </button>
      )}

      {status === "subscribed" && (
        <div className="space-y-3">
          <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[15px] text-center flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            Alerts are on
          </div>
          <button
            onClick={disable}
            className="w-full py-2.5 rounded-xl text-gray-500 hover:text-gray-700 text-[13px] font-semibold"
          >
            Turn off alerts
          </button>
        </div>
      )}

      {status === "blocked" && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-amber-800 leading-relaxed">
          Notifications are switched off for this site. Turn them back on for PrimePitch
          in your browser settings, then reload this page.
        </div>
      )}

      {status === "unsupported" && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 text-[13px] text-gray-600 leading-relaxed">
          This browser can&rsquo;t do push alerts. Try Chrome on Android or desktop, or use our app.
        </div>
      )}

      {status === "ios" && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="text-[15px] font-bold text-gray-900">Two taps to set up on iPhone</h2>
          <IosGuide />
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Apple only allows alerts once a site is saved to your home screen — so this step
            is one-time.
          </p>
        </section>
      )}

      {error && <p className="text-center text-[13px] text-red-600">{error}</p>}

      {/* Always-available iPhone help for everyone else */}
      {status !== "ios" && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setIosOpen((v) => !v)}
            className="text-[12px] font-semibold text-gray-400 hover:text-gray-600"
          >
            On an iPhone? Setup steps {iosOpen ? "▲" : "▼"}
          </button>
          {iosOpen && (
            <div className="mt-3 text-left rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <IosGuide />
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[12px] text-gray-400">
        Turn alerts off any time — here or in your browser settings.
      </p>
    </div>
  );
}
