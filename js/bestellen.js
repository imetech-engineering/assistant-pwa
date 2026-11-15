/* Tab Bestellen: zakelijke bestellijst per leverancier ("dat kan mee"), vaste artikelen en onlangs besteld.
   Vegen naar rechts = besteld, naar links = weg, tikken of vasthouden = wijzigen. Alles met ongedaan maken. */
const Bestellen = {
  d: null,
  meeKaart: null,       // {leverancier, items, al_besteld}
  recentOpen: false,

  async render(m) {
    const d = await Api.bestellijst();
    this.d = d;
    const open = d.groepen.reduce((n, g) => n + g.items.length, 0);
    const badge = document.getElementById("badge-bestel"); if (badge) badge.textContent = open || "";
    const openSleutels = new Set(d.groepen.flatMap((g) => g.items.map((i) => i.standaard_id)).filter(Boolean));
    m.innerHTML = `
      <form id="bs-snel" class="nieuw bs-snel" autocomplete="off">
        <input name="tekst" placeholder="Wat moet er besteld? Bijv. 2x soldeertin (Farnell)" enterkeyhint="done" aria-label="Wat moet er besteld">
        <button type="button" class="btn-secondary bs-uitgebreid" aria-label="Met alle velden toevoegen">${IC("ic-potlood")}</button>
        <button type="submit" class="btn-primary" aria-label="Op de lijst">+</button>
      </form>
      <div id="bs-sugg" class="bs-sugg"></div>
      <div id="bs-mee">${this.meeHtml()}</div>
      <h2>Te bestellen · ${open}</h2>
      ${d.groepen.length ? d.groepen.map((g) => this.groepHtml(g)).join("") : `<p class="stil leeg">Niets te bestellen. Typ hierboven wat je nodig hebt.</p>`}
      ${d.standaard.length ? `<h2>Vaste artikelen · ${d.standaard.length}</h2>
        <div class="bs-blok">${d.standaard.map((s) => this.vastHtml(s, openSleutels.has(s.id))).join("")}</div>` : ""}
      ${d.recent.length ? `<button type="button" class="btn-link bs-toggle" id="bs-recent">${IC(this.recentOpen ? "ic-omlaag" : "ic-chevron")} Onlangs besteld · ${d.recent.length}</button>
        ${this.recentOpen ? `<div class="bs-blok">${d.recent.map((r) => this.recentHtml(r)).join("")}</div>` : ""}` : ""}
      <p class="stil bs-voet">Staat ook in To Do (lijst <b>IMeTech bestellen</b>). Komt er een orderbevestiging binnen, dan vinkt de assistent de items af en zet de bestelling in het projectdocument.</p>`;
    this.bind(m);
  },

  /* ---------- html ---------- */
  titel(i) { const a = (i.aantal || "").trim(); return (a ? (/^\d+([.,]\d+)?$/.test(a) ? a + "x " : a + " ") : "") + i.wat; },

  meeHtml() {
    const k = this.meeKaart;
    if (!k) return "";
    const mee = k.items?.length ? `<p><b>Kan mee bij ${esc(k.leverancier)}:</b> ${k.items.map((i) => esc(this.titel(i))).join(", ")}</p>` : "";
    const al = (k.al_besteld || []).map((h) => `<p class="bs-al">${IC("ic-klok")} <span><b>Al besteld?</b> ${esc(h.wat)} staat op ${esc(h.datum)} als ${esc(h.status || "besteld")}${h.project ? " in " + esc(h.project) : ""}${h.leverancier ? " (" + esc(h.leverancier) + (h.ordernr ? " " + esc(h.ordernr) : "") + ")" : ""}.</span></p>`).join("");
    if (!mee && !al) return "";
    return `<div class="card bs-meekaart${al ? " let-op" : ""}">${al}${mee}<button type="button" class="btn-link" id="bs-mee-weg">Oké</button></div>`;
  },

  groepHtml(g) {
    const lev = g.leverancier || "";
    const licht = this.meeKaart && this.meeKaart.leverancier && g.sleutel && this.levKey(this.meeKaart.leverancier) === g.sleutel;
    return `<section class="bs-groep${licht ? " licht" : ""}" data-lev="${esc(lev)}">
      <div class="bs-groep-kop">
        <span><b>${esc(lev || "Zonder leverancier")}</b><span class="sub">${g.items.length} ${g.items.length === 1 ? "artikel" : "artikelen"}${lev ? "" : " · tik om aan te vullen"}</span></span>
        ${lev && g.items.length > 1 ? `<button type="button" class="bs-alles" data-alles="${esc(lev)}">${IC("ic-vink")} Alles besteld</button>` : ""}
      </div>
      ${g.items.map((i) => this.rijHtml(i)).join("")}
    </section>`;
  },

  rijHtml(i) {
    const sub = [i.project, i.artikelnr, i.notitie].filter(Boolean).map(esc).join(" · ");
    return `<div class="bs-rij" data-id="${i.id}">
      <div class="veeg-achter"><span class="veeg-goed">${IC("ic-vink")} Besteld</span><span class="veeg-weg">Weg ${IC("ic-prullenbak")}</span></div>
      <div class="veeg-voor">
        <button type="button" class="bs-vink" aria-label="Besteld: ${esc(this.titel(i))}"></button>
        <span class="bs-tekst"><span class="titel">${esc(this.titel(i))}${i.standaard_id ? `<span class="bs-vast" title="Vast artikel">${IC("ic-ster")}</span>` : ""}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</span>
        ${i.url ? `<a class="bs-link" href="${esc(i.url)}" target="_blank" rel="noopener" aria-label="Open de productpagina">${IC("ic-link")}</a>` : ""}
      </div>
    </div>`;
  },

  vastHtml(s, staatOp) {
    const sub = [s.leverancier, s.artikelnr, s.project, s.laatst_besteld ? "laatst " + this.datum(s.laatst_besteld) : ""].filter(Boolean).map(esc).join(" · ");
    return `<div class="bs-vrij" data-vast="${s.id}">
      <span class="bs-tekst"><span class="titel">${esc(this.titel(s))}</span><span class="sub">${sub}</span></span>
      ${staatOp ? `<span class="tag groen">op de lijst</span>` : `<button type="button" class="bs-op" data-op="${s.id}">${IC("ic-plus")} Op lijst</button>`}
    </div>`;
  },

  recentHtml(r) {
    const sub = [this.datum(r.besteld_at), r.leverancier, r.ordernr ? "order " + r.ordernr : "nog geen orderbevestiging", r.project].filter(Boolean).map(esc).join(" · ");
    return `<div class="bs-vrij" data-recent="${r.id}">
      <span class="bs-tekst"><span class="titel">${esc(this.titel(r))}</span><span class="sub">${sub}</span></span>
      <button type="button" class="bs-op" data-nogeens="${r.id}">${IC("ic-herstel")} Nog eens</button>
    </div>`;
  },

  datum(iso) { if (!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }); },
  levKey(s) { return String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/\.(nl|com|de|eu|be)\b/g, "").replace(/[^a-z0-9]/g, ""); },
  alleItems() { return (this.d?.groepen || []).flatMap((g) => g.items); },

  /* ---------- gedrag ---------- */
  bind(m) {
    const form = m.querySelector("#bs-snel"), inp = form.tekst;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = inp.value.trim(); if (!t) return;
      inp.disabled = true;
      try { const r = await Api.bestelNieuw({ tekst: t }); inp.value = ""; this.naToevoegen(r); }
      catch (err) { App.toast(err.message, { fout: true }); }
      finally { inp.disabled = false; }
    });
    inp.addEventListener("input", () => this.suggesties(m, inp.value));
    m.querySelector(".bs-uitgebreid").addEventListener("click", () => this.blad({ wat: inp.value.trim() }));
    m.querySelector("#bs-mee-weg")?.addEventListener("click", () => { this.meeKaart = null; App.render(); });
    m.querySelector("#bs-recent")?.addEventListener("click", () => { this.recentOpen = !this.recentOpen; App.render(); });
    m.querySelectorAll("[data-alles]").forEach((b) => b.addEventListener("click", () => this.allesBesteld(b.dataset.alles)));
    m.querySelectorAll("[data-op]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation(); b.disabled = true;
      try { this.naToevoegen(await Api.vastOpLijst(b.dataset.op)); } catch (err) { b.disabled = false; App.toast(err.message, { fout: true }); }
    }));
    m.querySelectorAll("[data-nogeens]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation(); b.disabled = true;
      try { this.naToevoegen(await Api.bestelOpnieuw(b.dataset.nogeens)); } catch (err) { b.disabled = false; App.toast(err.message, { fout: true }); }
    }));
    m.querySelectorAll(".bs-vrij[data-vast]").forEach((r) => this.tikOfHoud(r, () => this.vastBlad(this.d.standaard.find((s) => String(s.id) === r.dataset.vast))));
    m.querySelectorAll(".bs-vrij[data-recent]").forEach((r) => this.tikOfHoud(r, () => this.recentBlad(this.d.recent.find((x) => String(x.id) === r.dataset.recent))));
    m.querySelectorAll(".bs-rij").forEach((rij) => this.bindRij(rij));
  },

  suggesties(m, tekst) {
    const el = m.querySelector("#bs-sugg");
    const woorden = tekst.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
    if (!woorden.length) { el.innerHTML = ""; return; }
    const hits = (this.d?.standaard || []).filter((s) => { const h = `${s.wat} ${s.leverancier} ${s.artikelnr}`.toLowerCase(); return woorden.every((w) => h.includes(w)); }).slice(0, 4);
    el.innerHTML = hits.map((s) => `<button type="button" class="chip" data-sugg="${s.id}">${IC("ic-ster")} ${esc(this.titel(s))}${s.leverancier ? ` <span class="stil">${esc(s.leverancier)}</span>` : ""}</button>`).join("");
    el.querySelectorAll("[data-sugg]").forEach((b) => b.addEventListener("click", async () => {
      try { const r = await Api.vastOpLijst(b.dataset.sugg); m.querySelector("#bs-snel").tekst.value = ""; el.innerHTML = ""; this.naToevoegen(r); }
      catch (err) { App.toast(err.message, { fout: true }); }
    }));
  },

  naToevoegen(r) {
    const it = r.item;
    this.meeKaart = (r.mee?.length || r.al_besteld?.length) ? { leverancier: it.leverancier, items: r.mee || [], al_besteld: r.al_besteld || [] } : null;
    if (r.dubbel) App.toast(`Stond al op de lijst: ${this.titel(it)}`);
    else App.toast(`Op de lijst: ${this.titel(it)}`, { knop: "Ongedaan", ongedaan: async () => { try { await Api.bestelStatus(it.id, "weg"); this.meeKaart = null; App.render(); } catch (e) { App.toast(e.message, { fout: true }); } } });
    try { navigator.vibrate?.(this.meeKaart ? [20, 40, 20] : 15); } catch (_) {}
    App.render();
  },

  async zet(id, status, tekst) {
    this.meeKaart = null;
    const it = this.alleItems().find((x) => String(x.id) === String(id));
    try {
      await Api.bestelStatus(id, status);
      App.toast(`${tekst}: ${it ? this.titel(it).slice(0, 40) : ""}`, { knop: "Ongedaan", ongedaan: async () => { try { await Api.bestelStatus(id, "open"); App.render(); } catch (e) { App.toast(e.message, { fout: true }); } } });
    } catch (e) { App.toast(e.message, { fout: true }); }
    App.render();
  },

  async allesBesteld(lev) {
    this.meeKaart = null;
    try {
      const r = await Api.bestelLevBesteld(lev);
      App.toast(`${r.ids.length} artikelen bij ${lev} op besteld`, { knop: "Ongedaan", ongedaan: async () => { try { for (const id of r.ids) await Api.bestelStatus(id, "open"); App.render(); } catch (e) { App.toast(e.message, { fout: true }); } } });
    } catch (e) { App.toast(e.message, { fout: true }); }
    App.render();
  },

  /* tikken = openen, vasthouden = openen (zelfde actie, zodat het altijd klopt wat je verwacht) */
  tikOfHoud(el, fn) {
    let t = null, gedaan = false;
    el.addEventListener("pointerdown", (e) => { if (e.target.closest("button, a")) return; gedaan = false; t = setTimeout(() => { gedaan = true; try { navigator.vibrate?.(12); } catch (_) {} fn(); }, 500); });
    ["pointerup", "pointercancel", "pointerleave", "pointermove"].forEach((ev) => el.addEventListener(ev, (e) => { if (ev === "pointermove" && Math.abs(e.movementX) + Math.abs(e.movementY) < 3) return; clearTimeout(t); }));
    el.addEventListener("click", (e) => { if (e.target.closest("button, a") || gedaan) return; fn(); });
  },

  bindRij(rij) {
    const voor = rij.querySelector(".veeg-voor"), id = rij.dataset.id;
    rij.querySelector(".bs-vink").addEventListener("click", (e) => { e.stopPropagation(); rij.classList.add("weg"); setTimeout(() => this.zet(id, "besteld", "Besteld"), 180); });
    let x0 = null, y0 = null, dx = 0, zij = null, houd = null, bewogen = false;
    const open = () => this.blad(this.alleItems().find((x) => String(x.id) === id));
    voor.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a")) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; zij = null; bewogen = false;
      houd = setTimeout(() => { houd = null; if (!bewogen) { x0 = null; try { navigator.vibrate?.(12); } catch (_) {} open(); } }, 500);
    });
    voor.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      const ddx = e.clientX - x0, ddy = e.clientY - y0;
      if (zij === null && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) {
        bewogen = true; clearTimeout(houd); houd = null;
        zij = Math.abs(ddx) > Math.abs(ddy);
        if (zij) { try { voor.setPointerCapture(e.pointerId); } catch (_) {} voor.style.transition = "none"; }
      }
      if (!zij) return;
      dx = ddx; voor.style.transform = `translateX(${dx}px)`;
      rij.classList.toggle("veeg-r", dx > 0); rij.classList.toggle("veeg-l", dx < 0);
    });
    const einde = () => {
      clearTimeout(houd);
      if (x0 === null) return;
      const was = houd; houd = null; x0 = null;
      voor.style.transition = "transform .18s ease-out";
      if (zij && Math.abs(dx) > 90) {
        voor.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`;
        try { navigator.vibrate?.(10); } catch (_) {}
        setTimeout(() => this.zet(id, dx > 0 ? "besteld" : "weg", dx > 0 ? "Besteld" : "Van de lijst"), 160);
      } else {
        voor.style.transform = ""; rij.classList.remove("veeg-r", "veeg-l");
        if (!bewogen && was) open();
      }
    };
    voor.addEventListener("pointerup", einde);
    voor.addEventListener("pointercancel", () => { clearTimeout(houd); houd = null; if (x0 !== null) { x0 = null; voor.style.transform = ""; rij.classList.remove("veeg-r", "veeg-l"); } });
  },

  /* ---------- bladen ---------- */
  veld(naam, label, waarde = "", extra = "") {
    return `<label class="bs-veld"><span>${label}</span><input name="${naam}" value="${esc(waarde || "")}" ${extra}></label>`;
  },

  formHtml(i, metVast = true) {
    const proj = this.d?.projecten || [], levs = this.d?.leveranciers || [];
    return `<div class="bs-form">
      ${this.veld("wat", "Wat", i.wat, 'required autocomplete="off"')}
      <div class="bs-twee">${this.veld("aantal", "Aantal", i.aantal, 'inputmode="decimal" autocomplete="off"')}${this.veld("leverancier", "Leverancier", i.leverancier, 'list="bs-levs" autocomplete="off"')}</div>
      <datalist id="bs-levs">${levs.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
      <label class="bs-veld"><span>Project</span><select name="project"><option value="">Geen project (IMeTech algemeen)</option>${[...new Set([i.project, ...proj].filter(Boolean))].map((p) => `<option${p === i.project ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      ${this.veld("artikelnr", "Artikelnummer", i.artikelnr, 'autocomplete="off"')}
      ${this.veld("url", "Link", i.url, 'type="url" inputmode="url" autocomplete="off" placeholder="https://"')}
      ${this.veld("notitie", "Notitie", i.notitie, 'autocomplete="off"')}
      ${metVast ? `<label class="inst-rij bs-schakel"><span class="inst-label">Vast artikel<small>Snel opnieuw bestellen met één tik</small></span><span class="schakel"><input type="checkbox" name="vast" ${i.standaard_id ? "checked" : ""}><i></i></span></label>` : ""}
    </div>`;
  },

  leesForm(root) {
    const v = {};
    root.querySelectorAll(".bs-form input[name], .bs-form select[name]").forEach((x) => { v[x.name] = x.type === "checkbox" ? x.checked : x.value.trim(); });
    return v;
  },

  openBlad(kop, inhoud, knoppen, naOpen) {
    document.querySelector(".kz-achter")?.remove();
    const achter = document.createElement("div");
    achter.className = "kz-achter bs-achter";
    achter.innerHTML = `<div class="kz bs-blad" role="dialog" aria-label="${esc(kop)}">
      <div class="kz-kop"><span>${esc(kop)}</span><button type="button" class="kz-sluit" aria-label="Sluiten">${IC("ic-sluiten")}</button></div>
      <form class="bs-blad-inhoud">${inhoud}<div class="bs-knoppen">${knoppen}</div></form></div>`;
    document.body.appendChild(achter);
    const sluit = () => { achter.remove(); window.Terug?.dicht("bestelblad"); };
    window.Terug?.sluiter("bestelblad", () => achter.remove());
    window.Terug?.open("bestelblad");
    achter.addEventListener("click", (e) => { if (e.target === achter || e.target.closest(".kz-sluit")) sluit(); });
    naOpen?.(achter, sluit);
    return { achter, sluit };
  },

  blad(i) {
    const nieuw = !i || !i.id;
    i = i || {};
    const knoppen = nieuw ? `<button type="submit" class="btn-primary">${IC("ic-plus")} Op de lijst</button>`
      : `<button type="submit" class="btn-primary">Opslaan</button>
         <button type="button" class="btn-secondary" data-b="besteld">${IC("ic-vink")} Besteld</button>
         <button type="button" class="btn-secondary bs-rood" data-b="weg" aria-label="Van de lijst halen">${IC("ic-prullenbak")}</button>`;
    this.openBlad(nieuw ? "Op de bestellijst" : "Bestelling wijzigen", this.formHtml(i), knoppen, (achter, sluit) => {
      const f = achter.querySelector("form");
      if (nieuw) setTimeout(() => f.querySelector(i.wat ? "[name=aantal]" : "[name=wat]")?.focus(), 50);
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = this.leesForm(achter);
        if (!v.wat) { f.querySelector("[name=wat]").focus(); return; }
        try {
          if (nieuw) { sluit(); this.naToevoegen(await Api.bestelNieuw(v)); }
          else { await Api.bestelWijzig(i.id, v); sluit(); App.toast("Opgeslagen"); App.render(); }
        } catch (err) { App.toast(err.message, { fout: true }); }
      });
      achter.querySelectorAll("[data-b]").forEach((b) => b.addEventListener("click", () => { sluit(); this.zet(i.id, b.dataset.b, b.dataset.b === "besteld" ? "Besteld" : "Van de lijst"); }));
    });
  },

  vastBlad(s) {
    if (!s) return;
    const knoppen = `<button type="submit" class="btn-primary">Opslaan</button>
      <button type="button" class="btn-secondary" data-b="op">${IC("ic-plus")} Op lijst</button>
      <button type="button" class="btn-secondary bs-rood" data-b="niet" aria-label="Niet meer als vast artikel">${IC("ic-prullenbak")}</button>`;
    this.openBlad("Vast artikel", this.formHtml(s, false), knoppen, (achter, sluit) => {
      const f = achter.querySelector("form");
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await Api.vastWijzig(s.id, this.leesForm(achter)); sluit(); App.toast("Opgeslagen"); App.render(); } catch (err) { App.toast(err.message, { fout: true }); }
      });
      achter.querySelector('[data-b="op"]').addEventListener("click", async () => {
        const v = this.leesForm(achter);
        try { await Api.vastWijzig(s.id, v); sluit(); this.naToevoegen(await Api.vastOpLijst(s.id, v.aantal, v.project)); } catch (err) { App.toast(err.message, { fout: true }); }
      });
      achter.querySelector('[data-b="niet"]').addEventListener("click", async () => {
        sluit();
        try {
          await Api.vastWijzig(s.id, { actief: false });
          App.toast(`Niet meer vast: ${s.wat.slice(0, 40)}`, { knop: "Ongedaan", ongedaan: async () => { try { await Api.vastWijzig(s.id, { actief: true }); App.render(); } catch (e) { App.toast(e.message, { fout: true }); } } });
        } catch (e) { App.toast(e.message, { fout: true }); }
        App.render();
      });
    });
  },

  recentBlad(r) {
    if (!r) return;
    const info = [r.leverancier, r.ordernr ? "order " + r.ordernr : "nog geen orderbevestiging gezien", r.project, "besteld " + this.datum(r.besteld_at)].filter(Boolean).map(esc).join(" · ");
    const knoppen = `<button type="button" class="btn-primary" data-b="nogeens">${IC("ic-herstel")} Nog eens bestellen</button>
      <button type="button" class="btn-secondary" data-b="terug">Toch niet besteld</button>`;
    this.openBlad(this.titel(r), `<p class="stil bs-info">${info}</p>`, knoppen, (achter, sluit) => {
      achter.querySelector('[data-b="nogeens"]').addEventListener("click", async () => { sluit(); try { this.naToevoegen(await Api.bestelOpnieuw(r.id)); } catch (e) { App.toast(e.message, { fout: true }); } });
      achter.querySelector('[data-b="terug"]').addEventListener("click", async () => {
        sluit();
        try { await Api.bestelStatus(r.id, "open"); App.toast("Weer op de lijst", { knop: "Ongedaan", ongedaan: async () => { try { await Api.bestelStatus(r.id, "besteld"); App.render(); } catch (e) { App.toast(e.message, { fout: true }); } } }); }
        catch (e) { App.toast(e.message, { fout: true }); }
        App.render();
      });
    });
  },
};
