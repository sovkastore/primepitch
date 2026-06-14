"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Public VAPID key — safe in the browser. Private key stays server-side.
const VAPID_PUBLIC =
  "BJAtbwmAROyuFpfNhPIVwZAfVOAF6AMHKfuac7GtxAfRGHNoKr_ZLniCsL3xfinHOK-7Nu-DRSdttIQ5Sx-OOPw";
const SW_URL = "/alerts/sw.js";
const PREFS_KEY = "pp_prefs";

type Status =
  | "checking"
  | "unsupported"
  | "ios"
  | "ready"
  | "subscribed"
  | "blocked"
  | "working";

type AlertKey = "startingSoon" | "kickoff" | "goal" | "halftime" | "fulltime";
type Alerts = Record<AlertKey, boolean>;
type Prefs = { wcAll: boolean; countries: string[]; alerts: Alerts };

const DEFAULT_PREFS: Prefs = {
  wcAll: true,
  countries: [],
  alerts: { startingSoon: true, kickoff: true, goal: true, halftime: false, fulltime: true },
};

const ALERT_ROWS: { key: AlertKey; label: string; desc: string; icon: (c: string) => ReactNode }[] = [
  { key: "startingSoon", label: "Starting soon", desc: "About 15 minutes before kick-off", icon: (c) => <ClockIcon className={c} /> },
  { key: "kickoff", label: "Kicked off", desc: "The moment the match goes live", icon: (c) => <FlagIcon className={c} /> },
  { key: "goal", label: "Goals", desc: "Every goal, with the new score", icon: (c) => <BallIcon className={c} /> },
  { key: "halftime", label: "Half-time", desc: "Score at the break", icon: (c) => <PauseIcon className={c} /> },
  { key: "fulltime", label: "Full-time", desc: "Final result", icon: (c) => <WhistleIcon className={c} /> },
];

/* ---------- icons (line SVGs, no emoji) ---------- */
function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a1 1 0 0 1 1 1v.6a6 6 0 0 1 5 5.9v3.2l1.7 2.6a1 1 0 0 1-.84 1.55H5.14a1 1 0 0 1-.84-1.55L6 12.7V9.5a6 6 0 0 1 5-5.9V3a1 1 0 0 1 1-1Zm0 20a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 22Z" />
    </svg>
  );
}
function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a1 1 0 0 1 1 1c0 2.2-1.6 3.8-3.5 4M7 5H4.5a1 1 0 0 0-1 1c0 2.2 1.6 3.8 3.5 4" />
      <path d="M12 13v3M9 20h6M10 20c0-1.5.5-2.5 2-2.5s2 1 2 2.5" />
    </svg>
  );
}
function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function FlagIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5" />
    </svg>
  );
}
function BallIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3.2 2.3-1.2 3.7h-4L8.8 9.3 12 7Z" />
      <path d="M12 7V4m2.8 9-2.8 2-2.8-2m6-3.5 2.6-1M7.4 8.5l-2.6-1" />
    </svg>
  );
}
function PauseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}
function WhistleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-1H3v1Z" /><path d="M14 12V9h7M9 5v3" />
    </svg>
  );
}
function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" />
    </svg>
  );
}
function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* ---------- web push helpers ---------- */
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

