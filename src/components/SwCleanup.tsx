"use client";

import { useEffect } from "react";

// Removes a stale third-party ad-network service worker that was registered at
// the site root (/sw.js) and could break the whole site in regions where that
// ad domain is blocked. Leaves the site's own push worker (/alerts/sw.js) alone.
export default function SwCleanup() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const reg of regs) {
          const url =
            reg.active?.scriptURL ||
            reg.waiting?.scriptURL ||
            reg.installing?.scriptURL ||
            "";
          // Kill only the root ad worker (/sw.js); keep the push worker (/alerts/sw.js).
          if (url.endsWith("/sw.js") && !url.includes("/alerts/")) {
            reg.unregister().catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
