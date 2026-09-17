/* Inspreken (Web Speech API, Chrome op Android) en voorlezen (op het toestel zelf). */
const Spraak = {
  _rec: null,
  kanLuisteren() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  luister(onTekst, onEinde, onFout) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { onFout && onFout("Spraakherkenning niet beschikbaar in deze browser"); return; }
    const rec = new R();
    rec.lang = "nl-NL"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let eind = "";
    rec.onresult = (e) => {
      let tussen = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) eind += t; else tussen += t;
      }
      onTekst(eind + tussen, !!eind);
    };
    rec.onerror = (e) => onFout && onFout(e.error);
    rec.onend = () => { this._rec = null; onEinde && onEinde(eind.trim()); };
    this._rec = rec;
    rec.start();
  },
  stop() { if (this._rec) this._rec.stop(); },
  zeg(tekst) {
    if (!("speechSynthesis" in window) || !tekst) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tekst);
    u.lang = "nl-NL"; u.rate = 1.05;
    const stem = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("nl"));
    if (stem) u.voice = stem;
    speechSynthesis.speak(u);
  },
  stil() { if ("speechSynthesis" in window) speechSynthesis.cancel(); },
};