/* ---------- small UI pieces ---------- */
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-gray-300"}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function CountryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold border transition-colors ${
        active
          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/20"
          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function IosSteps() {
  const steps: ReactNode[] = [
    <>Open <b>xellnetwork.xyz</b> in <b>Safari</b>.</>,
    <>Tap the <b>Share</b> button (the square with an up-arrow).</>,
    <>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</>,
    <>Open PrimePitch from the new <b>home-screen icon</b>, then turn on alerts here.</>,
  ];
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-bold grid place-items-center">{i + 1}</span>
          <span className="text-[13px] text-gray-600 leading-relaxed pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- page ---------- */
export default function SubscribePage() {
  const [status, setStatus] = useState<Status>("checking");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [countryList, setCountryList] = useState<string[]>([]);
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [error, setError] = useState("");
  const subRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      // restore saved choices
      try {
        const saved = localStorage.getItem(PREFS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<Prefs>;
          if (alive && parsed && typeof parsed === "object") {
            setPrefs({
              wcAll: parsed.wcAll !== false,
              countries: Array.isArray(parsed.countries) ? parsed.countries.filter((c): c is string => typeof c === "string") : [],
              alerts: { ...DEFAULT_PREFS.alerts, ...(parsed.alerts || {}) },
            });
          }
        }
      } catch {
        /* ignore */
      }

      // device / permission state
      if (alive) {
        if (isIos() && !isStandalone()) {
          setStatus("ios");
        } else {
          const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
          if (!supported) {
            setStatus("unsupported");
          } else if (Notification.permission === "denied") {
            setStatus("blocked");
          } else {
            try {
              const reg = await navigator.serviceWorker.getRegistration(SW_URL);
              const sub = (await reg?.pushManager.getSubscription()) ?? null;
              subRef.current = sub;
              if (alive) setStatus(sub ? "subscribed" : "ready");
            } catch {
              if (alive) setStatus("ready");
            }
          }
        }
      }

      // country list from the live World Cup feed
      try {
        const res = await fetch("/api/world-cup");
        const data = (await res.json()) as { fixtures?: Array<{ home?: { country?: string }; away?: { country?: string } }> };
        const set = new Set<string>();
        for (const f of data.fixtures ?? []) {
          if (f?.home?.country) set.add(f.home.country);
          if (f?.away?.country) set.add(f.away.country);
        }
        if (alive) setCountryList([...set].filter(Boolean).sort());
      } catch {
        /* country picker just stays hidden */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  function persist(next: Prefs) {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (subRef.current) {
      fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subRef.current.toJSON(), prefs: next, ua: navigator.userAgent }),
      }).catch(() => {});
    }
  }

  function setWcAll(on: boolean) {
    persist({ ...prefs, wcAll: on, countries: on ? [] : prefs.countries });
  }
  function toggleCountry(name: string) {
    const has = prefs.countries.includes(name);
    const countries = has ? prefs.countries.filter((c) => c !== name) : [...prefs.countries, name];
    // Choosing a country means "just these", so the all-matches switch turns off.
    persist({ ...prefs, wcAll: false, countries });
  }
  function toggleAlert(key: AlertKey) {
    persist({ ...prefs, alerts: { ...prefs.alerts, [key]: !prefs.alerts[key] } });
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
        body: JSON.stringify({ subscription: sub.toJSON(), prefs, ua: navigator.userAgent }),
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

  const showSettings = status !== "checking" && status !== "unsupported";
  const nothingFollowed = !prefs.wcAll && prefs.countries.length === 0;

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <header className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 grid place-items-center shadow-lg shadow-emerald-500/25">
          <BellIcon className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900">World Cup match alerts</h1>
        <p className="text-[14px] text-gray-500 leading-relaxed">
          Kick-offs, goals and full-time on your phone — even with the site closed. Free, no sign-up, off whenever you like.
        </p>
      </header>

      {status === "checking" && <p className="text-center text-sm text-gray-400">Checking your device…</p>}

      {/* STEP 1 — how to switch on, shown for both phone types on load */}
      {status !== "checking" && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-400">Step 1 — switch on alerts</h2>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <PhoneIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[14px] font-bold text-gray-900">On Android or computer (Chrome)</h3>
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed">Tap <b>Turn on alerts</b> below and choose <b>Allow</b> on the popup. That&rsquo;s it.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <PhoneIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[14px] font-bold text-gray-900">On iPhone or iPad</h3>
              </div>
              <IosSteps />
              <p className="text-[12px] text-gray-400 leading-relaxed mt-2">Apple only allows alerts after a site is saved to the home screen — this is one-time.</p>
            </div>
          </div>

          {status === "ready" && (
            <button onClick={enable} className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-[15px] shadow-lg shadow-emerald-600/25 transition-colors">
              Turn on alerts
            </button>
          )}
          {status === "working" && (
            <button disabled className="w-full py-3.5 rounded-2xl bg-emerald-600/60 text-white font-bold text-[15px]">Turning on…</button>
          )}
          {status === "subscribed" && (
            <div className="space-y-2">
              <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[15px] text-center flex items-center justify-center gap-2">
                <CheckIcon className="w-5 h-5" /> Alerts are on
              </div>
              <button onClick={disable} className="w-full py-2 rounded-xl text-gray-500 hover:text-gray-700 text-[13px] font-semibold">Turn off alerts</button>
            </div>
          )}
          {status === "ios" && (
            <p className="text-center text-[13px] text-gray-500">Follow the iPhone steps above — the <b>Turn on alerts</b> button appears once you open PrimePitch from your home screen.</p>
          )}
          {status === "blocked" && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-amber-800 leading-relaxed">Notifications are switched off for this site. Turn them back on for PrimePitch in your browser settings, then reload.</div>
          )}
          {error && <p className="text-center text-[13px] text-red-600">{error}</p>}
        </section>
      )}

      {status === "unsupported" && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 text-[13px] text-gray-600 leading-relaxed">This browser can&rsquo;t do push alerts. Try Chrome on Android or desktop, or use our app.</div>
      )}

      {/* STEP 2 — what to follow */}
      {showSettings && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-400">Step 2 — what to follow</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center text-emerald-600"><TrophyIcon className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-gray-900 leading-tight">FIFA World Cup 2026</p>
                <p className="text-[12px] text-gray-500">All matches — every country playing</p>
              </div>
              <Toggle on={prefs.wcAll} onClick={() => setWcAll(!prefs.wcAll)} label="Follow all World Cup matches" />
            </div>

            {countryList.length > 0 && (
              <div className="p-4">
                <button type="button" onClick={() => setCountriesOpen((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-bold text-emerald-700">
                  Or follow specific countries
                  <svg className={`w-3.5 h-3.5 transition-transform ${countriesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {countriesOpen && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {countryList.map((c) => (
                      <CountryChip key={c} active={prefs.countries.includes(c)} onClick={() => toggleCountry(c)}>{c}</CountryChip>
                    ))}
                  </div>
                )}
                {prefs.countries.length > 0 && (
                  <p className="mt-3 text-[12px] text-gray-500">Following: <b className="text-gray-700">{prefs.countries.join(", ")}</b></p>
                )}
              </div>
            )}
          </div>
          {nothingFollowed && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Pick at least one country, or turn <b>All matches</b> back on — otherwise you won&rsquo;t get any alerts.</p>
          )}
        </section>
      )}

      {/* STEP 3 — which alerts */}
      {showSettings && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-400">Step 3 — which alerts</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {ALERT_ROWS.map((row) => (
              <div key={row.key} className="flex items-center gap-3 p-4">
                <span className="shrink-0 w-10 h-10 rounded-xl bg-gray-50 grid place-items-center text-gray-500">{row.icon("w-5 h-5")}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 leading-tight">{row.label}</p>
                  <p className="text-[12px] text-gray-500">{row.desc}</p>
                </div>
                <Toggle on={prefs.alerts[row.key]} onClick={() => toggleAlert(row.key)} label={row.label} />
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-[12px] text-gray-400">Turn alerts off any time — here or in your browser settings.</p>
    </div>
  );
}
