/**
 * De assistent-PWA is verhuisd naar https://apps.imetech.nl/assistent/ (november 2026).
 * Deze service worker bewaart niets meer: hij gooit de oude cache weg, zegt het abonnement op meldingen op, meldt
 * zichzelf af en laadt open vensters opnieuw, zodat iedereen de doorverwijzing in index.html ziet.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const naam of await caches.keys()) await caches.delete(naam);
    try { const abo = await self.registration.pushManager.getSubscription(); if (abo) await abo.unsubscribe(); } catch (_) {}
    await self.registration.unregister();
    for (const venster of await self.clients.matchAll({ type: "window" })) venster.navigate(venster.url);
  })());
});
