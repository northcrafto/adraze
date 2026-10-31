// AdRaze-vakten körs i sidans egen värld innan sidans skript:
// stoppar popunders (window.open på klick som inte var på en länk/knapp)
// och osynliga helsideslänkar som skickar iväg en till reklam när man klickar var som helst.
(() => {
  if (window.__adrazeVakt) return;
  Object.defineProperty(window, "__adrazeVakt", { value: true });

  const signal = () => document.dispatchEvent(new CustomEvent("adraze:stoppad"));
  // Flerledade publika suffix (liten del av Public Suffix List): shop.example.co.uk -> example.co.uk
  const FLERLED = new Set(("co.uk org.uk ac.uk gov.uk me.uk net.uk ltd.uk plc.uk nhs.uk sch.uk police.uk " +
    "com.au net.au org.au edu.au gov.au asn.au id.au co.nz net.nz org.nz govt.nz ac.nz " +
    "co.jp ne.jp or.jp ac.jp go.jp gr.jp ed.jp lg.jp com.br net.br org.br gov.br edu.br " +
    "com.tr net.tr org.tr gen.tr biz.tr gov.tr edu.tr av.tr web.tr co.za org.za net.za gov.za ac.za web.za " +
    "com.mx org.mx net.mx gob.mx edu.mx com.ar net.ar org.ar gob.ar co.in net.in org.in gov.in ac.in firm.in gen.in ind.in " +
    "co.kr or.kr ne.kr go.kr ac.kr com.cn net.cn org.cn gov.cn edu.cn com.hk net.hk org.hk gov.hk edu.hk " +
    "com.sg net.sg org.sg gov.sg edu.sg com.tw net.tw org.tw gov.tw edu.tw com.my net.my org.my gov.my " +
    "co.id or.id web.id go.id ac.id co.th in.th or.th go.th ac.th com.ph net.ph org.ph gov.ph com.vn net.vn gov.vn " +
    "com.pk net.pk org.pk com.sa net.sa org.sa gov.sa com.eg org.eg gov.eg com.ng org.ng gov.ng co.ke or.ke go.ke " +
    "co.il org.il ac.il gov.il com.ua net.ua org.ua in.ua com.pl net.pl org.pl co.at or.at gv.at ac.at com.es org.es gob.es " +
    "com.co net.co org.co gov.co com.pe org.pe gob.pe com.ve co.ve com.uy com.ec com.bo com.py com.gt com.do com.pa com.sv " +
    "co.cr com.cu com.ru net.ru org.ru com.gr com.cy com.mt com.ro co.hu com.pt co.ma com.qa com.kw com.bh com.om " +
    "co.ae com.lb com.jo com.ge com.az com.kz co.uz com.bd com.np com.lk com.mm com.kh com.af com.gh com.et co.tz co.ug co.zm co.zw " +
    "github.io gitlab.io vercel.app netlify.app pages.dev workers.dev web.app firebaseapp.com appspot.com herokuapp.com " +
    "blogspot.com onrender.com glitch.me azurewebsites.net cloudfront.net fly.dev").split(" "));
  const sajt = (h) => {
    h = h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (/^[\d.]+$/.test(h) || h.includes(":")) return h; // IP-adress
    const d = h.split(".");
    return d.slice(FLERLED.has(d.slice(-2).join(".")) ? -3 : -2).join(".");
  };
  const egen = sajt(location.hostname);
  const korsSajt = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) && sajt(x.hostname) !== egen; } catch { return false; } };

  // Inloggning och betalning öppnas alltid när användaren faktiskt klickat
  const INLOGG = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|appleid\.cdn-apple\.com|login\.microsoftonline\.com|login\.microsoft\.com|login\.live\.com|facebook\.com|github\.com|gitlab\.com|bitbucket\.org|discord\.com|twitter\.com|x\.com|api\.twitter\.com|linkedin\.com|twitch\.tv|id\.twitch\.tv|steamcommunity\.com|accounts\.spotify\.com|auth0\.com|okta\.com|oktapreview\.com|onelogin\.com|id\.atlassian\.com|auth\.atlassian\.com|auth\.openai\.com|accounts\.firefox\.com|oauth\.vk\.com|id\.vk\.com|access\.line\.me|kauth\.kakao\.com|nid\.naver\.com|oauth\.yandex\.(ru|com)|b2clogin\.com|paypal\.com|stripe\.com|klarna\.com|swish\.nu|bankid\.com|pay\.google\.com|wallet\.google\.com|trustly\.com|dibspayment\.eu|nets\.eu|vipps\.no|mobilepay\.(dk|fi)|qliro\.com|svea\.com|walley\.(se|no|fi|dk)|resurs\.(se|com)|adyen\.com|mollie\.com|shop\.app|checkout\.com|worldpay\.com|tiktok\.com|reddit\.com|amazon\.com|yahoo\.com|zoom\.us|slack\.com|notion\.so|dropbox\.com|figma\.com|clerk\.com|clerk\.accounts\.dev)$/;
  const arInlogg = (u) => { try { return INLOGG.test(new URL(u, location.href).hostname); } catch { return false; } };
  // Vanliga OAuth-/inloggningssökvägar hos okända leverantörer (Auth0/Okta på egna domäner m.fl.)
  const INLOGG_VAG = /\/(oauth2?|openid|saml2?|sso|authorize|auth\/(realms|login|authorize)|sign-?in|log-?in)(\/|$|\?|\.)/i;
  const arInloggVag = (u) => { try { return INLOGG_VAG.test(new URL(u, location.href).pathname); } catch { return false; } };
  const INTERAKTIV = "a[href],button,input,select,textarea,label,summary,video,audio,[role=button],[role=link],[role=menuitem],[role=tab],[onclick],[contenteditable=true]";
  // Kort knapptext för inloggning/betalning (span/div utan annan knappsignal)
  const KNAPPTEXT = /^\W*(sign|log)\s*-?\s*(in|on|up)\b|\b(logga in|continue with|fortsätt med|betala|pay with|checkout|till kassan|connect with|anmelden|se connecter|iniciar sesión)\b/i;
  // Inbyggda funktioner vi byter ut ska se ut som förut (toString, length, ingen prototype)
  const akta = new WeakMap();
  const origToString = Function.prototype.toString;
  const maskTs = { toString() { "use strict"; return Reflect.apply(origToString, akta.get(this) || this, arguments); } }.toString;
  akta.set(maskTs, origToString);
  Function.prototype.toString = maskTs;
  const byt = (obj, namn, ny) => { akta.set(ny, obj[namn]); obj[namn] = ny; };
  const origAdd = EventTarget.prototype.addEventListener;

  // Senaste riktiga klick och tangenttryck (egna lyssnare läggs till med originalet så att de inte räknas)
  let klick = null;
  let tangent = -1;
  let oppnade = 0;
  Reflect.apply(origAdd, window, ["pointerdown", (e) => { if (!e.isTrusted) return; klick = { t: performance.now(), el: e.composedPath?.()[0] || e.target }; oppnade = 0; }, true]);
  Reflect.apply(origAdd, window, ["keydown", (e) => { if (e.isTrusted) tangent = performance.now(); }, true]);

  // Klicklyssnare per element (även document/window). Nyckeln är funktionens källkod, så att samma
  // lyssnare på massor av element räknas som massa även när varje element får en egen closure.
  const KLICKTYP = new Set(["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "auxclick"]);
  const egna = new WeakMap();
  const antal = new Map();
  const bunden = new WeakMap(); // f.bind(...) -> f
  const MASS = 12;
  const nyckel = (f) => {
    for (let i = 0; i < 10 && bunden.has(f); i++) f = bunden.get(f);
    if (typeof f === "function" && typeof f.value === "function") f = f.value; // Vue: anropare med .value
    if (typeof f !== "function") return f;
    let s;
    try { s = Reflect.apply(origToString, f, []); } catch { return f; }
    return s.includes("[native code]") ? f : s.length > 600 ? `${s.length}:${s.slice(0, 300)}${s.slice(-300)}` : s;
  };
  const registrera = (mal, lyss) => {
    try {
      const k = nyckel(lyss);
      const l = egna.get(mal) || [];
      if (!l.includes(k)) { l.push(k); egna.set(mal, l); antal.set(k, (antal.get(k) || 0) + 1); }
    } catch {} // sidans egen lyssnare får aldrig fallera på grund av oss
  };
  byt(EventTarget.prototype, "addEventListener", { addEventListener(typ, lyss) {
    "use strict";
    if ((this instanceof Element || this instanceof ShadowRoot || this === window || this === document) && KLICKTYP.has(typ) && lyss && (typeof lyss === "object" || typeof lyss === "function")) registrera(this, lyss);
    return Reflect.apply(origAdd, this, arguments);
  } }.addEventListener);
  // el.onclick = ... räknas också
  for (const proto of [HTMLElement.prototype, SVGElement.prototype]) for (const typ of KLICKTYP) {
    const namn = "on" + typ;
    const d = Object.getOwnPropertyDescriptor(proto, namn);
    if (!d || !d.set || !d.configurable) continue;
    const set = Object.getOwnPropertyDescriptor({ set [namn](v) { "use strict"; if (this instanceof Element && typeof v === "function") registrera(this, v); return Reflect.apply(d.set, this, arguments); } }, namn).set;
    akta.set(set, d.set);
    Object.defineProperty(proto, namn, { ...d, set });
  }
  const origBind = Function.prototype.bind;
  byt(Function.prototype, "bind", { bind(_) { "use strict"; const b = Reflect.apply(origBind, this, arguments); bunden.set(b, this); return b; } }.bind);
  const PROP = [...KLICKTYP].map((t) => "on" + t);
  const harLyss = (n) => !!egna.get(n)?.length || PROP.some((p) => { try { return typeof n[p] === "function"; } catch { return false; } });

  // Klickhändelsen som skickas ut just nu (eventPhase != 0 tills utskicket är klart). Dess currentTarget
  // är lyssnarens element även där window.event saknas: i shadow DOM och i mikrouppgifter efter lyssnaren.
  let pagaende = null;
  for (const typ of KLICKTYP) Reflect.apply(origAdd, window, [typ, (e) => { pagaende = e; }, true]);

  // Vem startade koden som körs nu? { lyss, klick, el } eller null (inget användarklick)
  let tidKontext = null;
  const kontext = () => {
    const ev = window.event;
    const p = pagaende && pagaende.eventPhase !== 0 ? pagaende : null;
    // Syntetiskt (skript-utlöst) klick: lyss = null, så det räknas aldrig som användarens klick
    if (ev && ev !== p) return KLICKTYP.has(ev.type) ? { lyss: ev.isTrusted ? ev.currentTarget : null, klick } : null;
    if (p) return { lyss: p.isTrusted ? p.currentTarget : null, klick, el: p.composedPath()[0] };
    return tidKontext;
  };
  for (const namn of ["setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask"]) {
    const orig = window[namn];
    if (typeof orig !== "function") continue;
    byt(window, namn, { [namn](fn) {
      "use strict";
      const k = kontext();
      if (!k || typeof fn !== "function") return Reflect.apply(orig, this, arguments);
      const args = [...arguments];
      args[0] = function () { const f = tidKontext; tidKontext = k; try { return Reflect.apply(fn, this, arguments); } finally { tidKontext = f; } };
      return Reflect.apply(orig, this, args);
    } }[namn]);
  }

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
  // Tomt/genomskinligt element (t.ex. osynlig ruta över en spelares play-knapp): ingen riktig knapp
  const MEDIA = "img,video,canvas,svg,iframe,picture,object,embed,input";
  const ritad = (x) => {
    const st = getComputedStyle(x);
    return st.backgroundColor !== "rgba(0, 0, 0, 0)" || st.backgroundImage !== "none" || st.boxShadow !== "none" ||
      ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(st[`border${s}Width`]) > 0 && st[`border${s}Style`] !== "none" && st[`border${s}Color`] !== "rgba(0, 0, 0, 0)") ||
      ["::before", "::after"].some((p) => !/^(none|normal)$/.test(getComputedStyle(x, p).content));
  };
  const tom = (n) => {
    const st = getComputedStyle(n);
    if (Number(st.opacity) < 0.1 || st.visibility === "hidden") return true;
    if (n.localName.includes("-") || n.textContent.trim() || n.matches(MEDIA) || n.querySelector(MEDIA)) return false;
    if (n.shadowRoot && (n.shadowRoot.textContent.trim() || n.shadowRoot.querySelector(MEDIA))) return false;
    return ![n, ...[...n.querySelectorAll("*")].slice(0, 50)].some(ritad);
  };

  // Hjälpare för klickmålet: gå uppåt (även ut ur shadow DOM) men aldrig till body/html
  const upp = (n) => n.parentElement || n.getRootNode?.().host || null;
  const arRot = (n) => !n || n === document.body || n === document.documentElement;
  const arGlob = (n) => n === window || n === document || arRot(n);
  // Knappstort: högst 15 % av fönstret och högst 80 000 px² (en spelare eller sidbehållare är större)
  const liten = (n) => { const r = n.getBoundingClientRect(); return r.width * r.height <= Math.min(innerWidth * innerHeight * 0.15, 80000); };
  const kedja = (el, slut) => { const ut = []; for (let n = el, i = 0; n && !arRot(n) && i < 30; n = upp(n), i++) { ut.push(n); if (n === slut) break; } return ut; };
  const knapptext = (el, slut) => kedja(el, slut).some((n) => liten(n) && n.textContent.length <= 60 && KNAPPTEXT.test(n.textContent.trim()));
  // Ser ut som en knapp: litet element med tabindex, "egen" cursor:pointer (inte ärvd från stor behållare) eller kort knapptext
  const knapplik = (el, slut) => {
    if (kedja(el, slut).some((n) => n.hasAttribute("tabindex") && liten(n))) return true;
    if (getComputedStyle(el).cursor === "pointer") {
      let agare = el;
      for (let n = upp(el), i = 0; n && i < 30 && getComputedStyle(n).cursor === "pointer"; n = upp(n), i++) agare = n;
      if (!arRot(agare) && liten(agare)) return true;
    }
    return knapptext(el, slut);
  };
  // Klicklyssnare på document/window/body eller en stor behållare runt klickmålet (popunder-mönstret)
  const storLyss = (el) => [window, document, document.documentElement, document.body].some((n) => n && harLyss(n)) ||
    kedja(el).some((n) => !liten(n) && harLyss(n));
  // Alla lyssnare på m (sitter på n) finns på minst MASS element eller även på ett annat element på
  // klickvägen/document (popunder-skript som lyssnar på allt). En riktig knapp har en egen lyssnare.
  const baraMass = (m, n, el) => {
    const l = egna.get(m);
    if (!l || !l.length) return false;
    const vag = [...kedja(el), document.body, document.documentElement, document, window].filter((x) => x && x !== n && x !== m).flatMap((x) => egna.get(x) || []);
    return l.every((k) => antal.get(k) >= MASS || vag.includes(k));
  };
  // Lyssnaren på ett litet element: massa-lyssnare godtas bara med tydlig inloggning/betalning
  const egenOk = (n, el, vagU, m = n) => harLyss(m) && (!baraMass(m, n, el) || (knapplik(el, n) && (vagU || knapptext(el, n))));

  // Falsk fönster-handtag så att popunder-skript inte faller tillbaka på att flytta hela fliken
  const attrapp = () => {
    const noop = () => {};
    return new Proxy({ closed: false, close: noop, focus: noop, blur: noop, postMessage: noop, moveTo: noop, resizeTo: noop,
      document: { write: noop, writeln: noop, open: noop, close: noop }, location: { href: "about:blank", replace: noop, assign: noop } },
      { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
  };

  // Får ett klick på ett element utan knapp/länk öppna ett fönster? Bara när lyssnaren sitter på själva
  // (lilla, synliga) elementet, aldrig på document/window/body eller en stor behållare (popunder-mönstret)
  const egetKlick = (el, u, features) => {
    // Vilken lyssnare körs? undefined = okänt (efter await/fetch o.d.)
    const k = kontext();
    let lyss;
    if (k) { lyss = k.klick === klick ? k.lyss : null; if (k.el instanceof Element) el = k.el; }
    else if (window.event) lyss = null; // annan händelse (meddelande, tangent o.d.)
    const vagU = arInloggVag(u);
    const stark = /(^|[\s,])(width|height|popup)\b/i.test(features) || vagU;
    if (lyss === undefined) {
      // Okänd lyssnare: kräv fönsterfeatures/inloggningssökväg och egen lyssnare på ett litet synligt element.
      // Finns lyssnare på document/body/stor behållare kan det lika gärna vara de, då krävs inloggningssökväg.
      if (!stark || (!vagU && storLyss(el))) return false;
      return kedja(el).some((n) => liten(n) && egenOk(n, el, vagU) && !tom(n));
    }
    const m = lyss; // lyssnare på en shadowRoot räknas på dess värdelement
    if (lyss instanceof ShadowRoot) lyss = lyss.host;
    if (!(lyss instanceof Element) || arGlob(lyss)) return false;
    const vag = kedja(el, lyss);
    if (vag[vag.length - 1] !== lyss) return false; // lyssnaren innehåller inte klickmålet
    if (liten(lyss)) return (stark || knapplik(el, lyss)) && egenOk(lyss, el, vagU, m) && !tom(lyss);
    // React m.fl.: lyssnaren på rotbehållaren, onClick syns som onclick-funktion på det lilla elementet
    return (vagU || knapplik(el, lyss)) && vag.some((n) => n !== lyss && typeof n.onclick === "function" && liten(n) && !tom(n));
  };

  // Länkar till andra sajter som man nyss klickat på (de 5 senaste, i 60 s). "Du lämnar …"-rutor (Chrome
  // Web Store, Discord m.fl.) stoppar länken och öppnar sidan först när man bekräftar i rutan: då får
  // fönstret öppnas även om bekräftelsen inte ser ut som en knapp. Osynliga reklamlock räknas aldrig.
  let lankar = [];
  const minnsLank = (e) => {
    if (!e.isTrusted) return;
    const vag = e.composedPath?.() || [];
    const a = vag.find((n) => n instanceof HTMLAnchorElement && n.href);
    if (!a || !korsSajt(a.href) || arLock(a) || vag.some((n) => n instanceof Element && n !== a && n.contains(a) && arLock(n))) return;
    let h;
    try { h = new URL(a.href, location.href).hostname; } catch { return; }
    const t = performance.now();
    lankar = [...lankar.filter((l) => t - l.t < 60000).slice(-4), { t, sajt: sajt(h) }];
  };
  Reflect.apply(origAdd, window, ["click", minnsLank, true]);
  Reflect.apply(origAdd, window, ["auxclick", minnsLank, true]);
  const nyssLank = (u) => {
    try {
      const s = sajt(new URL(u, location.href).hostname);
      const t = performance.now();
      return lankar.some((l) => t - l.t < 60000 && l.sajt === s);
    } catch { return false; }
  };

  const original = window.open;
  byt(window, "open", { open() {
    "use strict";
    const url = arguments[0];
    const nu = performance.now();
    // Klicket gäller i 2 s, och upp till 5 s (aktiveringens livslängd) om inget tangenttryck kommit efter
    const nyss = klick && (nu - klick.t < 2000 || (nu - klick.t < 5000 && klick.t > tangent)) ? klick : null;
    const aktiv = navigator.userActivation ? navigator.userActivation.isActive : !!nyss;
    if (url && korsSajt(String(url))) {
      const u = String(url);
      const el = nyss?.el instanceof Element ? nyss.el : null;
      let ok = aktiv && arInlogg(u);
      if (!ok && aktiv && oppnade === 0) {
        if (!nyss) ok = true; // tangentbord o.d., som förut
        else if (el) {
          const knapp = el.closest(INTERAKTIV);
          ok = knapp ? !arLock(knapp) : egetKlick(el, u, String(arguments[2] || ""));
        }
        // Bekräftelse i en "Du lämnar …"-ruta för en länk man nyss klickade på
        if (!ok) ok = nyssLank(u);
      }
      if (!ok) { signal(); return attrapp(); }
    }
    oppnade++;
    return Reflect.apply(original, this, arguments);
  } }.open);

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
