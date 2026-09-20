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
  herinnering(id) { return this.call(`/items/${id}/concept`, { method: "POST" }); },
  chat(tekst) { return this.call("/chat", { method: "POST", body: { tekst } }); },
  chatGeschiedenis() { return this.call("/chat"); },
  vapid() { return this.call("/push/vapid"); },
  abonneer(abonnement, apparaat) { return this.call("/push/abonneer", { method: "POST", body: { abonnement, apparaat } }); },
  pushTest() { return this.call("/push/test", { method: "POST" }); },
  verzamel(model = false) { return this.call("/run/verzamel?model=" + model, { method: "POST" }); },
  opdrachten() { return this.call("/opdrachten"); },
  opdrachtAnnuleer(id) { return this.call(`/opdrachten/${id}/annuleer`, { method: "POST" }); },
  opdrachtGezien(id) { return this.call(`/opdrachten/${id}/gezien`, { method: "POST" }); },
  wbso(jaar) { return this.call("/instellingen/wbso" + (jaar ? "?jaar=" + jaar : "")); },
  wbsoZet(jaar, projecten) { return this.call("/instellingen/wbso", { method: "POST", body: { jaar, projecten } }); },
  briefing(soort) { return this.call("/run/briefing/" + soort, { method: "POST" }); },
  verbruik(dagen = 14) { return this.call("/verbruik?dagen=" + dagen); },
  verbruikGrens(tokens_week) { return this.call("/verbruik/grens", { method: "POST", body: { tokens_week } }); },
};
