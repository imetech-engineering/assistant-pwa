/* Service worker: push-meldingen met actieknoppen, en offline de app-schil. */
importScripts("js/opslag.js");

const CACHE = "assistent-v5";
const SCHIL = ["./", "index.html", "manifest.json", "css/style.css", "js/opslag.js", "js/api.js", "js/spraak.js", "js/install.js", "js/app.js", "icons/icon-192.png", "icons/icon-512.png", "branding/logo-zwart.png", "branding/logo-wit.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;   // API-calls gaan direct naar de Pi
  e.respondWith(fetch(e.request).then(r => { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); return r; }).catch(() => caches.match(e.request)));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { titel: "Assistent", body: e.data ? e.data.text() : "" }; }
  const acties = d.acties ? [{ action: "done", title: "Gedaan" }, { action: "snooze", title: "Morgen" }] : [];
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.titel || "Assistent", {
      body: d.body || "", icon: "icons/icon-192.png", badge: "icons/badge-96.png",
      tag: d.item_id ? "item-" + d.item_id : d.soort || "info", renotify: !!d.item_id,
      data: d, actions: acties, vibrate: d.soort === "urgent" ? [120, 60, 120] : [80],
    }),
    self.clients.matchAll({ type: "window" }).then(cs => cs.forEach(c => c.postMessage({ type: "vernieuw" }))),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  if (e.action && d.item_id) {
    e.waitUntil(actie(d.item_id, e.action, d.melding_id));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const doel = new URL("./?tab=" + (d.item_id ? "open" : "vandaag"), self.registration.scope).href;
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.focus(); c.postMessage({ type: d.item_id ? "open_item" : "vernieuw", item_id: d.item_id }); return; }
    return self.clients.openWindow(doel);
  }));
});

async function actie(itemId, actie, meldingId) {
  const c = await Opslag.instellingen();
  if (!c.adres || !c.token) return;
  const body = { actie, melding_id: meldingId || null };
  if (actie === "snooze") body.tot = "morgen";
  try {
    await fetch(c.adres.replace(/\/$/, "") + `/api/items/${itemId}/actie`, {
      method: "POST", headers: { "Authorization": "Bearer " + c.token, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    await self.registration.showNotification(actie === "done" ? "Afgevinkt" : "Uitgesteld tot morgen", { icon: "icons/icon-192.png", tag: "bevestiging", silent: true });
    (await self.clients.matchAll({ type: "window" })).forEach(x => x.postMessage({ type: "vernieuw" }));
  } catch (e) {
    await self.registration.showNotification("Niet gelukt", { body: "Open de app en probeer opnieuw.", icon: "icons/icon-192.png", tag: "bevestiging" });
  }
}
