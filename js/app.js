/* IMeTech Assistent: schermen en interactie. Alle data komt van de backend; hier staat niets gevoeligs. */
const IC = (n) => `<svg class="ic" aria-hidden="true"><use href="#${n}"></use></svg>`;
const CAT_NAAM = { klantdeadline: "Klanten", geld: "Geld", administratie: "Administratie", intern: "Intern", prive: "Privé" };

const App = {
  tab: "assistent",
  project: null,          // geopend project in Overzicht
  cache: {},
  gesprek: [],            // [{rol, tekst}]
  laatsteViaSpraak: false,

  init() {
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.addEventListener("click", () => this.ga(b.dataset.tab)));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "vernieuw") this.render();
        if (e.data?.type === "open_item") { this.project = null; this.ga("overzicht"); }
      });
    }
    this.laadThema();
    Installatie.init((tab) => this.ga(tab));
    document.getElementById("toast-knop").addEventListener("click", () => this._toastActie?.());
    const params = new URLSearchParams(location.search);
    if (params.get("tab")) this.tab = params.get("tab");
    this.ga(this.tab);
    this.checkStatus();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { this.checkStatus(); this.render(); } });
    this.initTrekVernieuwen();
  },

  /* Naar beneden slepen bovenaan de lijst = vernieuwen, zoals in andere apps. */
  initTrekVernieuwen() {
    const main = document.getElementById("scherm"), ind = document.getElementById("ptr");
    const DREMPEL = 72; let startY = null, afstand = 0, bezig = false;
    const zet = (px) => { ind.style.height = px + "px"; ind.classList.toggle("klaar", px >= DREMPEL); ind.querySelector("span").textContent = px >= DREMPEL ? "Loslaten om te vernieuwen" : "Trek om te vernieuwen"; };
    main.addEventListener("touchstart", (e) => { startY = (main.scrollTop <= 0 && !bezig) ? e.touches[0].clientY : null; afstand = 0; }, { passive: true });
    main.addEventListener("touchmove", (e) => {
      if (startY === null) return;
      const d = e.touches[0].clientY - startY;
      if (d <= 0 || main.scrollTop > 0) { if (afstand) zet(0); afstand = 0; return; }
      afstand = Math.min(Math.pow(d, 0.85), 110); zet(afstand);
    }, { passive: true });
    const einde = async () => {
      if (startY === null) return; startY = null;
      if (afstand < DREMPEL) { zet(0); return; }
      bezig = true; ind.classList.add("bezig"); zet(56); ind.querySelector("span").textContent = "Ophalen bij de assistent…";
      try { navigator.vibrate?.(15); } catch (_) {}
      try { await this.vernieuw(); } finally { setTimeout(() => { ind.classList.remove("bezig", "klaar"); zet(0); bezig = false; }, 300); }
    };
    main.addEventListener("touchend", einde); main.addEventListener("touchcancel", einde);
  },

  /* Trekken: eerst een verzamelronde op de Pi (nieuwe mail, agenda, bestanden), dan het scherm. */
  async vernieuw() {
    try { await Api.verzamel(false); } catch (e) { this.toast(e.message, { fout: true }); }
    await Promise.all([this.checkStatus(), this.render()]);
  },

  ga(tab) {
    this.tab = tab;
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.toggle("actief", b.dataset.tab === tab));
    document.getElementById("kop").textContent = { assistent: "Assistent", overzicht: "Overzicht", instellingen: "Instellingen" }[tab] || "Assistent";
    this.render();
  },

  /* ---------- toast met ongedaan maken ---------- */
  toast(tekst, opties = {}) {
    const el = document.getElementById("toast"), knop = document.getElementById("toast-knop");
    document.getElementById("toast-tekst").textContent = tekst;
    el.classList.remove("hidden"); el.classList.toggle("fout", !!opties.fout);
    this._toastActie = opties.ongedaan || null;
    knop.classList.toggle("hidden", !opties.ongedaan);
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add("hidden"), opties.ongedaan ? 8000 : 3500);
    try { navigator.vibrate?.(opties.fout ? [40, 60, 40] : 25); } catch (_) {}
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
      el.textContent = problemen.length ? problemen.join(", ") : `${s.open_items} open punten · bijgewerkt ${s.scheduler.laatste_verzamel ? tijdNl(s.scheduler.laatste_verzamel) : "nog niet"}`;
      this.cache.status = s;
      document.getElementById("badge").textContent = s.open_items || "";
      try { if (navigator.setAppBadge) { s.urgent_items ? navigator.setAppBadge(s.urgent_items) : navigator.clearAppBadge(); } } catch (_) {}
    } catch (e) {
      el.className = "sub error"; el.textContent = "Geen verbinding met de assistent";
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

  async render() {
    const m = document.getElementById("scherm");
    try {
      if (this.tab === "assistent") await this.rAssistent(m);
      else if (this.tab === "overzicht") await (this.project ? this.rProject(m) : this.rOverzicht(m));
      else await this.rInstellingen(m);
    } catch (e) {
      m.innerHTML = `<div class="card fout"><b>Kan de assistent niet bereiken</b><p class="stil">${esc(e.message)}</p><p class="stil">Controleer adres en token bij Instellingen.</p></div>`;
    }
  },

  /* ============================ ASSISTENT ============================ */
  async rAssistent(m) {
    const v = await Api.vandaag();
    this.cache.vandaag = v;
    document.getElementById("badge").textContent = v.aantal_open || "";
    const ag = v.agenda, afspraken = ag.afspraken || [];
    const uren = (ag.uren_bezet || 0).toFixed(1).replace(".0", "");
    const naam = "Ivo";
    const uur = new Date().getHours();
    const groet = uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
    const nu = new Date().toTimeString().slice(0, 5);
    const voorbij = (a) => !a.hele_dag && a.tot && a.tot <= nu;
    const nog = afspraken.filter((a) => !voorbij(a));
    const eerstvolgende = nog.find((a) => !a.hele_dag && a.van > nu);
    const dringend = v.top.filter((i) => i.prio_score >= 80);
    const avond = uur >= 18;
    const morgen = (v.morgen && v.morgen.afspraken) || [];
    const n = (k) => `${k} afspra${k === 1 ? "ak" : "ken"}`;
    let zin;
    if (avond) zin = morgen.length ? `morgen ${n(morgen.length)}${v.morgen.uren_bezet >= 6 ? ", dat wordt een volle dag" : ""}` : "morgen geen afspraken";
    else if (!afspraken.length) zin = "geen afspraken vandaag";
    else if (!nog.length) zin = `de ${n(afspraken.length)} van vandaag ${afspraken.length === 1 ? "is" : "zijn"} geweest`;
    else if (nog.length < afspraken.length) zin = `nog ${n(nog.length)} vandaag`;
    else zin = v.dag_vol ? `je dag zit vol (${uren} uur agenda)` : `${n(afspraken.length)} vandaag, ${uren} uur`;
    if (!avond && eerstvolgende) zin += `, straks ${esc(eerstvolgende.titel)} om ${eerstvolgende.van}`;
    zin += ". " + (dringend.length ? `${dringend.length} ${dringend.length === 1 ? "punt vraagt" : "punten vragen"} aandacht.` : v.aantal_open ? `${v.aantal_open} open punten, niets dringends.` : "Niets open.");
    const lijst = avond ? morgen : afspraken;
    const lijstKop = avond ? `<p class="stil">Morgen</p>` : "";

    m.innerHTML = `
      <section class="card groet">
        <div class="groet-kop">${IC("ic-assistent")}<b>${groet}, ${naam}.</b></div>
        <p>${zin}</p>
        ${lijst.length ? `${lijstKop}<ul class="agenda">${lijst.map((a) => `<li class="${!avond && voorbij(a) ? "voorbij" : ""}"><span class="tijd">${a.hele_dag ? "hele dag" : a.van + "–" + a.tot}</span><span>${esc(a.titel)}${a.locatie ? ` <small>${esc(a.locatie)}</small>` : ""}</span></li>`).join("")}</ul>` : ""}
      </section>
      ${v.top.length ? `<h2>Nu belangrijk</h2><div id="top">${v.top.slice(0, 3).map((it) => this.itemRij(it)).join("")}</div>
        <button type="button" class="btn-link" id="naar-overzicht">Alle ${v.aantal_open} open punten ${IC("ic-chevron")}</button>` : ""}
      ${(v.opdrachten || []).length ? `<h2>Opdrachten</h2>${v.opdrachten.map((o) => this.opdrachtRij(o)).join("")}` : ""}
      <h2>Vraag of zeg iets</h2>
      <div class="chips">
        <button type="button" class="chip" data-vraag="Wat moet ik vandaag echt niet vergeten?">Wat niet vergeten?</button>
        <button type="button" class="chip" data-vraag="Wat staat er open voor klanten?">Open voor klanten</button>
        <button type="button" class="chip" data-vraag="Welke facturen staan nog open?">Facturen</button>
        <button type="button" class="chip" data-vraag="Hoe ziet morgen eruit?">Morgen</button>
        <button type="button" class="chip" data-vul="Zet een mailconcept klaar naar ">Mailconcept…</button>
        <button type="button" class="chip" data-vul="Bereid mijn meeting voor met ">Meeting voorbereiden…</button>
      </div>
      <div id="gesprek" class="gesprek">${this.gesprek.map((b) => this.belHtml(b)).join("")}</div>
      <p id="dicteer-hint" class="hint hidden"></p>
      <div class="invoer-balk">
        <button type="button" id="btn-dicteer" class="btn-rond" aria-pressed="false" aria-label="Inspreken" title="Inspreken">${IC("ic-mic")}</button>
        <input id="vraag-tekst" placeholder="Typ of spreek in…" autocomplete="off" enterkeyhint="send" />
        <button type="button" id="btn-stuur" class="btn-rond btn-rond-primair" aria-label="Versturen">${IC("ic-versturen")}</button>
      </div>`;
    this.bindItems(m);
    m.querySelector("#naar-overzicht")?.addEventListener("click", () => { this.project = null; this.ga("overzicht"); });
    m.querySelectorAll(".chip[data-vraag]").forEach((c) => c.addEventListener("click", () => this.stuur(c.dataset.vraag, false)));
    m.querySelectorAll(".chip[data-vul]").forEach((c) => c.addEventListener("click", () => { const i = m.querySelector("#vraag-tekst"); i.value = c.dataset.vul; i.focus(); }));
    m.querySelectorAll("[data-opdracht-annuleer]").forEach((b) => b.addEventListener("click", async () => { try { await Api.opdrachtAnnuleer(b.dataset.opdrachtAnnuleer); this.toast("Opdracht geannuleerd"); this.render(); } catch (e) { this.toast(e.message, { fout: true }); } }));
    m.querySelectorAll("[data-opdracht-gezien]").forEach((b) => b.addEventListener("click", async () => { try { await Api.opdrachtGezien(b.dataset.opdrachtGezien); this.render(); } catch (e) { this.toast(e.message, { fout: true }); } }));
    const input = m.querySelector("#vraag-tekst");
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.stuur(input.value, false); } });
    m.querySelector("#btn-stuur").addEventListener("click", () => this.stuur(input.value, false));
    m.querySelector("#btn-dicteer").addEventListener("click", () => this.dicteer(m.querySelector("#btn-dicteer"), input));
    if (this.gesprek.length) this.scrollGesprek();
  },

  opdrachtRij(o) {
    const naam = { mailconcept: "Mailconcept", meeting_voorbereiden: "Meeting voorbereiden", projectdoc: "Projectdoc bijwerken", offerte: "Offerte", overig: "Opdracht" }[o.soort] || "Opdracht";
    const status = { wacht: ["grijs", "in de wachtrij"], bezig: ["oranje", "bezig"], klaar: ["groen", "klaar"], mislukt: ["rood", "niet gelukt"] }[o.status] || ["grijs", o.status];
    const link = (o.resultaat || "").match(/https?:\/\/\S+/);
    return `<div class="card opdracht">
      <div class="kop"><b>${naam}</b><span class="tag ${status[0]}">${status[1]}</span></div>
      ${o.context?.project || o.context?.contact ? `<p class="sub">${[o.context.project, o.context.contact].filter(Boolean).map(esc).join(" · ")}</p>` : ""}
      <p class="stil">${esc(o.tekst)}</p>
      ${o.resultaat ? `<p class="omschr">${esc(o.resultaat.replace(/https?:\/\/\S+/, "").trim())}</p>` : o.status === "wacht" ? `<p class="hint">Wordt binnen een uur opgepakt; je krijgt een melding.</p>` : ""}
      <div class="rij">
        ${link ? `<a class="btn-link" href="${esc(link[0])}" target="_blank" rel="noopener">Openen ${IC("ic-chevron")}</a>` : ""}
        ${o.status === "wacht" ? `<button type="button" class="btn-secondary" data-opdracht-annuleer="${o.id}">Annuleren</button>` : ""}
        ${o.status === "klaar" || o.status === "mislukt" ? `<button type="button" class="btn-secondary" data-opdracht-gezien="${o.id}">${IC("ic-vink")} Gezien</button>` : ""}
      </div>
    </div>`;
  },

  belHtml(b) {
    const label = { opdracht: "In de wachtrij: ", opdracht_wijzig: "Opdracht bijgewerkt: ", opdracht_annuleer: "Opdracht geannuleerd: ", done: "Afgevinkt: ", dismiss: "Weg: ", snooze: "Uitgesteld: ", due: "Deadline gezet: ", hernoem: "Hernoemd: ", wacht: "Wacht op antwoord: ", houd: "Blijft staan: ", nieuw: "Toegevoegd: ", reopen: "Teruggezet: ", geweigerd: "Niet uitgevoerd: " };
    const chip = (a) => { const opd = a.actie.startsWith("opdracht"), nee = a.actie === "geweigerd"; return `<span class="tag ${nee ? "rood" : opd ? "oranje" : "groen"}">${IC(nee ? "ic-sluiten" : opd ? "ic-klok" : "ic-vink")} ${label[a.actie] || ""}${esc(a.titel)}</span>`; };
    return `<div class="bel ${b.rol}${b.wacht ? " wacht" : ""}${b.fout ? " fout" : ""}">${esc(b.tekst)}${b.acties?.length ? `<div class="bel-acties">${b.acties.map(chip).join("")}</div>` : ""}</div>`;
  },
  scrollGesprek() { const g = document.getElementById("gesprek"); if (g) g.lastElementChild?.scrollIntoView({ block: "nearest" }); },

  dicteer(knop, veld) {
    if (Spraak.luistert()) { Spraak.stop(); return; }
    Spraak.stil();
    const hint = document.getElementById("dicteer-hint");
    let laatste = "";
    const gestart = Spraak.start({
      onTekst(volledig) { veld.value = volledig; laatste = volledig; },
      onTussentijds(voorlopig) { hint.textContent = voorlopig ? "… " + voorlopig : ""; hint.classList.toggle("hidden", !voorlopig); },
      onFout: (msg) => this.toast(msg, { fout: true }),
      onEinde: () => {
        knop.setAttribute("aria-pressed", "false"); knop.title = "Inspreken"; hint.classList.add("hidden");
        if (laatste.trim()) this.stuur(laatste, true);   // klaar met praten: meteen versturen en antwoord voorlezen
      },
    });
    if (gestart) { knop.setAttribute("aria-pressed", "true"); knop.title = "Stoppen"; this.toast("Ik luister… tik nog eens om te stoppen"); }
  },

  async stuur(tekst, viaSpraak) {
    tekst = (tekst || "").trim();
    if (!tekst) return;
    const input = document.getElementById("vraag-tekst"); if (input) input.value = "";
    this.gesprek.push({ rol: "user", tekst });
    const wacht = { rol: "assistant", tekst: "Even kijken…", wacht: true };
    this.gesprek.push(wacht);
    const g = document.getElementById("gesprek"); if (g) { g.innerHTML = this.gesprek.map((b) => this.belHtml(b)).join(""); this.scrollGesprek(); }
    const t0 = Date.now();
    try {
      const r = await Api.chat(tekst);
      Object.assign(wacht, { tekst: r.antwoord, wacht: false, acties: r.acties });
      const inst = await Opslag.instellingen();
      if (viaSpraak || inst.stem !== false) Spraak.spreek(r.antwoord, inst.stemNaam);
      if (r.acties?.length) { this.checkStatus(); if (this.tab === "assistent") setTimeout(() => this.render(), r.acties.some((a) => a.actie === "opdracht") ? 1500 : 400); }
    } catch (e) {
      Object.assign(wacht, { tekst: "Dat lukte even niet: " + e.message, wacht: false, fout: true });
    }
    if (this.gesprek.length > 30) this.gesprek = this.gesprek.slice(-30);
    if (this.tab === "assistent") { const g2 = document.getElementById("gesprek"); if (g2) { g2.innerHTML = this.gesprek.map((b) => this.belHtml(b)).join(""); this.scrollGesprek(); } }
    console.debug("antwoord in", Date.now() - t0, "ms");
  },

  /* ============================ OVERZICHT ============================ */
  groepeer(items) {
    const groepen = new Map();
    for (const it of items) {
      const sleutel = it.categorie === "prive" ? CAT_NAAM.prive : (it.project && it.categorie !== "geld" ? it.project : (CAT_NAAM[it.categorie] || "Overig"));
      if (!groepen.has(sleutel)) groepen.set(sleutel, { naam: sleutel, items: [], max: 0, due: null, isProject: !!it.project && it.categorie !== "geld" });
      const g = groepen.get(sleutel);
      g.items.push(it); g.max = Math.max(g.max, it.prio_score || 0);
      if (it.due_at && (!g.due || it.due_at < g.due)) g.due = it.due_at;
    }
    const prive = (g) => g.naam === CAT_NAAM.prive ? 1 : 0;   // privé altijd onderaan, apart
    return [...groepen.values()].sort((a, b) => prive(a) - prive(b) || b.max - a.max || a.naam.localeCompare(b.naam));
  },

  async rOverzicht(m) {
    const filter = this.cache.filter || "open";
    const d = await Api.items(filter === "open" ? "open" : filter === "later" ? "snoozed" : "done,dismissed");
    if (filter === "open") document.getElementById("badge").textContent = d.items.length || "";
    const groepen = this.groepeer(d.items);
    m.innerHTML = `
      <div class="chips">
        ${[["open", "Open"], ["later", "Uitgesteld"], ["klaar", "Afgerond"]].map(([f, l]) => `<button type="button" class="chip ${filter === f ? "actief" : ""}" data-filter="${f}">${l}</button>`).join("")}
      </div>
      ${filter === "open" ? `<form id="nieuw" class="nieuw"><input name="titel" placeholder="Nieuw punt, bijv. 'WBSO afmaken voor 30 sept'" autocomplete="off" enterkeyhint="done"><button type="submit" class="btn-primary" aria-label="Toevoegen">+</button></form>` : ""}
      ${groepen.length ? groepen.map((g) => `
        <button type="button" class="groep" data-groep="${esc(g.naam)}">
          <span class="prio p${prioKlasse(g.max)}"></span>
          <span class="groep-tekst"><b>${esc(g.naam)}</b><span class="sub">${g.items.length} ${g.items.length === 1 ? "punt" : "punten"}${g.due ? " · eerste deadline " + datumKort(g.due) : ""}</span></span>
          ${IC("ic-chevron")}
        </button>`).join("") : `<p class="stil leeg">${filter === "open" ? "Niets open. Lekker." : "Niets hier."}</p>`}`;
    m.querySelectorAll(".chip[data-filter]").forEach((c) => c.addEventListener("click", () => { this.cache.filter = c.dataset.filter; this.render(); }));
    m.querySelectorAll(".groep").forEach((k) => k.addEventListener("click", () => { this.project = k.dataset.groep; this.render(); }));
    m.querySelector("#nieuw")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = e.target.titel.value.trim(); if (!t) return;
      try { const r = await Api.chat("Nieuw punt: " + t); this.toast(r.antwoord || "Toegevoegd"); e.target.reset(); this.render(); } catch (err) { this.toast(err.message, { fout: true }); }
    });
  },

  async rProject(m) {
    const filter = this.cache.filter || "open";
    const d = await Api.items(filter === "open" ? "open" : filter === "later" ? "snoozed" : "done,dismissed");
    const groep = this.groepeer(d.items).find((g) => g.naam === this.project);
    const items = (groep?.items || []).sort((a, b) => (b.prio_score || 0) - (a.prio_score || 0) || (a.due_at || "9999").localeCompare(b.due_at || "9999"));
    m.innerHTML = `
      <button type="button" class="btn-link terug" id="terug">${IC("ic-terug")} Overzicht</button>
      <h2>${esc(this.project)} · ${items.length}</h2>
      ${items.length ? items.map((it) => this.itemRij(it, filter !== "open")).join("") : `<p class="stil leeg">Niets meer hier.</p>`}`;
    m.querySelector("#terug").addEventListener("click", () => { this.project = null; this.render(); });
    this.bindItems(m);
    if (!items.length) setTimeout(() => { this.project = null; this.render(); }, 600);
  },

  /* ---------- itemrij: tik om open te klappen, dan de acties ---------- */
  itemRij(it, afgehandeld = false) {
    const due = it.due_at ? `<span class="tag ${dueKleur(it.due_at)}">${datumKort(it.due_at)}</span>` : "";
    const bron = { boekhouding: "boekhouding", outlook_mail: "mail", projectdoc: "projectlogboek", uren: "uren", claude: "Claude-sessie", plaud: "opname", google_agenda: "agenda", outlook_agenda: "agenda", handmatig: "zelf toegevoegd", kalender: "vaste deadline" }[it.bron] || it.bron;
    return `<div class="item" data-id="${it.id}">
      <button type="button" class="item-kop" aria-expanded="false">
        <span class="prio p${prioKlasse(it.prio_score)}"></span>
        <span class="tekst"><span class="titel">${esc(it.titel)}</span><span class="sub">${it.project ? esc(it.project) + " · " : ""}${bron}${it.prio_reden ? " · " + esc(it.prio_reden) : ""}</span></span>
        ${due}
      </button>
      <div class="item-body hidden">
        ${it.omschrijving ? `<p class="omschr">${esc(it.omschrijving)}</p>` : ""}
        ${it.meta?.link ? `<a href="${esc(it.meta.link)}" target="_blank" rel="noopener">Open in Outlook</a>` : ""}
        ${it.meta?.auto ? `<p class="stil">Automatisch: ${esc(it.meta.auto)}</p>` : ""}
        ${it.meta?.wacht_op ? `<p class="stil">Wacht op ${esc(it.meta.wacht_op)}${it.last_touched_at ? " sinds " + datumKort(it.last_touched_at.slice(0, 10)) : ""}</p>` : ""}
        <div class="acties">
          ${afgehandeld ? `<button type="button" data-actie="reopen">${IC("ic-herstel")} Terugzetten</button>` : `
          <button type="button" data-actie="done" class="goed">${IC("ic-vink")} Gedaan</button>
          <button type="button" data-actie="snooze" data-tot="morgen">${IC("ic-klok")} Morgen</button>
          <button type="button" data-actie="snooze" data-tot="volgende_week">${IC("ic-kalender")} Volgende week</button>
          <button type="button" data-actie="dismiss" class="zacht">${IC("ic-sluiten")} Niet relevant</button>
          ${it.meta?.wacht_op ? `<button type="button" data-herinnering="${it.id}">${IC("ic-versturen")} Herinnering klaarzetten</button>` : ""}
          ${it.meta?.soort === "mail_onbeantwoord" ? `<button type="button" data-herinnering="${it.id}">${IC("ic-versturen")} Concept klaarzetten</button>` : ""}`}
        </div>
      </div>
    </div>`;
  },

  bindItems(root) {
    root.querySelectorAll(".item-kop").forEach((k) => k.addEventListener("click", () => {
      const open = k.getAttribute("aria-expanded") === "true";
      root.querySelectorAll(".item-kop[aria-expanded=true]").forEach((x) => { x.setAttribute("aria-expanded", "false"); x.nextElementSibling.classList.add("hidden"); });
      if (!open) { k.setAttribute("aria-expanded", "true"); k.nextElementSibling.classList.remove("hidden"); }
    }));
    root.querySelectorAll(".item .acties button[data-herinnering]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await Api.herinnering(b.dataset.herinnering); this.toast("Wordt klaargezet, je krijgt een melding als het concept in Outlook staat"); }
      catch (e) { b.disabled = false; this.toast(e.message, { fout: true }); }
    }));
    root.querySelectorAll(".item .acties button[data-actie]").forEach((b) => b.addEventListener("click", async () => {
      const kaart = b.closest(".item"), id = kaart.dataset.id, actie = b.dataset.actie;
      const titel = kaart.querySelector(".titel").textContent;
      kaart.classList.add("weg");
      try {
        await Api.actie(id, actie, { tot: b.dataset.tot });
        const tekst = { done: "Afgevinkt", snooze: b.dataset.tot === "morgen" ? "Tot morgen uitgesteld" : "Tot volgende week uitgesteld", dismiss: "Als niet relevant gemarkeerd", reopen: "Teruggezet" }[actie];
        this.toast(`${tekst}: ${titel.slice(0, 40)}${titel.length > 40 ? "…" : ""}`, actie === "reopen" ? {} : {
          ongedaan: async () => { try { await Api.actie(id, "reopen"); this.toast("Teruggezet"); this.render(); this.checkStatus(); } catch (e) { this.toast(e.message, { fout: true }); } },
        });
        setTimeout(() => { kaart.remove(); this.checkStatus(); if (!root.querySelector(".item")) this.render(); }, 300);
      } catch (e) { kaart.classList.remove("weg"); this.toast(e.message, { fout: true }); }
    }));
  },

  /* WBSO: per jaar aanvinken welke projecten meetellen (klein, eens per jaar). */
  async rWbso(el, jaar) {
    let w;
    try { w = await Api.wbso(jaar); } catch (e) { el.innerHTML = `<p class="stil">${esc(e.message)}</p>`; return; }
    const dit = new Date().getFullYear();
    const namen = [...new Set([...(w.beschikbaar || []), ...(w.projecten || [])])].sort((a, b) => a.localeCompare(b));
    const gekozen = new Set(w.projecten || []);
    el.innerHTML = `
      <div class="rij"><label>Jaar <select id="wbso-jaar">${[dit - 1, dit, dit + 1].map((j) => `<option value="${j}" ${j === w.jaar ? "selected" : ""}>${j}</option>`).join("")}</select></label>
        ${w.stand && w.stand.jaar == w.jaar ? `<span class="hint">${w.stand.totaal} van ${w.doel} uur, nog ${w.stand.nog_nodig}</span>` : ""}</div>
      <div id="wbso-lijst">${namen.length ? namen.map((n) => `<label class="check-row"><input type="checkbox" value="${esc(n)}" ${gekozen.has(n) ? "checked" : ""}> ${esc(n)}</label>`).join("") : `<p class="stil">Nog geen projecten uit de urenadministratie voor dit jaar.</p>`}</div>
      <div class="rij"><input id="wbso-extra" placeholder="Nieuw project (nog niet in de uren)" autocomplete="off"><button type="button" id="wbso-opslaan" class="btn-primary">Opslaan</button></div>`;
    el.querySelector("#wbso-jaar").addEventListener("change", (e) => this.rWbso(el, parseInt(e.target.value, 10)));
    el.querySelector("#wbso-opslaan").addEventListener("click", async () => {
      const lijst = [...el.querySelectorAll("#wbso-lijst input:checked")].map((i) => i.value);
      const extra = el.querySelector("#wbso-extra").value.trim(); if (extra) lijst.push(extra);
      try { await Api.wbsoZet(parseInt(el.querySelector("#wbso-jaar").value, 10), lijst); this.toast("WBSO-projecten opgeslagen"); this.rWbso(el, parseInt(el.querySelector("#wbso-jaar").value, 10)); }
      catch (e) { this.toast(e.message, { fout: true }); }
    });
  },

  /* ============================== VERBRUIK ============================== */
  async rVerbruik(el, dagen = 14) {
    let v;
    try { v = await Api.verbruik(dagen); } catch (e) { el.innerHTML = `<p class="stil">${esc(e.message)}</p>`; return; }
    const w = v.week || {}, d = v.vandaag || {};
    const grens = v.grens_tokens_week || 0;
    const deel = grens ? Math.min(100, Math.round((w.tokens || 0) / grens * 100)) : 0;
    const top = Math.max(1, ...(v.per_dag || []).map((x) => x.tokens || 0));
    const staafKleur = deel >= 100 ? "rood" : deel >= 80 ? "oranje" : "grijs";
    el.innerHTML = `
      <p class="stil">Vandaag ${tok(d.tokens)} in ${d.runs || 0} run(s). Deze week ${tok(w.tokens)} in ${w.runs || 0} run(s).</p>
      ${grens ? `<div class="meter"><div class="meter-vul ${staafKleur}" style="width:${deel}%"></div></div>
        <p class="hint">${deel}% van je weekgrens (${tok(grens)}).${deel >= 80 ? " Assistent slaat niet-urgente runs over zodra de grens vol is." : ""}</p>` : ""}
      <div class="dagstaven">${(v.per_dag || []).map((x) => `<span class="dagstaaf" title="${esc(x.dag)}: ${tok(x.tokens)}"><i style="height:${Math.round((x.tokens || 0) / top * 100)}%"></i></span>`).join("")}</div>
      ${v.per_soort?.length ? `<ul class="status-lijst">${v.per_soort.map((x) => `<li>${esc(x.soort)}: ${tok(x.tokens)} in ${x.runs} run(s)${x.runs ? ` (${tok(Math.round(x.tokens / x.runs))} per run)` : ""}</li>`).join("")}</ul>` : ""}
      ${w.cache_ratio != null ? `<p class="hint">Cache-hit ${Math.round(w.cache_ratio * 100)}%. Lager dan ~70% betekent dat de context elke run opnieuw wordt opgebouwd.</p>` : ""}
      <div class="rij"><label>Weekgrens <input id="verbruik-grens" type="number" min="0" step="100000" value="${grens}" inputmode="numeric"></label><button type="button" id="verbruik-opslaan" class="btn-primary">Opslaan</button></div>
      <div class="chips">${[7, 14, 30].map((n) => `<button type="button" class="chip ${n === dagen ? "actief" : ""}" data-dagen="${n}">${n} dagen</button>`).join("")}</div>`;
    el.querySelectorAll(".chip[data-dagen]").forEach((b) => b.addEventListener("click", () => this.rVerbruik(el, parseInt(b.dataset.dagen, 10))));
    el.querySelector("#verbruik-opslaan").addEventListener("click", async () => {
      try { await Api.verbruikGrens(parseInt(el.querySelector("#verbruik-grens").value, 10) || 0); this.toast("Weekgrens opgeslagen"); this.rVerbruik(el, dagen); }
      catch (e) { this.toast(e.message, { fout: true }); }
    });
  },

  /* ============================ INSTELLINGEN ============================ */
  async rInstellingen(m) {
    const c = await Opslag.instellingen();
    const s = this.cache.status;
    const perm = "Notification" in window ? { granted: "toegestaan", denied: "geweigerd", default: "nog niet gevraagd" }[Notification.permission] : "niet beschikbaar";
    const stemmen = Spraak.stemmen();
    m.innerHTML = `
      <form id="inst" class="card">
        <h2>Verbinding</h2>
        <label>Adres van de assistent<input name="adres" value="${esc(c.adres)}" placeholder="https://assistant.imetech.nl" inputmode="url" autocapitalize="off"></label>
        <label>Token<input name="token" value="${esc(c.token)}" type="password" autocomplete="off"></label>
        <div class="rij"><button type="submit" class="btn-primary">Opslaan en testen</button></div>
      </form>
      <section class="card">
        <h2>Meldingen</h2>
        <p class="stil">Toestemming: ${perm}.${s ? ` Server: ${s.push.vapid ? "klaar" : "niet ingesteld"}, ${s.push.abonnementen} toestel(len).` : ""}</p>
        <div class="rij"><button type="button" id="abonneer" class="btn-primary">Meldingen aanzetten op dit toestel</button><button type="button" id="pushtest" class="btn-secondary">Testmelding</button></div>
      </section>
      <section class="card">
        <h2>Spraak</h2>
        <label class="check-row"><input type="checkbox" name="stem" id="stem-aan" ${c.stem !== false ? "checked" : ""}> Antwoorden altijd voorlezen (bij inspreken altijd)</label>
        ${stemmen.length ? `<label>Stem<select id="stem-naam">${stemmen.map((v) => `<option value="${esc(v.name)}" ${v.name === c.stemNaam ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>` : ""}
        <div class="rij"><button type="button" id="stem-test" class="btn-secondary">${IC("ic-luidspreker")} Test</button></div>
      </section>
      <section class="card">
        <h2>Weergave</h2>
        <label class="check-row"><input type="checkbox" id="toggle-dark-mode" ${document.documentElement.dataset.theme === "dark" ? "checked" : ""}> Donkere modus</label>
        <div id="install-manual" class="hint hidden">Installeren: open het menu van je browser en kies <strong>Toevoegen aan startscherm</strong>.</div>
        <div class="rij"><button type="button" id="btn-install-settings" class="btn-secondary">App installeren</button></div>
      </section>
      <details class="card klein" id="verbruik-sectie">
        <summary><h2>Verbruik</h2><span class="hint">Wat de assistent zelf aan Claude opmaakt.</span></summary>
        <div id="verbruik-inhoud"><p class="stil">Laden…</p></div>
      </details>
      <details class="card klein" id="wbso-sectie">
        <summary><h2>WBSO-projecten</h2><span class="hint">Eens per jaar: welke projecten tellen mee voor de 500 uur.</span></summary>
        <div id="wbso-inhoud"><p class="stil">Laden…</p></div>
      </details>
      <section class="card">
        <h2>Status</h2>
        ${s ? `<ul class="status-lijst">
          <li>Microsoft (mail, agenda, OneDrive): ${s.graph_gekoppeld ? "gekoppeld" : "niet gekoppeld"}</li>
          <li>Claude: ${s.claude.oauth_token ? "abonnement" : s.claude.api_key ? "API-key" : "niet gekoppeld"}</li>
          <li>Laatste verzamelronde: ${s.scheduler.laatste_verzamel ? tijdNl(s.scheduler.laatste_verzamel) : "nog niet"}</li>
          <li>Laatste triage met Claude: ${s.scheduler.laatste_triage ? tijdNl(s.scheduler.laatste_triage) : "nog niet"}</li>
          ${s.scheduler.fouten?.length ? `<li class="fout">Fouten: ${s.scheduler.fouten.map(esc).join("; ")}</li>` : ""}
        </ul>` : `<p class="stil">Nog geen verbinding.</p>`}
        <div class="rij"><button type="button" id="verzamel" class="btn-secondary">Nu verzamelen</button><button type="button" id="triage" class="btn-secondary">Verzamelen + opschonen</button><button type="button" id="briefing" class="btn-secondary">Briefing nu</button></div>
      </section>`;
    m.querySelector("#inst").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      await Opslag.set("instellingen", { ...c, adres: f.adres.value.trim(), token: f.token.value.trim() });
      try { await Api.status(); this.toast("Verbonden"); await this.checkStatus(); this.render(); } catch (err) { this.toast(err.message, { fout: true }); }
    });
    const bewaar = async (patch) => Opslag.set("instellingen", { ...(await Opslag.instellingen()), ...patch });
    m.querySelector("#stem-aan").addEventListener("change", (e) => bewaar({ stem: e.target.checked }));
    m.querySelector("#stem-naam")?.addEventListener("change", (e) => bewaar({ stemNaam: e.target.value }));
    m.querySelector("#stem-test").addEventListener("click", async () => { const i = await Opslag.instellingen(); Spraak.spreek("Hoi Ivo, ik ben je assistent. Zo klink ik.", i.stemNaam); });
    m.querySelector("#toggle-dark-mode").addEventListener("change", (e) => this.zetThema(e.target.checked));
    m.querySelector("#btn-install-settings").addEventListener("click", () => Installatie.promptInstall());
    m.querySelector("#abonneer").addEventListener("click", () => this.abonneer());
    m.querySelector("#pushtest").addEventListener("click", async () => { try { const r = await Api.pushTest(); this.toast(`Verstuurd naar ${r.verstuurd} toestel(len)`); } catch (e) { this.toast(e.message, { fout: true }); } });
    m.querySelector("#verzamel").addEventListener("click", async () => { this.toast("Bezig…"); try { const r = await Api.verzamel(false); this.toast(`Klaar: ${r.direct || 0} bijgewerkt, ${r.afgerond || 0} afgerond`); await this.checkStatus(); this.render(); } catch (e) { this.toast(e.message, { fout: true }); } });
    m.querySelector("#triage").addEventListener("click", async () => { this.toast("Bezig, kan een paar minuten duren…"); try { const r = await Api.verzamel(true); const o = r.opschoon || {}; this.toast(`Klaar: ${r.nieuw || 0} nieuw, ${(r.dubbel || 0) + (o.samengevoegd || 0)} samengevoegd, ${(r.afgerond || 0) + (o.afgerond || 0)} afgerond, ${o.hernoemd || 0} bijgewerkt`); await this.checkStatus(); this.render(); } catch (e) { this.toast(e.message, { fout: true }); } });
    m.querySelector("#verbruik-sectie").addEventListener("toggle", (e) => { if (e.target.open) this.rVerbruik(m.querySelector("#verbruik-inhoud")); }, { once: false });
    m.querySelector("#wbso-sectie").addEventListener("toggle", (e) => { if (e.target.open) this.rWbso(m.querySelector("#wbso-inhoud")); }, { once: false });
    m.querySelector("#briefing").addEventListener("click", async () => { try { const r = await Api.briefing(new Date().getHours() < 13 ? "ochtend" : "avond"); this.toast(r.titel || "Verstuurd"); } catch (e) { this.toast(e.message, { fout: true }); } });
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
    } catch (e) { this.toast(e.message, { fout: true }); }
  },
};

function tok(n) { n = n || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + "M tokens" : n >= 1e3 ? Math.round(n / 1e3) + "k tokens" : n + " tokens"; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function prioKlasse(p) { return Math.min(4, Math.floor((p || 0) / 25)); }
function datumKort(iso) { const d = new Date(iso.slice(0, 10) + "T12:00:00"); return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }); }
function tijdNl(iso) { const d = new Date(iso); return d.toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
function dueKleur(iso) { const dagen = Math.round((new Date(iso.slice(0, 10)) - new Date(new Date().toDateString())) / 864e5); return dagen < 0 ? "rood" : dagen <= 2 ? "oranje" : "grijs"; }
function b64ToU8(b64) { const p = "=".repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }

window.addEventListener("DOMContentLoaded", () => App.init());
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};
