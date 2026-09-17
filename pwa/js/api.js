/* Verbinding met de backend op de Pi. */
const Api = {
  async _cfg() { return Opslag.instellingen(); },
  async call(pad, opties = {}) {
    const c = await this._cfg();
    if (!c.adres || !c.token) throw new Error("Vul eerst adres en token in bij Instellingen");
    const r = await fetch(c.adres.replace(/\/$/, "") + "/api" + pad, {
      method: opties.method || "GET",
      headers: { "Authorization": "Bearer " + c.token, "Content-Type": "application/json" },
      body: opties.body ? JSON.stringify(opties.body) : undefined,
    });
    if (!r.ok) {
      let t = r.statusText;
      try { t = (await r.json()).detail || t; } catch (_) {}
      throw new Error(r.status + ": " + t);
    }
    return r.json();
  },
  status() { return this.call("/status"); },
  vandaag() { return this.call("/vandaag"); },
  items(status = "open") { return this.call("/items?status=" + encodeURIComponent(status)); },
  nieuwItem(body) { return this.call("/items", { method: "POST", body }); },
  actie(id, actie, extra = {}) { return this.call(`/items/${id}/actie`, { method: "POST", body: { actie, ...extra } }); },
  chat(tekst) { return this.call("/chat", { method: "POST", body: { tekst } }); },
  chatGeschiedenis() { return this.call("/chat"); },
  vapid() { return this.call("/push/vapid"); },
  abonneer(abonnement, apparaat) { return this.call("/push/abonneer", { method: "POST", body: { abonnement, apparaat } }); },
  pushTest() { return this.call("/push/test", { method: "POST" }); },
  verzamel(model = false) { return this.call("/run/verzamel?model=" + model, { method: "POST" }); },
  briefing(soort) { return this.call("/run/briefing/" + soort, { method: "POST" }); },
};
