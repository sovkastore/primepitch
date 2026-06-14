// PrimePitch alert service worker. Lives at /alerts/ scope so it never
// collides with the ad-network worker registered at the site root.
var TRACK_OPEN_URL = "https://lcahzqvrsqxievglvkib.supabase.co/functions/v1/track-open";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PrimePitch";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || undefined,
    actions: Array.isArray(data.actions) ? data.actions : undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(raw, self.location.origin).href;
  const targetPath = new URL(target).pathname;

  event.waitUntil(
    (async () => {
      // Record the open straight to Supabase (no Cloudflare hit). Simple request
      // (text/plain, no auth header) so there's no CORS preflight.
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          await fetch(TRACK_OPEN_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
            keepalive: true,
          }).catch(() => {});
        }
      } catch (e) {
        /* tracking is best-effort */
      }

      // Only reuse a tab that's already on the SAME page; otherwise open the
      // target fresh. (Matching loosely on "/" would focus any open tab — which
      // is what sent people to whatever page they had open.)
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        try {
          if (new URL(client.url).pathname === targetPath && "focus" in client) {
            return client.focus();
          }
        } catch (e) {
          /* ignore unparsable client url */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
