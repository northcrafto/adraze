"use strict";
// Scriptlets för tillägget: små skript som filterlistornas ##+js(namn, arg…) kör i sidans egen värld
// (MAIN) vid document_start, före sidans skript. De desarmerar reklamspärrar ("stäng av din
// blockerare"), timers, popunders och overlays som listorna pekar ut.
//
// Samma uppsättning som webbläsarens browser/adblock-scriptlets.js (portad till funktioner som tar
// argumenten) plus några vanliga till. Semantiken följer uBO-dokumentationen för respektive namn:
// tomma argument loggar bara (gör ingenting), set-constant/set-cookie/set-*-storage-item tar bara
// ofarliga värden, och ett okänt scriptlet hoppas över.
//
// tools/build.js samlar ##+js-filtren per scriptlet-namn och skriver extension/scriptlets/<namn>.js
// (funktionen + argumenttabell + värdtabell). Bakgrundsskriptet registrerar varje fil bara för de
// värdar den gäller. Funktionerna serialiseras med toString(): de får bara använda varandra via
// hjälparna i HJALP (som följer med i varje fil), inga andra variabler utifrån.

// ── Hjälpare (följer med i varje genererad fil) ──
const HJALP = [
  // uBO-mönster → RegExp: "" = allt, /re/flaggor = riktig regex, annars bokstavlig text
  function arRe(monster, flaggor, exakt) {
    if (monster === undefined || monster === null || monster === "") return /^/;
    const m = /^\/(.+)\/([dgimsuvy]*)$/.exec(monster);
    if (m) { try { return new RegExp(m[1], m[2]); } catch (e) { return /[^\s\S]/; } }
    const t = String(monster).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(exakt ? "^" + t + "$" : t, flaggor);
  },
  // "!mönster" = negerat
  function arMonster(monster) {
    monster = monster === undefined || monster === null ? "" : String(monster);
    const inte = monster.charAt(0) === "!";
    return { re: arRe(inte ? monster.slice(1) : monster), inte, tomt: monster === "" };
  },
  function arTraffar(m, text) { return m.re.test(String(text)) !== m.inte; },
  // Extra argument i par efter de vanliga: "namn, värde, …" → { namn: värde }
  function arExtra(args, fran) {
    const ut = {};
    for (let i = fran; i + 1 < args.length; i += 2) ut[args[i]] = args[i + 1];
    return ut;
  },
  // Kör när dokumentet nått ett visst läge ("loading" = direkt, "interactive", "complete")
  function arNar(fn, lage) {
    const ordning = { loading: 1, interactive: 2, complete: 3 };
    const mal = ordning[lage] || 2;
    if ((ordning[document.readyState] || 1) >= mal) { fn(); return; }
    const lyss = () => {
      if ((ordning[document.readyState] || 1) < mal) return;
      document.removeEventListener("readystatechange", lyss, true);
      fn();
    };
    document.addEventListener("readystatechange", lyss, true);
  },
  // Felet som avbryter ett skript: tyst i konsolen
  function arAvbrott() {
    if (!arAvbrott.text) {
      arAvbrott.text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
      window.addEventListener("error", (e) => { if (String(e.message).includes(arAvbrott.text)) e.preventDefault(); }, true);
    }
    return new ReferenceError(arAvbrott.text);
  },
  // Värden som set-cookie/set-*-storage-item får sätta (inga godtyckliga strängar)
  function arSakertVarde(v, tal) {
    const SAKRA = ["accept", "reject", "accepted", "rejected", "notaccepted", "allow", "disallow", "deny", "allowed", "denied",
      "approved", "disapproved", "checked", "unchecked", "dismiss", "dismissed", "enable", "disable", "enabled", "disabled",
      "essential", "nonessential", "forbidden", "forever", "hide", "hidden", "necessary", "required", "ok", "on", "off",
      "true", "t", "false", "f", "yes", "y", "no", "n", "all", "none", "functional", "granted", "done", "decline", "declined",
      "closed", "next", "mandatory", "disagree", "agree"];
    const n = String(v).toLowerCase();
    const m = /^("?)(.+)\1$/.exec(n);
    const u = (m && m[2]) || n;
    if (SAKRA.includes(u)) return true;
    if (!/^-?\d+$/.test(u)) return false;
    const x = parseInt(u, 10) || 0;
    return x >= -tal && x <= tal;
  },
  // Normaliserad stack för abort-on-stack-trace m.fl. (inlineScript = sidans egen kod, injectedScript = eval o.d.)
  function arStack(m) {
    const fel = new Error(arAvbrott().message);
    const sida = location.href.split("#")[0];
    const rader = [];
    for (let rad of String(fel.stack).split(/[\n\r]+/)) {
      rad = rad.trim();
      const t = /(.*?@)?(\S+)(:\d+):\d+\)?$/.exec(rad);
      if (!t) continue;
      let url = t[2];
      if (url.startsWith("(")) url = url.slice(1);
      if (url === sida) url = "inlineScript";
      else if (url.startsWith("<anonymous>")) url = "injectedScript";
      let fn = t[1] !== undefined ? t[1].slice(0, -1) : rad.slice(0, t.index).trim();
      if (fn.startsWith("at")) fn = fn.slice(2).trim();
      rader.push(" " + (fn + " " + url + t[3] + ":1").trim());
    }
    rader[0] = "stackDepth:" + (rader.length - 1);
    return arTraffar(m, rader.join("\t"));
  },
  // "url:/re/ method:POST" (eller bara ett mönster för adressen) → [[egenskap, mönster]]
  function arEgenskaper(text) {
    const ut = [];
    if (!text) return ut;
    for (const bit of String(text).split(/\s+/)) {
      if (!bit) continue;
      const i = bit.indexOf(":");
      let namn = i > 0 ? bit.slice(0, i) : "";
      let monster = i > 0 ? bit.slice(i + 1) : bit;
      if (namn && /[^$\w -]/.test(namn)) { namn = ""; monster = bit; }
      ut.push([namn || "url", arMonster(monster)]);
    }
    return ut;
  },
  function arMatchar(nalar, egenskaper) {
    if (!nalar.length) return false;
    for (const [namn, m] of nalar) {
      const v = egenskaper[namn];
      if (v === undefined || !arTraffar(m, v)) return false;
    }
    return true;
  },
  // Påhittat svar för prevent-fetch/prevent-xhr: "", true, false, emptyObj, emptyArr, emptyStr, length:N(-M)
  function arSvarText(d) {
    if (!d || d === "emptyStr") return "";
    if (d === "true" || d === "false") return d;
    if (d === "emptyObj") return "{}";
    if (d === "emptyArr") return "[]";
    const m = /^length:(\d+)(?:-(\d+))?$/.exec(d);
    if (m) {
      const min = Math.min(+m[1], 500000);
      const max = m[2] ? Math.min(+m[2], 500000) : min;
      let n = min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));
      let s = "";
      while (s.length < n) s += Math.random().toString(36).slice(2);
      return s.slice(0, n);
    }
    return "";
  },
];

