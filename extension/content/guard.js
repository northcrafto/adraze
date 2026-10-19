// AdRaze-vakten körs i sidans egen värld innan sidans skript:
// stoppar popunders (window.open på klick som inte var på en länk/knapp)
// och osynliga helsideslänkar som skickar iväg en till reklam när man klickar var som helst.
(() => {
  if (window.__adrazeVakt) return;
  Object.defineProperty(window, "__adrazeVakt", { value: true });

  const signal = () => document.dispatchEvent(new CustomEvent("adraze:stoppad"));
  const sajt = (h) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
  const egen = sajt(location.hostname);
  const korsSajt = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) && sajt(x.hostname) !== egen; } catch { return false; } };

  // Inloggning och betalning öppnas alltid när användaren faktiskt klickat
  const INLOGG = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|facebook\.com|github\.com|discord\.com|twitter\.com|x\.com|api\.twitter\.com|linkedin\.com|twitch\.tv|id\.twitch\.tv|steamcommunity\.com|accounts\.spotify\.com|auth0\.com|okta\.com|paypal\.com|stripe\.com|klarna\.com|swish\.nu|bankid\.com|tiktok\.com|reddit\.com|amazon\.com|yahoo\.com|zoom\.us|slack\.com|notion\.so|dropbox\.com|clerk\.com|clerk\.accounts\.dev)$/;
  const arInlogg = (u) => { try { return INLOGG.test(new URL(u, location.href).hostname); } catch { return false; } };
  const INTERAKTIV = "a[href],button,input,select,textarea,label,summary,video,audio,[role=button],[role=link],[role=menuitem],[role=tab],[onclick],[contenteditable=true]";
  let klick = null;
  let oppnade = 0;
  addEventListener("pointerdown", (e) => { klick = { t: performance.now(), el: e.composedPath?.()[0] || e.target }; oppnade = 0; }, true);

  // Ett osynligt eller sidtäckande element som ligger ovanpå allt är ett klassiskt reklamlock
  const arLock = (el) => {
    if (!(el instanceof Element)) return false;
    const st = getComputedStyle(el);
    if (st.position !== "fixed" && st.position !== "absolute") return false;
    const r = el.getBoundingClientRect();
    const tacker = r.width * r.height > innerWidth * innerHeight * 0.5;
    const osynlig = Number(st.opacity) < 0.1 || (st.backgroundColor === "rgba(0, 0, 0, 0)" && !el.textContent.trim() && !el.querySelector("img,video,canvas,svg,iframe"));
    return tacker && osynlig;
  };

  // Falsk fönster-handtag så att popunder-skript inte faller tillbaka på att flytta hela fliken
  const attrapp = () => {
    const noop = () => {};
    return new Proxy({ closed: false, close: noop, focus: noop, blur: noop, postMessage: noop, moveTo: noop, resizeTo: noop,
      document: { write: noop, writeln: noop, open: noop, close: noop }, location: { href: "about:blank", replace: noop, assign: noop } },
      { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
  };

  const original = window.open;
  const vaktadOpen = function open(url, ...rest) {
    const nyss = klick && performance.now() - klick.t < 2000 ? klick : null;
    const aktiv = navigator.userActivation ? navigator.userActivation.isActive : !!nyss;
    if (url && korsSajt(String(url))) {
      const el = nyss?.el instanceof Element ? nyss.el : null;
      const knapp = el && el.closest(INTERAKTIV);
      const fran = knapp && !arLock(knapp);
      const ok = aktiv && arInlogg(String(url));
      if (!ok && (!aktiv || (nyss && !fran) || oppnade > 0)) { signal(); return attrapp(); }
    }
    oppnade++;
    return original.call(this, url, ...rest);
  };
  vaktadOpen.toString = () => "function open() { [native code] }";
  window.open = vaktadOpen;

  // Klick på osynliga helsideslänkar (target=_blank till annan sajt): stoppa och plocka bort locket
  addEventListener("click", (e) => {
    const a = (e.composedPath?.() || []).find((n) => n instanceof HTMLAnchorElement);
    if (!a || !a.href || !korsSajt(a.href)) return;
    const lock = arLock(a) ? a : [...(e.composedPath?.() || [])].find((n) => n instanceof Element && n.contains(a) && arLock(n));
    if (!lock) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    lock.remove();
    signal();
  }, true);
})();
