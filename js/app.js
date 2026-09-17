/* Schermen en interactie. Alles wat data is komt van de backend; hier staat niets gevoeligs. */
const App = {
  tab: "vandaag",
  cache: {},

  init() {
    document.querySelectorAll(".bottom-nav button").forEach(b => b.addEventListener("click", () => this.ga(b.dataset.tab)));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e));
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data && e.data.type === "vernieuw") this.render();
        if (e.data && e.data.type === "open_item") { this.ga("open"); }
      });
    }
    this.laadThema();
    this.installBanner();
    const params = new URLSearchParams(location.search);
    if (params.get("tab")) this.tab = params.get("tab");
    this.ga(this.tab);
    this.checkStatus();
  },

  ga(tab) {
    this.tab = tab;
    document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("actief", b.dataset.tab === tab));
    this.render();
  },

  toast(t, fout = false) {
    const el = document.getElementById("toast");
    el.textContent = t; el.className = "toast zichtbaar" + (fout ? " fout" : "");
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.className = "toast", 3500);
  },

  async checkStatus() {
    const el = document.getElementById("status");
    try {
      const s = await Api.status();
      const problemen = [];
      if (!s.graph_gekoppeld) problemen.push("Microsoft niet gekoppeld");
      if (!s.claude.oauth_token && !s.claude.api_key) problemen.push("Claude niet gekoppeld");
      if (!s.push.vapid) problemen.push("push niet ingesteld");
      el.className = "sub" + (problemen.length ? " error" : "");
      el.textContent = problemen.length ? problemen.join(", ") : `Verbonden · ${s.open_items} open · bijgewerkt ${s.scheduler.laatste_verzamel ? tijdNl(s.scheduler.laatste_verzamel) : "nog niet"}`;
      this.cache.status = s;
    } catch (e) {
      el.className = "sub error"; el.textContent = "Geen verbinding: " + e.message;
    }
  },

  laadThema() {
    let aan = false;
    try { aan = localStorage.getItem("imtech-assistent-dark") === "1"; } catch (_) {}
    this.zetThema(aan);
  },
  zetThema(aan) {
    document.documentElement.dataset.theme = aan ? "dark" : "";
    const meta = document.getElementById("meta-theme-color"); if (meta) meta.content = aan ? "#121210" : "#2563EB";
    const logo = document.getElementById("header-logo"); if (logo) logo.src = aan ? "branding/logo-wit.png" : "branding/logo-zwart.png";
    try { localStorage.setItem("imtech-assistent-dark", aan ? "1" : "0"); } catch (_) {}
  },
  installBanner() {
    const banner = document.getElementById("install-banner");
    let prompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); prompt = e;
      try { if (localStorage.getItem("imtech-assistent-install-later") === "1") return; } catch (_) {}
      banner.classList.remove("hidden");
    });
    document.getElementById("btn-install").addEventListener("click", async () => { banner.classList.add("hidden"); if (prompt) { prompt.prompt(); prompt = null; } });
    document.getElementById("btn-install-dismiss").addEventListener("click", () => { banner.classList.add("hidden"); try { localStorage.setItem("imtech-assistent-install-later", "1"); } catch (_) {} });
  },

  async render() {
    const m = document.getElementById("scherm");
    try {
      if (this.tab === "vandaag") await this.rVandaag(m);
      else if (this.tab === "open") await this.rOpen(m);
      else if (this.tab === "praten") await this.rPraten(m);
      else await this.rInstellingen(m);
    } catch (e) {
      m.innerHTML = `<div class="card fout"><b>Kan de assistent niet bereiken</b><p>${esc(e.message)}</p><p>Controleer adres en token bij Instellingen.</p></div>`;
    }
  },

  // ---------- Vandaag ----------
  async rVandaag(m) {
    const v = await Api.vandaag();
    this.cache.vandaag = v;
    document.getElementById("badge").textContent = v.aantal_open || "";
    const ag = v.agenda, afspraken = ag.afspraken || [];
    const uren = (ag.uren_bezet || 0).toFixed(1).replace(".0", "");
    m.innerHTML = `
      <section class="card">
        <div class="kop"><b>${datumNl(v.datum)}</b><span class="tag ${v.dag_vol ? "rood" : "groen"}">${v.dag_vol ? "dag zit vol" : uren + " uur bezet"}</span></div>
        ${afspraken.length ? `<ul class="agenda">${afspraken.map(a => `<li><span class="tijd">${a.hele_dag ? "hele dag" : a.van + "–" + a.tot}</span> ${esc(a.titel)}${a.locatie ? ` <small>${esc(a.locatie)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="stil">Geen afspraken vandaag.</p>`}
        ${(v.morgen.afspraken || []).length ? `<p class="stil">Morgen: ${v.morgen.afspraken.length} afspraken, ${(v.morgen.uren_bezet || 0).toFixed(1).replace(".0", "")} uur.</p>` : ""}
      </section>
      <h2>Nu belangrijk</h2>
      ${v.top.length ? v.top.map(it => this.itemKaart(it)).join("") : `<p class="stil">Niets dringends. ${v.aantal_open ? v.aantal_open + " open punten in het tabblad Open." : ""}</p>`}
      ${v.uren && v.uren.ontbrekend && v.uren.ontbrekend.length ? `<p class="stil">Uren nog niet ingevuld: ${v.uren.ontbrekend.map(datumKort).join(", ")}</p>` : ""}
      ${v.laatste_meldingen.length ? `<h2>Laatste meldingen</h2>${v.laatste_meldingen.map(n => `<div class="melding"><b>${esc(n.titel)}</b><div>${esc(n.body).replace(/\n/g, "<br>")}</div><small>${tijdNl(n.verstuurd_at)}</small></div>`).join("")}` : ""}
    `;
    this.bindActies(m);
  },

  itemKaart(it, uitgebreid = false) {
    const due = it.due_at ? `<span class="tag ${dueKleur(it.due_at)}">${datumKort(it.due_at)}</span>` : "";
    return `<div class="item" data-id="${it.id}">
      <div class="itemkop">
        <span class="prio p${Math.min(4, Math.floor((it.prio_score || 0) / 25))}" title="prio ${it.prio_score}"></span>
        <div class="tekst"><b>${esc(it.titel)}</b>
          <div class="sub">${it.project ? esc(it.project) + " · " : ""}${esc(it.categorie)}${it.prio_reden ? " · " + esc(it.prio_reden) : ""} ${due}</div>
          ${uitgebreid && it.omschrijving ? `<div class="omschr">${esc(it.omschrijving)}</div>` : ""}
          ${uitgebreid && it.meta && it.meta.link ? `<a href="${esc(it.meta.link)}" target="_blank" rel="noopener">open in Outlook</a>` : ""}
        </div>
      </div>
      <div class="acties">
        <button data-actie="done">Gedaan</button>
        <button data-actie="snooze" data-tot="morgen">Morgen</button>
        <button data-actie="snooze" data-tot="volgende_week">Volgende week</button>
        <button data-actie="dismiss" class="zacht">Negeer</button>
      </div>
    </div>`;
  },

  bindActies(root) {
    root.querySelectorAll(".item .acties button").forEach(b => b.addEventListener("click", async () => {
      const kaart = b.closest(".item"), id = kaart.dataset.id;
      kaart.classList.add("weg");
      try {
        await Api.actie(id, b.dataset.actie, { tot: b.dataset.tot });
        this.toast({ done: "Afgevinkt", snooze: "Uitgesteld", dismiss: "Genegeerd" }[b.dataset.actie]);
        setTimeout(() => this.render(), 350);
      } catch (e) { kaart.classList.remove("weg"); this.toast(e.message, true); }
    }));
  },

  // ---------- Open ----------
  async rOpen(m) {
    const filter = this.cache.filter || "open";
    const d = await Api.items(filter === "open" ? "open" : filter === "later" ? "snoozed" : "done,dismissed");
    document.getElementById("badge").textContent = filter === "open" ? (d.items.length || "") : document.getElementById("badge").textContent;
    const projecten = [...new Set(d.items.map(i => i.project).filter(Boolean))].sort();
    const pf = this.cache.project || "";
    const items = pf ? d.items.filter(i => i.project === pf) : d.items;
    m.innerHTML = `
      <div class="filters">
        ${["open", "later", "klaar"].map(f => `<button class="chip ${filter === f ? "actief" : ""}" data-filter="${f}">${f}</button>`).join("")}
        ${projecten.length ? `<select id="projectfilter"><option value="">alle projecten</option>${projecten.map(p => `<option ${p === pf ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
      </div>
      <form id="nieuw" class="nieuw"><input name="titel" placeholder="Nieuw punt, bijv. 'WBSO aanvraag afmaken 30 sept'" autocomplete="off"><button>+</button></form>
      ${items.length ? items.map(it => this.itemKaart(it, true)).join("") : `<p class="stil">Niets hier.</p>`}
    `;
    m.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => { this.cache.filter = c.dataset.filter; this.render(); }));
    const sel = m.querySelector("#projectfilter");
    if (sel) sel.addEventListener("change", () => { this.cache.project = sel.value; this.render(); });
    m.querySelector("#nieuw").addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = e.target.titel.value.trim();
      if (!t) return;
      try {
        // Vrije tekst gaat via chat zodat Claude datum en categorie eruit haalt
        const r = await Api.chat("Nieuw punt: " + t);
        this.toast(r.antwoord || "Toegevoegd");
        e.target.reset(); this.render();
      } catch (err) { this.toast(err.message, true); }
    });
    this.bindActies(m);
  },

  // ---------- Praten ----------
  async rPraten(m) {
    const g = await Api.chatGeschiedenis().catch(() => ({ berichten: [] }));
    m.innerHTML = `
      <div id="gesprek" class="gesprek">${g.berichten.map(b => `<div class="bel ${b.rol}">${esc(b.tekst)}</div>`).join("") || `<p class="stil">Vraag iets ("wat staat er open bij uMotion?") of geef iets door ("de offerte is verstuurd").</p>`}</div>
      <form id="vraag" class="vraagbalk">
        <button type="button" id="mic" class="mic" title="inspreken" aria-label="Inspreken">🎤</button>
        <input name="tekst" placeholder="Typ of spreek in…" autocomplete="off">
        <button>Stuur</button>
      </form>`;
    const gesprek = m.querySelector("#gesprek"); gesprek.scrollTop = gesprek.scrollHeight;
    const form = m.querySelector("#vraag"), input = form.tekst, mic = m.querySelector("#mic");
    const stuur = async (tekst) => {
      if (!tekst) return;
      gesprek.insertAdjacentHTML("beforeend", `<div class="bel user">${esc(tekst)}</div><div class="bel assistant wacht">…</div>`);
      gesprek.scrollTop = gesprek.scrollHeight; input.value = "";
      try {
        const r = await Api.chat(tekst);
        gesprek.lastElementChild.outerHTML = `<div class="bel assistant">${esc(r.antwoord)}${r.acties.length ? `<div class="sub">${r.acties.map(a => esc(a.actie + ": " + a.titel)).join("<br>")}</div>` : ""}</div>`;
        const inst = await Opslag.instellingen();
        if (inst.stem !== false) Spraak.zeg(r.antwoord);
      } catch (e) { gesprek.lastElementChild.outerHTML = `<div class="bel assistant fout">${esc(e.message)}</div>`; }
      gesprek.scrollTop = gesprek.scrollHeight;
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); stuur(input.value.trim()); });
    if (!Spraak.kanLuisteren()) mic.disabled = true;
    mic.addEventListener("click", () => {
      if (mic.classList.contains("aan")) { Spraak.stop(); return; }
      Spraak.stil(); mic.classList.add("aan");
      Spraak.luister((t) => { input.value = t; }, (eind) => { mic.classList.remove("aan"); if (eind) stuur(eind); }, (f) => { mic.classList.remove("aan"); this.toast("Spraak: " + f, true); });
    });
  },

  // ---------- Instellingen ----------
  async rInstellingen(m) {
    const c = await Opslag.instellingen();
    const s = this.cache.status;
    const perm = ("Notification" in window) ? Notification.permission : "n.v.t.";
    m.innerHTML = `
      <form id="inst" class="card">
        <label>Adres van de assistent<input name="adres" value="${esc(c.adres)}" placeholder="https://assistant.imetech.nl" inputmode="url"></label>
        <label>Token<input name="token" value="${esc(c.token)}" type="password" autocomplete="off"></label>
        <label class="check-row"><input type="checkbox" name="stem" ${c.stem !== false ? "checked" : ""}> Antwoorden voorlezen</label>
        <label class="check-row"><input type="checkbox" id="toggle-dark-mode" ${document.documentElement.dataset.theme === "dark" ? "checked" : ""}> Donkere modus</label>
        <div class="rij"><button class="btn-primary">Opslaan en testen</button></div>
      </form>
      <section class="card">
        <b>Meldingen</b>
        <p class="stil">Toestemming: ${perm}. ${s ? `Push op server: ${s.push.vapid ? "ingesteld" : "niet ingesteld"}, ${s.push.abonnementen} apparaat/apparaten.` : ""}</p>
        <div class="rij"><button id="abonneer" class="btn-primary">Meldingen aanzetten op dit toestel</button><button id="pushtest" class="zacht">Testmelding</button></div>
      </section>
      <section class="card">
        <b>Status</b>
        ${s ? `<ul class="status-lijst">
          <li>Microsoft (agenda, mail, OneDrive): ${s.graph_gekoppeld ? "gekoppeld" : "niet gekoppeld"}</li>
          <li>Claude: ${s.claude.oauth_token ? "abonnement" : s.claude.api_key ? "API-key" : "niet gekoppeld"}${s.claude.cli ? "" : " (CLI ontbreekt)"}</li>
          <li>Laatste verzamelronde: ${s.scheduler.laatste_verzamel ? tijdNl(s.scheduler.laatste_verzamel) : "nog niet"}</li>
          <li>Laatste triage (met Claude): ${s.scheduler.laatste_triage ? tijdNl(s.scheduler.laatste_triage) : "nog niet"}</li>
          ${s.scheduler.fouten.length ? `<li class="fout">Fouten: ${s.scheduler.fouten.map(esc).join("; ")}</li>` : ""}
        </ul>` : `<p class="stil">Nog geen verbinding.</p>`}
        <div class="rij"><button id="verzamel" class="zacht">Nu verzamelen</button><button id="triage" class="zacht">Verzamelen + triage</button><button id="briefing" class="zacht">Ochtendbriefing nu</button></div>
      </section>`;
    m.querySelector("#inst").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      await Opslag.set("instellingen", { adres: f.adres.value.trim(), token: f.token.value.trim(), stem: f.stem.checked });
      try { await Api.status(); this.toast("Verbonden"); await this.checkStatus(); this.render(); } catch (err) { this.toast(err.message, true); }
    });
    m.querySelector("#toggle-dark-mode").addEventListener("change", (e) => this.zetThema(e.target.checked));
    m.querySelector("#abonneer").addEventListener("click", () => this.abonneer());
    m.querySelector("#pushtest").addEventListener("click", async () => { try { const r = await Api.pushTest(); this.toast(`Verstuurd naar ${r.verstuurd} toestel(len)`); } catch (e) { this.toast(e.message, true); } });
    m.querySelector("#verzamel").addEventListener("click", async () => { this.toast("Bezig…"); try { const r = await Api.verzamel(false); this.toast(`Klaar: ${r.direct || 0} direct, ${r.afgerond || 0} afgerond`); await this.checkStatus(); this.render(); } catch (e) { this.toast(e.message, true); } });
    m.querySelector("#triage").addEventListener("click", async () => { this.toast("Bezig, kan een minuut duren…"); try { const r = await Api.verzamel(true); this.toast(`Klaar: ${r.nieuw || 0} nieuw, ${r.update || 0} bijgewerkt, ${r.afgerond || 0} afgerond`); await this.checkStatus(); this.render(); } catch (e) { this.toast(e.message, true); } });
    m.querySelector("#briefing").addEventListener("click", async () => { try { const r = await Api.briefing("ochtend"); this.toast(r.titel || "Verstuurd"); } catch (e) { this.toast(e.message, true); } });
  },

  async abonneer() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push niet beschikbaar in deze browser");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Geen toestemming voor meldingen");
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await Api.vapid();
      if (!publicKey) throw new Error("Server heeft nog geen VAPID-sleutel");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      await Api.abonneer(sub.toJSON(), navigator.userAgent.slice(0, 80));
      this.toast("Meldingen staan aan");
      await this.checkStatus(); this.render();
    } catch (e) { this.toast(e.message, true); }
  },
};

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function datumNl(iso) { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }); }
function datumKort(iso) { const d = new Date(iso.slice(0, 10) + "T12:00:00"); return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }); }
function tijdNl(iso) { const d = new Date(iso); return d.toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
function dueKleur(iso) { const dagen = Math.round((new Date(iso.slice(0, 10)) - new Date(new Date().toDateString())) / 864e5); return dagen < 0 ? "rood" : dagen <= 2 ? "oranje" : "grijs"; }
function b64ToU8(b64) { const p = "=".repeat((4 - b64.length % 4) % 4); const s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); }

window.addEventListener("DOMContentLoaded", () => App.init());