// ── Scriptlets: namn → funktion(argument…) ──
const KIT = {
  // Sätt window.a.b.c till ett av de tillåtna värdena och håll det där
  "set-constant": function setConstant(kedja, varde, ...extra) {
    if (!kedja) return;
    let v;
    switch (varde === undefined ? "" : varde) {
      case "undefined": v = undefined; break;
      case "false": v = false; break;
      case "true": v = true; break;
      case "null": v = null; break;
      case "''": case "\"\"": case "": case "emptyStr": v = ""; break;
      case "[]": case "emptyArr": v = []; break;
      case "{}": case "emptyObj": v = {}; break;
      case "noopFunc": v = function () {}; break;
      case "noopCallbackFunc": v = function () { return function () {}; }; break;
      case "trueFunc": v = function () { return true; }; break;
      case "falseFunc": v = function () { return false; }; break;
      case "throwFunc": v = function () { throw arAvbrott(); }; break;
      case "yes": case "no": v = varde; break;
      default:
        if (!/^-?\d+$/.test(varde)) return;
        v = parseInt(varde, 10);
        if (Math.abs(v) > 0x7fff) return;
    }
    const som = arExtra(extra, 0).as;
    if (som === "function") { const w = v; v = function () { return w; }; }
    else if (som === "callback") { const w = v; v = function () { return function () { return w; }; }; }
    else if (som === "resolved") v = Promise.resolve(v);
    else if (som === "rejected") { v = Promise.reject(v); v.catch(() => {}); }
    // Sätter sidan själv ett värde av en annan typ ger vi upp (då är det något annat än vi trodde)
    let gavUpp = false, sidans;
    const fel = (x) => {
      if (gavUpp) return true;
      gavUpp = x !== undefined && x !== null && v !== undefined && v !== null && typeof x !== typeof v;
      return gavUpp;
    };
    const fanga = (agare, prop, konf, h) => {
      if (h.init(konf ? agare[prop] : v) === false) return;
      const d = Object.getOwnPropertyDescriptor(agare, prop);
      let fg, fs;
      if (d instanceof Object) {
        try { agare[prop] = v; } catch (e) {}
        if (d.get instanceof Function) fg = d.get;
        if (d.set instanceof Function) fs = d.set;
      }
      try {
        Object.defineProperty(agare, prop, {
          configurable: konf,
          get() { if (fg !== undefined) fg.call(this); return h.get(); },
          set(a) { if (fs !== undefined) fs.call(this, a); h.set(a); },
        });
      } catch (e) {}
    };
    const kedjaPa = (agare, k) => {
      const i = k.indexOf(".");
      if (i === -1) {
        fanga(agare, k, false, {
          init(x) { return !fel(x); },
          get() { return gavUpp ? sidans : v; },
          set(a) { if (fel(a)) sidans = a; },
        });
        return;
      }
      const prop = k.slice(0, i), rest = k.slice(i + 1);
      const nu = agare[prop];
      if (nu instanceof Object || (typeof nu === "object" && nu !== null)) { kedjaPa(nu, rest); return; }
      let lagrat;
      fanga(agare, prop, true, {
        init(x) { lagrat = x; return true; },
        get() { return lagrat; },
        set(a) { lagrat = a; if (a instanceof Object) kedjaPa(a, rest); },
      });
    };
    kedjaPa(window, kedja);
  },

  // Kasta fel när window.a.b läses (desarmerar skript som läser en flagga eller ett annons-API)
  "abort-on-property-read": function abortOnPropertyRead(kedja) {
    if (!kedja) return;
    const avbryt = () => { throw arAvbrott(); };
    const proxy = (agare, k) => {
      const i = k.indexOf(".");
      if (i === -1) {
        const d = Object.getOwnPropertyDescriptor(agare, k);
        if (!d || d.get !== avbryt) { try { Object.defineProperty(agare, k, { get: avbryt, set() {} }); } catch (e) {} }
        return;
      }
      const prop = k.slice(0, i), rest = k.slice(i + 1);
      let v = agare[prop];
      if (v) { proxy(v, rest); return; }
      const d = Object.getOwnPropertyDescriptor(agare, prop);
      if (d && d.set !== undefined) return;
      try {
        Object.defineProperty(agare, prop, {
          get() { return v; },
          set(a) { v = a; if (a instanceof Object) proxy(a, rest); },
        });
      } catch (e) {}
    };
    proxy(window, kedja);
  },

  // Kasta fel när window.a.b skrivs
  "abort-on-property-write": function abortOnPropertyWrite(prop) {
    if (!prop) return;
    let agare = window;
    for (;;) {
      const i = prop.indexOf(".");
      if (i === -1) break;
      agare = agare[prop.slice(0, i)];
      if (!(agare instanceof Object)) return;
      prop = prop.slice(i + 1);
    }
    try { delete agare[prop]; } catch (e) {}
    try { Object.defineProperty(agare, prop, { set() { throw arAvbrott(); } }); } catch (e) {}
  },

  // Avbryt skriptet som körs just nu om det använder window.a.b och dess text matchar
  "abort-current-script": function abortCurrentScript(mal, nal, sammanhang) {
    if (!mal) return;
    const reNal = arRe(nal || "");
    const reSam = arRe(sammanhang || "");
    const delar = mal.split(".");
    let agare = window, prop;
    for (;;) {
      prop = delar.shift();
      if (!delar.length) break;
      if (!(prop in agare)) break;
      agare = agare[prop];
      if (!(agare instanceof Object)) return;
    }
    let varde, d = Object.getOwnPropertyDescriptor(agare, prop);
    if (!(d instanceof Object) || !(d.get instanceof Function)) { varde = agare[prop]; d = undefined; }
    const textAv = Object.getOwnPropertyDescriptor(Node.prototype, "textContent").get;
    const texter = new WeakMap();
    const skriptText = (el) => {
      let t = textAv.call(el);
      if (t.trim() !== "") return t;
      if (texter.has(el)) return texter.get(el);
      const [, mime, inne] = /^data:([^,]*),(.+)$/.exec(String(el.src).trim()) || ["", "", ""];
      try { t = mime.endsWith(";base64") ? atob(inne) : decodeURIComponent(inne); } catch (e) {}
      texter.set(el, t);
      return t;
    };
    const prova = () => {
      const el = document.currentScript;
      if (!(el instanceof HTMLScriptElement)) return;
      if (sammanhang && !reSam.test(el.src)) return;
      if (!reNal.test(skriptText(el))) return;
      throw arAvbrott();
    };
    try {
      Object.defineProperty(agare, prop, {
        get() { prova(); return d ? d.get.call(agare) : varde; },
        set(a) { prova(); if (d) { if (d.set) d.set.call(agare, a); } else varde = a; },
      });
    } catch (e) {}
  },

  // Släng addEventListener-anrop vars typ och lyssnarkod matchar (båda tomma = gör ingenting)
  "addEventListener-defuser": function addEventListenerDefuser(typ, monster, ...extra) {
    typ = typ || ""; monster = monster || "";
    if (typ === "" && monster === "") return;
    const reTyp = arRe(typ === "*" ? "" : typ, undefined, true);
    const reMon = arRe(monster === "*" ? "" : monster);
    const element = arExtra(extra, 0).elements;
    const fts = Function.prototype.toString;
    const passar = (detta) => {
      if (!element) return true;
      if (element === "window") return detta === window;
      if (element === "document") return detta === document;
      try { return detta instanceof Element && detta.matches(element); } catch (e) { return false; }
    };
    const fangare = {
      apply(f, detta, args) {
        let t = "", h = "";
        try {
          t = String(args[0]);
          const l = args[1];
          if (typeof l === "function") h = fts.call(l);
          else if (l && typeof l === "object" && typeof l.handleEvent === "function") h = fts.call(l.handleEvent);
          else h = String(l);
        } catch (e) {}
        if (reTyp.test(t) && reMon.test(h) && passar(detta)) return undefined;
        return Reflect.apply(f, detta, args);
      },
    };
    EventTarget.prototype.addEventListener = new Proxy(EventTarget.prototype.addEventListener, fangare);
  },

  // Byt ut setTimeout-anrop vars kod (och ev. fördröjning) matchar mot en tom funktion
  "no-setTimeout-if": function noSetTimeoutIf(nal, fordrojning) {
    nal = nal || ""; fordrojning = fordrojning || "";
    if (nal === "" && fordrojning === "") return;
    const m = arMonster(nal);
    const dInte = fordrojning.charAt(0) === "!";
    const d = fordrojning !== "" ? parseInt(dInte ? fordrojning.slice(1) : fordrojning, 10) : undefined;
    const fts = Function.prototype.toString;
    window.setTimeout = new Proxy(window.setTimeout, {
      apply(f, detta, args) {
        try {
          const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
          const tid = d === undefined || ((+args[1] || 0) === d) !== dInte;
          if (arTraffar(m, kod) && tid) args[0] = function () {};
        } catch (e) {}
        return Reflect.apply(f, detta, args);
      },
    });
  },

  "no-setInterval-if": function noSetIntervalIf(nal, fordrojning) {
    nal = nal || ""; fordrojning = fordrojning || "";
    if (nal === "" && fordrojning === "") return;
    const m = arMonster(nal);
    const dInte = fordrojning.charAt(0) === "!";
    const d = fordrojning !== "" ? parseInt(dInte ? fordrojning.slice(1) : fordrojning, 10) : undefined;
    const fts = Function.prototype.toString;
    window.setInterval = new Proxy(window.setInterval, {
      apply(f, detta, args) {
        try {
          const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
          const tid = d === undefined || ((+args[1] || 0) === d) !== dInte;
          if (arTraffar(m, kod) && tid) args[0] = function () {};
        } catch (e) {}
        return Reflect.apply(f, detta, args);
      },
    });
  },

  // Snabba upp (eller sakta ner) timers vars kod matchar: nedräkningar på nedladdningssidor
  "adjust-setTimeout": function adjustSetTimeout(nal, fordrojning, faktor) {
    const re = arRe(nal || "");
    let d = fordrojning !== "*" ? parseInt(fordrojning, 10) : -1;
    if (isNaN(d) || !isFinite(d)) d = 1000;
    let k = parseFloat(faktor);
    k = !isNaN(k) && isFinite(k) ? Math.min(Math.max(k, 0.001), 50) : 0.05;
    const fts = Function.prototype.toString;
    window.setTimeout = new Proxy(window.setTimeout, {
      apply(f, detta, args) {
        try {
          const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
          if ((d === -1 || +args[1] === d) && re.test(kod)) args[1] = (+args[1] || 0) * k;
        } catch (e) {}
        return Reflect.apply(f, detta, args);
      },
    });
  },

  "adjust-setInterval": function adjustSetInterval(nal, fordrojning, faktor) {
    const re = arRe(nal || "");
    let d = fordrojning !== "*" ? parseInt(fordrojning, 10) : -1;
    if (isNaN(d) || !isFinite(d)) d = 1000;
    let k = parseFloat(faktor);
    k = !isNaN(k) && isFinite(k) ? Math.min(Math.max(k, 0.001), 50) : 0.05;
    const fts = Function.prototype.toString;
    window.setInterval = new Proxy(window.setInterval, {
      apply(f, detta, args) {
        try {
          const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
          if ((d === -1 || +args[1] === d) && re.test(kod)) args[1] = (+args[1] || 0) * k;
        } catch (e) {}
        return Reflect.apply(f, detta, args);
      },
    });
  },

  // Stäng av WebRTC (spårning och IP-läckor via RTCPeerConnection)
  "nowebrtc": function nowebrtc() {
    const namn = window.RTCPeerConnection ? "RTCPeerConnection" : window.webkitRTCPeerConnection ? "webkitRTCPeerConnection" : "";
    if (!namn) return;
    const noop = function () {};
    const Falsk = function () {};
    Falsk.prototype = { close: noop, createDataChannel: noop, createOffer: noop, setRemoteDescription: noop, toString() { return "[object RTCPeerConnection]"; } };
    const orig = window[namn];
    window[namn] = Falsk.bind(window);
    if (orig && orig.prototype) {
      try { orig.prototype.createDataChannel = function () { return { close() {}, send() {} }; }.bind(null); } catch (e) {}
    }
  },

  // Ta bort attribut från element (vid DOMContentLoaded, "asap" = direkt, "stay" = även senare ändringar)
  "remove-attr": function removeAttr(attr, sel, beteende) {
    if (!attr) return;
    sel = sel || ""; beteende = beteende || "";
    const namn = attr.split(/\s*\|\s*/).filter(Boolean);
    const q = namn.map((a) => sel + "[" + CSS.escape(a) + "]").join(",");
    const asap = /\basap\b/.test(beteende);
    let vantar = false;
    const kor = () => {
      vantar = false;
      try { for (const el of document.querySelectorAll(q)) for (const a of namn) el.removeAttribute(a); } catch (e) {}
    };
    const senare = () => { if (vantar) return; vantar = true; setTimeout(kor, 17); };
    const start = () => {
      kor();
      if (!/\bstay\b/.test(beteende)) return;
      new MutationObserver((andr) => {
        for (const a of andr) {
          if (a.type === "attributes" || [...a.addedNodes].some((n) => n.nodeType === 1)) { if (asap) kor(); else senare(); return; }
        }
      }).observe(document, { attributes: true, attributeFilter: namn, childList: true, subtree: true });
    };
    arNar(start, asap ? "loading" : /\bcomplete\b/.test(beteende) ? "complete" : "interactive");
  },

  // Ta bort klasser från element (samma beteenden som remove-attr)
  "remove-class": function removeClass(klasser, sel, beteende) {
    if (!klasser) return;
    sel = sel || ""; beteende = beteende || "";
    const namn = klasser.split(/\s*\|\s*/).filter(Boolean);
    const q = sel || namn.map((k) => "." + CSS.escape(k)).join(",");
    const asap = /\basap\b/.test(beteende);
    let vantar = false;
    const kor = () => {
      vantar = false;
      try { for (const el of document.querySelectorAll(q)) el.classList.remove(...namn); } catch (e) {}
    };
    const senare = () => { if (vantar) return; vantar = true; setTimeout(kor, 17); };
    const start = () => {
      kor();
      if (!/\bstay\b/.test(beteende)) return;
      new MutationObserver((andr) => {
        for (const a of andr) {
          if (a.type === "attributes" || [...a.addedNodes].some((n) => n.nodeType === 1)) { if (asap) kor(); else senare(); return; }
        }
      }).observe(document, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
    };
    arNar(start, asap ? "loading" : /\bcomplete\b/.test(beteende) ? "complete" : "interactive");
  },

  // Sätt en sessionskaka med ett ofarligt värde ("stängt", "nej" o.d.), t.ex. så att en nyhetsbrevsruta inte visas
  "set-cookie": function setCookie(namn, varde, sokvag) {
    if (!namn || varde === undefined || !arSakertVarde(varde, 32767)) return;
    if (/[^!#$&+\-.^_`|~0-9A-Za-z]/.test(namn)) namn = encodeURIComponent(namn);
    if (/[^ -:<-[\]-~]/.test(varde)) varde = encodeURIComponent(varde);
    sokvag = sokvag || "/";
    if (sokvag !== "/" && sokvag !== "none") return;
    try { document.cookie = namn + "=" + varde + (sokvag === "/" ? "; path=/" : ""); } catch (e) {}
  },

  // Som set-cookie, men laddar om sidan en gång när kakan sattes (sajten läser den bara vid start)
  "set-cookie-reload": function setCookieReload(namn, varde, sokvag) {
    if (!namn || varde === undefined || !arSakertVarde(varde, 32767)) return;
    if (/[^!#$&+\-.^_`|~0-9A-Za-z]/.test(namn)) namn = encodeURIComponent(namn);
    if (/[^ -:<-[\]-~]/.test(varde)) varde = encodeURIComponent(varde);
    const las = () => {
      for (const bit of document.cookie.split(/\s*;\s*/)) {
        const i = bit.indexOf("=");
        if (i !== -1 && bit.slice(0, i) === namn) return bit.slice(i + 1);
      }
    };
    if (las() === varde) return;
    sokvag = sokvag || "/";
    if (sokvag !== "/" && sokvag !== "none") return;
    try { document.cookie = namn + "=" + varde + (sokvag === "/" ? "; path=/" : ""); } catch (e) {}
    if (las() === varde) location.reload();
  },

  // Ta bort kakor vars namn matchar (direkt och när sidan lämnas)
  "remove-cookie": function removeCookie(nal) {
    const re = arRe(nal || "");
    const ta = () => {
      for (const bit of document.cookie.split(";")) {
        const i = bit.indexOf("=");
        if (i === -1) continue;
        const namn = bit.slice(0, i).trim();
        if (!re.test(namn)) continue;
        const h = location.hostname, slut = "; Max-Age=-1000; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        const dom = ["", "; domain=" + h, "; domain=." + h];
        if (h.startsWith("www.")) dom.push("; domain=" + h.slice(3));
        for (const d of dom) for (const p of ["", "; path=/"]) { try { document.cookie = namn + "=" + d + p + slut; } catch (e) {} }
      }
    };
    ta();
    window.addEventListener("beforeunload", ta);
  },

  "set-local-storage-item": function setLocalStorageItem(nyckel, varde) {
    if (!nyckel) return;
    varde = varde === undefined ? "" : varde;
    if (varde === "emptyArr") varde = "[]"; else if (varde === "emptyObj") varde = "{}";
    if (!["", "undefined", "null", "{}", "[]", "\"\"", "$remove$"].includes(varde) && !arSakertVarde(varde, 32767)) return;
    try {
      const s = window.localStorage;
      if (varde === "$remove$") {
        const re = arRe(nyckel, undefined, true), bort = [];
        for (let i = 0; i < s.length; i++) { const k = s.key(i); if (re.test(k)) bort.push(k); }
        for (const k of bort) s.removeItem(k);
      } else s.setItem(nyckel, varde);
    } catch (e) {}
  },

  "set-session-storage-item": function setSessionStorageItem(nyckel, varde) {
    if (!nyckel) return;
    varde = varde === undefined ? "" : varde;
    if (varde === "emptyArr") varde = "[]"; else if (varde === "emptyObj") varde = "{}";
    if (!["", "undefined", "null", "{}", "[]", "\"\"", "$remove$"].includes(varde) && !arSakertVarde(varde, 32767)) return;
    try {
      const s = window.sessionStorage;
      if (varde === "$remove$") {
        const re = arRe(nyckel, undefined, true), bort = [];
        for (let i = 0; i < s.length; i++) { const k = s.key(i); if (re.test(k)) bort.push(k); }
        for (const k of bort) s.removeItem(k);
      } else s.setItem(nyckel, varde);
    } catch (e) {}
  },

  // Rensa egenskaper ur JSON.parse-resultat (annonsdata i sidans svar). Med nålar: bara när alla nålar finns.
  "json-prune": function jsonPrune(bort, nalar) {
    if (!bort) return;
    const vagar = bort.split(/ +/).filter(Boolean);
    const krav = nalar ? nalar.split(/ +/).filter(Boolean) : [];
    const hitta = (rot, vag, rensa) => {
      let agare = rot, k = vag;
      for (;;) {
        if (typeof agare !== "object" || agare === null) return false;
        const i = k.indexOf(".");
        if (i === -1) {
          if (!rensa) return Object.prototype.hasOwnProperty.call(agare, k);
          let andrat = false;
          if (k === "*") { for (const n of Object.keys(agare)) { delete agare[n]; andrat = true; } }
          else if (Object.prototype.hasOwnProperty.call(agare, k)) { delete agare[k]; andrat = true; }
          return andrat;
        }
        const prop = k.slice(0, i), nasta = k.slice(i + 1);
        let hittat = false;
        if (prop === "[-]" && Array.isArray(agare)) {
          for (let j = agare.length - 1; j >= 0; j--) if (hitta(agare[j], nasta, false)) { agare.splice(j, 1); hittat = true; }
          return hittat;
        }
        if (prop === "{-}" && agare instanceof Object) {
          for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, false)) { delete agare[n]; hittat = true; }
          return hittat;
        }
        if ((prop === "[]" && Array.isArray(agare)) || ((prop === "{}" || prop === "*") && agare instanceof Object)) {
          for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, rensa)) hittat = true;
          return hittat;
        }
        if (!Object.prototype.hasOwnProperty.call(agare, prop)) return false;
        agare = agare[prop];
        k = nasta;
      }
    };
    JSON.parse = new Proxy(JSON.parse, {
      apply(f, detta, args) {
        const obj = Reflect.apply(f, detta, args);
        try { if (krav.every((n) => hitta(obj, n, false))) for (const v of vagar) hitta(obj, v, true); } catch (e) {}
        return obj;
      },
    });
  },

  // Stoppa window.open som matchar (tomt mönster = alla). Med fördröjning: ett låtsasfönster i stället för null.
  "no-window-open-if": function noWindowOpenIf(monster, fordrojning) {
    const m = arMonster(monster || "");
    window.open = new Proxy(window.open, {
      apply(f, detta, args) {
        let text = "";
        try { text = Array.prototype.map.call(args, String).join(" "); } catch (e) {}
        if (!arTraffar(m, text)) return Reflect.apply(f, detta, args);
        if (!fordrojning) return null;
        const noop = function () {};
        return new Proxy({ closed: false, close: noop, focus: noop, blur: noop, postMessage: noop,
          document: { write: noop, writeln: noop, open: noop, close: noop }, location: { href: "about:blank", replace: noop, assign: noop } },
        { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
      },
    });
  },

  // Låtsas att fetch() mot matchande adresser lyckades (sajter som kollar om annonsanrop går igenom)
  "no-fetch-if": function noFetchIf(villkor, svar, typ) {
    const nalar = arEgenskaper(villkor || "");
    if (!nalar.length) return;
    const typer = ["basic", "cors", "default", "error", "opaque"];
    window.fetch = new Proxy(window.fetch, {
      apply(f, detta, args) {
        let detaljer;
        try {
          detaljer = args[0] instanceof Request ? args[0] : Object.assign({ url: String(args[0]) }, args[1]);
          const e = {};
          for (const k in detaljer) {
            let v = detaljer[k];
            if (typeof v !== "string") { try { v = JSON.stringify(v); } catch (x) {} }
            if (typeof v === "string") e[k] = v;
          }
          if (!e.method) e.method = "GET";
          if (!arMatchar(nalar, e)) return Reflect.apply(f, detta, args);
        } catch (x) { return Reflect.apply(f, detta, args); }
        const text = arSvarText(svar);
        const r = new Response(text, { status: 200, statusText: "OK", headers: { "Content-Length": String(text.length) } });
        try {
          const prop = { url: { value: String(detaljer.url || "") } };
          if (typer.includes(typ)) prop.type = { value: typ };
          Object.defineProperties(r, prop);
        } catch (x) {}
        return Promise.resolve(r);
      },
    });
  },

  // Samma för XMLHttpRequest: anropet skickas aldrig, sidan får ett tomt 200-svar
  "no-xhr-if": function noXhrIf(villkor, svar) {
    const nalar = arEgenskaper(villkor || "");
    if (!nalar.length) return;
    const stoppade = new WeakMap();
    const Orig = window.XMLHttpRequest;
    window.XMLHttpRequest = class XMLHttpRequest extends Orig {
      open(metod, url) {
        stoppade.delete(this);
        try { if (arMatchar(nalar, { method: String(metod).toUpperCase(), url: String(url) })) stoppade.set(this, { url: String(url) }); } catch (e) {}
        return super.open(...arguments);
      }
      send() {
        const s = stoppade.get(this);
        if (!s) return super.send(...arguments);
        const text = arSvarText(svar);
        let kropp = text;
        try {
          if (this.responseType === "json") kropp = text ? JSON.parse(text) : null;
          else if (this.responseType === "arraybuffer") kropp = new ArrayBuffer(0);
          else if (this.responseType === "blob") kropp = new Blob([]);
          else if (this.responseType === "document") kropp = new DOMParser().parseFromString(text, "text/html");
        } catch (e) { kropp = null; }
        const varden = { readyState: 4, status: 200, statusText: "OK", response: kropp, responseURL: s.url };
        if (this.responseType === "" || this.responseType === "text") varden.responseText = text;
        for (const [k, v] of Object.entries(varden)) { try { Object.defineProperty(this, k, { value: v, configurable: true }); } catch (e) {} }
        const xhr = this;
        setTimeout(() => {
          for (const t of ["readystatechange", "load", "loadend"]) { try { xhr.dispatchEvent(new Event(t)); } catch (e) {} }
        }, 1);
      }
    };
  },

  // Stoppa eval() av kod som matchar (tomt mönster = all eval)
  "noeval-if": function noevalIf(nal) {
    const re = arRe(nal || "");
    window.eval = new Proxy(window.eval, {
      apply(f, detta, args) {
        if (re.test(String(args[0]))) return undefined;
        return Reflect.apply(f, detta, args);
      },
    });
  },

  // Länkar som går via en spårningsadress får direktadressen (?url / ?url?u = parameter, text, [attribut])
  "href-sanitizer": function hrefSanitizer(sel, kalla) {
    if (!sel) return;
    kalla = kalla || "text";
    const giltig = (t) => {
      if (typeof t !== "string" || !t || /[\x00-\x20\x7f]/.test(t)) return "";
      try { const u = new URL(t, document.location); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (e) { return ""; }
    };
    const param = (href, k) => {
      if (!k) return href;
      const nasta = k.indexOf("?", 1);
      const namn = k.slice(1, nasta === -1 ? k.length : nasta);
      try {
        const v = new URL(href, document.location).searchParams.get(namn);
        if (v === null) return "";
        return nasta === -1 ? v.replace(/ /g, "%20") : param(v, k.slice(nasta));
      } catch (e) { return ""; }
    };
    const adress = (el) => {
      if (/^\[.*\]$/.test(kalla)) return el.getAttribute(kalla.slice(1, -1).trim()) || "";
      if (kalla === "text") return el.textContent.replace(/^[^\x21-\x7e]+/, "").replace(/[^\x21-\x7e]+$/, "");
      if (kalla.startsWith("?")) return param(el.href, kalla);
      return "";
    };
    const tvatta = () => {
      let lankar;
      try { lankar = document.querySelectorAll(sel); } catch (e) { return false; }
      for (const el of lankar) {
        if (el.localName !== "a" || !el.hasAttribute("href")) continue;
        const ny = giltig(adress(el));
        if (ny && ny !== el.getAttribute("href")) el.setAttribute("href", ny);
      }
      return true;
    };
    arNar(() => {
      if (!tvatta() || !document.body) return;
      let vantar = false;
      new MutationObserver((andr) => {
        if (vantar || !andr.some((a) => [...a.addedNodes].some((n) => n.nodeType === 1))) return;
        vantar = true;
        setTimeout(() => { vantar = false; tvatta(); }, 50);
      }).observe(document.body, { childList: true, subtree: true });
    }, "interactive");
  },

  // Kasta fel när window.a.b används från kod vars stack matchar (t.ex. ett visst annonsskript)
  "abort-on-stack-trace": function abortOnStackTrace(kedja, nal) {
    if (!kedja) return;
    const m = arMonster(nal || "");
    if (m.tomt) return;
    const proxy = (agare, k) => {
      const i = k.indexOf(".");
      if (i === -1) {
        let v = agare[k];
        try {
          Object.defineProperty(agare, k, {
            get() { if (arStack(m)) throw arAvbrott(); return v; },
            set(a) { if (arStack(m)) throw arAvbrott(); v = a; },
          });
        } catch (e) {}
        return;
      }
      const prop = k.slice(0, i), rest = k.slice(i + 1);
      let v = agare[prop];
      if (v) { proxy(v, rest); return; }
      const d = Object.getOwnPropertyDescriptor(agare, prop);
      if (d && d.set !== undefined) return;
      try {
        Object.defineProperty(agare, prop, {
          get() { return v; },
          set(a) { v = a; if (a instanceof Object) proxy(a, rest); },
        });
      } catch (e) {}
    };
    proxy(window, kedja);
  },

  // Töm text i noder (oftast inbäddade <script>) som matchar, innan de körs. Slutar vid DOMContentLoaded
  // om inte "stay" anges.
  "remove-node-text": function removeNodeText(nodnamn, innehaller, ...extra) {
    if (!nodnamn) return;
    const x = arExtra(extra, 0);
    const reNamn = arRe(nodnamn, "i", true);
    const reInne = arRe(innehaller || x.includes || x.condition || "", "ms");
    const reUtom = x.excludes ? arRe(x.excludes, "ms") : null;
    let tt = { createScript: (s) => s };
    try {
      if (window.trustedTypes && typeof trustedTypes.getPropertyType === "function" && trustedTypes.getPropertyType("script", "textContent") === "TrustedScript") {
        tt = trustedTypes.createPolicy("adraze" + Math.random().toString(36).slice(2), { createScript: (s) => s });
      }
    } catch (e) {}
    const behandla = (n) => {
      if (n === document.currentScript) return;
      const fore = n.textContent;
      if (!fore || !reInne.test(fore) || (reUtom && reUtom.test(fore))) return;
      try { n.textContent = n.nodeName === "SCRIPT" ? tt.createScript("") : ""; } catch (e) {}
    };
    // Parsern lägger ibland in <script> tomt och texten strax efter: pröva då elementet när texten kommer
    const nod = (n) => {
      if (reNamn.test(n.nodeName)) behandla(n);
      else if (n.nodeType === 3 && n.parentNode && reNamn.test(n.parentNode.nodeName)) behandla(n.parentNode);
    };
    const obs = new MutationObserver((andr) => { for (const a of andr) for (const n of a.addedNodes) nod(n); });
    obs.observe(document, { childList: true, subtree: true });
    if (document.documentElement) {
      const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) nod(n);
    }
    if (x.stay) return;
    arNar(() => {
      const sluta = () => { for (const a of obs.takeRecords()) for (const n of a.addedNodes) nod(n); obs.disconnect(); };
      const efter = parseInt(x.quitAfter, 10) || 0;
      if (efter) setTimeout(sluta, efter); else sluta();
    }, "interactive");
  },
};

// Spärrdetektorerna FuckAdBlock/BlockAdBlock/SniffAdBlock: ersätt med en som alltid säger "ingen blockerare"
KIT["nofab"] = function nofab() {
  const noop = function () {};
  const Fab = function () {};
  Fab.prototype.check = noop;
  Fab.prototype.clearEvent = noop;
  Fab.prototype.emitEvent = noop;
  Fab.prototype.on = function (a, b) { if (!a) b(); return this; };
  Fab.prototype.onDetected = function () { return this; };
  Fab.prototype.onNotDetected = function (a) { a(); return this; };
  Fab.prototype.setOption = noop;
  Fab.prototype.options = { set: noop, get: noop };
  const fab = new Fab();
  const satt = (namn, v) => {
    try {
      if (Object.prototype.hasOwnProperty.call(window, namn)) window[namn] = v;
      else Object.defineProperty(window, namn, { get() { return v; }, set() {} });
    } catch (e) {}
  };
  for (const n of ["FuckAdBlock", "BlockAdBlock", "SniffAdBlock"]) satt(n, Fab);
  for (const n of ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"]) satt(n, fab);
};

// BlockAdBlock som laddas via eval: känn igen koden och kör den inte
KIT["nobab"] = function nobab() {
  const signaturer = [
    ["blockadblock"],
    ["babasbm"],
    [/getItem\('babn'\)/],
    ["getElementById", "String.fromCharCode", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "charAt",
      "DOMContentLoaded", "AdBlock", "addEventListener", "doScroll", "fromCharCode", "<<2|r>>4", "sessionStorage",
      "clientWidth", "localStorage", "Math", "random"],
  ];
  const kanns = (s) => {
    for (const t of signaturer) {
      let n = 0;
      for (const x of t) if ((x instanceof RegExp ? s.search(x) : s.indexOf(x)) !== -1) n++;
      if (n / t.length >= 0.8) return true;
    }
    return false;
  };
  window.eval = new Proxy(window.eval, {
    apply(f, detta, args) {
      const a = args[0];
      if (typeof a !== "string" || !kanns(a)) return Reflect.apply(f, detta, args);
      if (document.body) document.body.style.removeProperty("visibility");
      const el = document.getElementById("babasbmsgx");
      if (el) el.remove();
    },
  });
  window.setTimeout = new Proxy(window.setTimeout, {
    apply(f, detta, args) {
      const a = args[0];
      if (typeof a !== "string" || !/\.bab_elementid.$/.test(a)) return Reflect.apply(f, detta, args);
    },
  });
};

// PopAds-popunders: ge skriptet tomma objekt (dummy) eller avbryt det när det sätter sina globaler
KIT["popads-dummy"] = function popadsDummy() {
  try { delete window.PopAds; delete window.popns; } catch (e) {}
  try { Object.defineProperties(window, { PopAds: { value: {} }, popns: { value: {} } }); } catch (e) {}
};
KIT["popads.net"] = function popadsNet() {
  const kasta = () => { throw arAvbrott(); };
  try { delete window.PopAds; delete window.popns; } catch (e) {}
  try { Object.defineProperties(window, { PopAds: { set: kasta }, popns: { set: kasta } }); } catch (e) {}
};

// Kortnamn och gamla namn → namnet i KIT
const ALIAS = {
  "set": "set-constant",
  "aopr": "abort-on-property-read",
  "aopw": "abort-on-property-write",
  "acs": "abort-current-script", "acis": "abort-current-script", "abort-current-inline-script": "abort-current-script",
  "aeld": "addEventListener-defuser", "prevent-addEventListener": "addEventListener-defuser",
  "nostif": "no-setTimeout-if", "setTimeout-defuser": "no-setTimeout-if", "prevent-setTimeout": "no-setTimeout-if",
  "nosiif": "no-setInterval-if", "setInterval-defuser": "no-setInterval-if", "prevent-setInterval": "no-setInterval-if",
  "nano-stb": "adjust-setTimeout", "nano-setTimeout-booster": "adjust-setTimeout",
  "nano-sib": "adjust-setInterval", "nano-setInterval-booster": "adjust-setInterval",
  "ra": "remove-attr",
  "rc": "remove-class",
  "cookie-remover": "remove-cookie",
  "nowoif": "no-window-open-if", "prevent-window-open": "no-window-open-if", "window.open-defuser": "no-window-open-if",
  "prevent-fetch": "no-fetch-if",
  "prevent-xhr": "no-xhr-if",
  "noeval": "noeval-if", "prevent-eval-if": "noeval-if", "silent-noeval": "noeval-if",
  "urlskip": null,
  "aost": "abort-on-stack-trace",
  "rmnt": "remove-node-text",
  "fuckadblock.js-3.2.0": "nofab",
  "bab-defuser": "nobab",
};

// "namn, arg1, 'arg, med komma', arg3" → ["namn", "arg1", "arg, med komma", "arg3"].
// \, är ett bokstavligt komma; ett argument inom '…', "…" eller `…` får innehålla kommatecken.
function delaArgs(text) {
  const ut = [];
  let i = 0;
  const n = text.length;
  while (i <= n) {
    while (i < n && text[i] === " ") i++;
    const q = text[i];
    if (q === "'" || q === "\"" || q === "`") {
      // Citat som slutar strax före ett komma (eller slutet)
      let j = i + 1, arg = "", klart = false;
      while (j < n) {
        if (text[j] === "\\" && text[j + 1] === q) { arg += q; j += 2; continue; }
        if (text[j] === q) {
          let k = j + 1;
          while (k < n && text[k] === " ") k++;
          if (k === n || text[k] === ",") { ut.push(arg); i = k + 1; klart = true; break; }
        }
        arg += text[j]; j++;
      }
      if (klart) { if (i > n) break; continue; }
      // Inget giltigt slutcitat: läs som vanligt argument
    }
    let arg = "";
    while (i < n && text[i] !== ",") {
      if (text[i] === "\\" && text[i + 1] === ",") { arg += ","; i += 2; continue; }
      arg += text[i]; i++;
    }
    ut.push(arg.trim());
    i++;
  }
  return ut;
}

// Innehållet i +js(...) → { namn, args, nyckel } (nyckel = normaliserad text, används för undantag),
// { namn: null } för okända scriptlets
function normalisera(inne) {
  const delar = delaArgs(inne);
  const ratt = (delar.shift() || "").trim().replace(/\.js$/, "");
  const namn = Object.prototype.hasOwnProperty.call(ALIAS, ratt) ? ALIAS[ratt] : ratt;
  if (!namn || !Object.prototype.hasOwnProperty.call(KIT, namn)) return { namn: null, ratt };
  while (delar.length && delar[delar.length - 1] === "") delar.pop();
  return { namn, args: delar, nyckel: namn + "(" + JSON.stringify(delar) + ")" };
}

// Hjälparna som en funktion använder (namn som förekommer i dess källkod), även indirekt
function hjalpareFor(kallor) {
  const alla = new Map(HJALP.map((f) => [f.name, f]));
  const valda = new Set();
  const ko = [...kallor];
  while (ko.length) {
    const kod = ko.pop();
    for (const [namn, f] of alla) if (!valda.has(namn) && new RegExp("\\b" + namn + "\\b").test(kod)) { valda.add(namn); ko.push(f.toString()); }
  }
  return HJALP.filter((f) => valda.has(f.name));
}

// Skriv en scriptlet-fil. poster = [[namn, ...args]], vardar = { värd: [index…] },
// undantag = { värd: [index…] } (-1 = alla scriptlets på värden)
function genereraFil({ namn, poster, vardar, undantag }) {
  const impl = [...new Set(poster.map((p) => p[0]))];
  const kod = impl.map((n) => KIT[n].toString());
  const hjalp = hjalpareFor(kod);
  const data = JSON.stringify({ a: poster.map((p) => [impl.indexOf(p[0]), ...p.slice(1)]), v: vardar, u: undantag });
  return `// AdRaze-scriptlet ${namn}: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\\.$/, "");
  if (!h) return;
  var D = ${data};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;
${hjalp.map((f) => "  " + f.toString().replace(/\n/g, "\n  ")).join("\n")}
  var F = [${kod.map((k) => "\n    " + k.replace(/\n/g, "\n    ")).join(",")}
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
`;
}

module.exports = { KIT, ALIAS, HJALP, delaArgs, normalisera, genereraFil };
