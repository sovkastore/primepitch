// Client-side Web Push helpers, shared by the subscribe page and the per-match
// "Notify me" button. Same VAPID key, same service worker, same key extraction
// as the subscribe flow — so a device ends up with one subscription either way.

const VAPID_PUBLIC =
  "BJAtbwmAROyuFpfNhPIVwZAfVOAF6AMHKfuac7GtxAfRGHNoKr_ZLniCsL3xfinHOK-7Nu-DRSdttIQ5Sx-OOPw";
const SW_URL = "/alerts/sw.js";

export type PushKeys = { endpoint: string; p256dh: string; auth: string };
export type EnsureResult = PushKeys | "unsupported" | "blocked";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function waitForActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return;
  const sw = reg.installing || reg.waiting;
  if (!sw) return;
  await new Promise<void>((resolve) => {
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") resolve();
    });
    setTimeout(resolve, 8000);
  });
}

function toKeys(sub: PushSubscription): PushKeys | null {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

// Prompts for permission (if needed), registers the SW, and returns the push
// keys. Returns "unsupported" or "blocked" instead of throwing for the common
// cases so callers can show a friendly state.
export async function ensurePushSubscription(): Promise<EnsureResult> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof window === "undefined" ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";

  const reg = await navigator.serviceWorker.register(SW_URL);
  await waitForActive(reg);
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    }));
  const keys = toKeys(sub);
  return keys ?? "unsupported";
}

// Returns the device's current push keys without prompting, or null.
export async function getExistingPush(): Promise<PushKeys | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = (await reg?.pushManager.getSubscription()) ?? null;
    return sub ? toKeys(sub) : null;
  } catch {
    return null;
  }
}

// iPhone / iPad (incl. iPadOS reporting as Mac with touch).
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// True only when the page is running as an installed app (opened from the
// Home Screen icon). On iOS this is the only context where push can work.
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

// iPhone/iPad sitting in a normal browser tab — push will NOT work here; these
// users need the install path on the dedicated page.
export function isIosBrowserTab(): boolean {
  return isIos() && !isStandalone();
}
