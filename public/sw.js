/*
 * PrimePitch service worker - intentionally neutralized.
 *
 * This path previously hosted a third-party ad-network push worker that loaded
 * remote code from an external ad domain. In regions where ISPs block that
 * domain, the worker failed and - because it sat at the site root - broke the
 * ENTIRE site for those users until removed.
 *
 * It now does nothing but remove itself and clear caches, so no stale ad worker
 * can hijack site navigation. The site's own push notifications use a SEPARATE
 * worker at /alerts/sw.js and are unaffected.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
    })()
  );
});
// No "fetch" handler on purpose: this worker must never intercept navigation.
