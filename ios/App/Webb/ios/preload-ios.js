/* preload-ios.js – bryggan i iPhone-appens egna webbvyer (adraze-app://localhost/…).
 *
 * Körs först av allt på sidan (WKUserScript vid dokumentstart, bara huvudramen, sidans egen värld), direkt efter
 * startdatan (window.__adrazeBoot) och före datorns preload. Bygger:
 *
 *   window.adraze      invoke(kanal, ...args) → Promise, send(kanal, ...args), sync(kanal, ...args),
 *                      on(kanal, fn) / off(kanal, fn), _emit(kanal, data) (Swift → sidan), yta, plattform
 *   require('electron') för datorns preload.js, krypto-preload.js och chatt-preload.js, som körs OFÖRÄNDRADE:
 *                      contextBridge.exposeInMainWorld lägger API:erna på window, ipcRenderer går till Swift.
 *
 * Datorns sendSync (anpassa:alla, i18n:load …) svarar ur startdatan som Swift byggde innan sidan laddades.
 * Kanaler som ingen modul har registrerat än svarar med ett neutralt värde (STANDARD nedan), så att datorns
 * sidor startar även innan Konto, Skydd och Falk finns. Swift kontrollerar ändå varje anrop (huvudramen,
 * ursprunget adraze-app://localhost och vilka sidor som får anropa kanalen).
 *
 * Ägare: Brygga och webb-UI (App/Webb/ios/). Datorns filer i App/Webb/ui/ ändras aldrig.
 */
(function () {
  'use strict';
  if (window.adraze && window.adraze.__ios) return;
  const boot = window.__adrazeBoot || {};
  const miljo = boot['ios:miljo'] || {};
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.adraze;
  const kanaler = new Set(Array.isArray(miljo.kanaler) ? miljo.kanaler : []);
  const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // Som Electrons strukturerade kloning, men via JSON: undefined i objekt försvinner (= "inget värde", som på datorn)
  const rensa = (args) => { try { return JSON.parse(JSON.stringify(args, (_k, v) => (v === undefined ? null : v))); } catch { return []; } };

  /* Startsidans siffror: Swift räknar (Skydd, Raknare.swift) och datorns shell.js läser skoll-stats vid start. */
  const stat = boot['skydd:statistik'];
  if (stat && typeof stat === 'object') {
    try { localStorage.setItem('skoll-stats', JSON.stringify({ ads: stat.annonser | 0, trackers: stat.sparare | 0, dangers: stat.farliga | 0 })); } catch {}
  }

  /* ── Kanaler som ingen modul har än: neutrala svar i datorns form ── */
  const STANDARD = {
    'defaultbrowser:state': { arStandard: false, kan: false },
    'skoll:check-url': { verdict: null },
    'skoll:adblock-state': { on: true, count: 0, raknare: true },
    'skoll:adblock-toggle': true,
    'skoll:daily-image': { url: null, credit: '' },
    'auth:recall': null, 'auth:session': null, 'profiler:lista': [],
    'update:status': { status: 'senaste', version: miljo.version || '', ios: true },
    'pro:status': null, 'synk:get': null, 'synk:push': null,
    'ext:list': [], 'dl:list': [], 'pw:list': [], 'wallet:list': [],
    'import:kallor': [], 'import:antal': {},
    'jul:stat': null, 'jul:lucka': null, 'jul:bild': null, 'jul:svara': { ok: false },
    'galleri:prov': null, 'galleri:mitt': null,
    'anpassa-flikar:grupper-tyst': { ok: true },
    'anpassa-kort:kor': false, 'anpassa-kort:bild': null,
    'anpassa-angra:toast': false,
    'avancerat:kolla': { ok: false, fel: 'Finns inte på iPhone än' },
    'konto:satt-lage': { ok: false },
    'family:me': null, 'family:children': [],
  };
  const SYNK = {
    'jul:lage': { offset: 0, test: false, sasong: null, dag: new Date().toLocaleDateString('sv-SE'), fragad: false, svarad: true, luckor: [], bilder: {} },
    'anpassa-flikar:fonster': 1,
    'anpassa-kort:lista': { mac: false, win: false, kategorier: [], kommandon: [], gester: [] },
    'konto:fonster': { perFonster: false },
    'konto:lage': { perFonster: false, sparat: false },
    'sidopanel:tillstand': { tillaten: false, ikoner: {}, laddade: {} },
    'blockinst:boot': null, 'chatt:boot': null, 'falk-inst:alla': null,
  };

  /* ── Transporten ── */
  function post(kanal, args) {
    if (!handler) return Promise.reject(new Error('bryggan saknas'));
    return handler.postMessage({ k: kanal, a: rensa(args) });
  }
  function invoke(kanal, ...args) {
    kanal = String(kanal || '');
    if (kanaler.has(kanal)) return post(kanal, args);
    if (Object.prototype.hasOwnProperty.call(STANDARD, kanal)) return Promise.resolve(kopia(STANDARD[kanal]));
    return Promise.reject(new Error('okänd kanal: ' + kanal));
  }
  function send(kanal, ...args) {
    kanal = String(kanal || '');
    if (!kanaler.has(kanal)) return;   // datorns send utan mottagare här (fönsterknappar, flikmenyer …)
    post(kanal, args).catch((e) => { if (miljo.felsok) console.warn('[adraze] ' + kanal + ': ' + (e && e.message)); });
    if (kanal === 'view:load') { try { window.dispatchEvent(new CustomEvent('adraze:navigerade', { detail: { url: args[1] } })); } catch {} }
  }

  /* Språket: Swift bestämmer (sprak.val, tomt = systemets språk). i18n.js frågar locale.load(språk) synkront. */
  const sprak = { kod: (boot['i18n:load'] && boot['i18n:load'].kod) || miljo.sprak || 'sv' };
  function laddaSprak(kod) {
    kod = String(kod || '').replace(/[^a-zA-Z-]/g, '');
    if (!kod || kod === 'sv') return {};
    const b = boot['i18n:load'];
    if (b && b.kod === kod && b.ordlista) return b.ordlista;
    try {   // ett annat språk än det Swift förberedde: samma fil, synkront från schemat
      const x = new XMLHttpRequest();
      x.open('GET', '/locales/' + encodeURIComponent(kod) + '.json', false);
      x.send(null);
      if (x.status === 200) return JSON.parse(x.responseText);
    } catch {}
    return {};
  }
  function sync(kanal, ...args) {
    kanal = String(kanal || '');
    if (kanal === 'i18n:load') return laddaSprak(args[0]);
    if (Object.prototype.hasOwnProperty.call(boot, kanal)) return kopia(boot[kanal]);
    if (Object.prototype.hasOwnProperty.call(SYNK, kanal)) return kopia(SYNK[kanal]);
    return undefined;
  }

  /* ── Händelser från Swift: window.adraze._emit(kanal, data). Flera argument: data = { __args: [...] } ── */
  const lyssnare = new Map();   // kanal → Set av { fn, ipc, en }
  function lagg(kanal, fn, ipc, en) {
    if (typeof fn !== 'function') return;
    if (!lyssnare.has(kanal)) lyssnare.set(kanal, new Set());
    lyssnare.get(kanal).add({ fn, ipc, en });
  }
  function tabort(kanal, fn) {
    const s = lyssnare.get(kanal); if (!s) return;
    for (const p of s) if (p.fn === fn) s.delete(p);
  }
  const handelse = { sender: null, senderId: 0, ports: [] };
  function _emit(kanal, data) {
    const s = lyssnare.get(String(kanal)); if (!s) return 0;
    const args = data && typeof data === 'object' && Array.isArray(data.__args) ? data.__args : [data];
    let n = 0;
    for (const p of [...s]) {
      if (p.en) s.delete(p);
      try { if (p.ipc) p.fn(handelse, ...kopia(args)); else p.fn(...kopia(args)); n++; } catch (e) { console.error('[adraze] ' + kanal, e); }
    }
    return n;
  }

  /* ── localStorage: nycklar som Swift äger eller som inte gäller i appen ──
     Skalets egna flikar, introt och notiserna hör till datorns fönster. Tema, sökmotor och språk läses från Swift
     (samma värden som skalet), så att sidan aldrig startar i ett gammalt läge. */
  const ls = (() => { try { return window.localStorage; } catch { return null; } })();
  const morktSystem = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };
  function tema(namn, std) {
    try { if (window.Anpassa) return window.Anpassa.get('tema.' + namn); } catch {}
    const a = boot['anpassa:alla'] || {};
    return (a.varden && a.varden['tema.' + namn]) || std;
  }
  let sokmotor = miljo.sokmotor || null;
  const LAS = {
    'skoll-theme': () => { const l = tema('lage', 'ljust'); return l === 'morkt' || (l === 'system' && morktSystem()) ? 'dark' : 'light'; },
    'skoll-engine': () => sokmotor,
    'adraze-lang': () => sprak.kod,
    'skoll-open-tabs': () => '[]', 'adraze-pinned-tabs': () => '[]', 'adraze-active-tab': () => '-1', 'adraze-start': () => 'ny',
    'adraze-intro-v4': () => '1', 'adraze-hacker-intro-v3': () => '1', 'adraze-flytt-erbjuden': () => '1',
    'skoll-defbrowser-snooze': () => '99999999999999',
  };
  const SKRIV = {
    'skoll-engine': (v) => { sokmotor = String(v); invoke('anpassa:satt', { nyckel: 'sok.motor', varde: sokmotor, etikett: 'Sökmotor' }).catch(() => {}); },
    'adraze-lang': (v) => { sprak.kod = String(v); },
    'skoll-theme': () => {}, 'skoll-open-tabs': () => {}, 'adraze-pinned-tabs': () => {}, 'adraze-active-tab': () => {},
  };
  if (ls) {
    const P = Storage.prototype, get = P.getItem, set = P.setItem;
    P.getItem = function (k) { if (this === ls && Object.prototype.hasOwnProperty.call(LAS, k)) return LAS[k](); return get.call(this, k); };
    P.setItem = function (k, v) { if (this === ls && Object.prototype.hasOwnProperty.call(SKRIV, k)) { SKRIV[k](v); return; } return set.call(this, k, v); };
  }

  /* ── Anpassa.get(nyckel, std): datorns kod skriver in datorns standardvärde (A.get('verktyg.placering', 'uppe')).
     För nycklar där iPhone har ett eget standardvärde (Nycklar.swift) gäller registrets värde när inget är sparat. ── */
  const egnaStd = new Set(Array.isArray(miljo.egnaStandarder) ? miljo.egnaStandarder : []);
  if (egnaStd.size) {
    let anpassa;
    Object.defineProperty(window, 'Anpassa', {
      configurable: true, enumerable: true,
      get: () => anpassa,
      set(v) {
        if (v && typeof v.get === 'function') {
          const get = v.get;
          v.get = function (nyckel, std) { return egnaStd.has(nyckel) ? get.call(this, nyckel) : get.call(this, nyckel, std); };
        }
        anpassa = v;
      },
    });
  }

  /* ── window.adraze och datorns require('electron') ── */
  const adraze = {
    __ios: true,
    yta: miljo.yta || '',
    plattform: 'ios',
    version: miljo.version || '',
    invoke, send, sync, _emit,
    on(kanal, fn) { lagg(String(kanal), fn, false, false); return () => tabort(String(kanal), fn); },
    off(kanal, fn) { tabort(String(kanal), fn); },
    har: (kanal) => kanaler.has(String(kanal)),
  };
  Object.defineProperty(window, 'adraze', { value: adraze, writable: false, configurable: false, enumerable: false });

  const ipcRenderer = {
    invoke, send, sendSync: sync,
    on(kanal, fn) { lagg(String(kanal), fn, true, false); return ipcRenderer; },
    once(kanal, fn) { lagg(String(kanal), fn, true, true); return ipcRenderer; },
    removeListener(kanal, fn) { tabort(String(kanal), fn); return ipcRenderer; },
    off(kanal, fn) { tabort(String(kanal), fn); return ipcRenderer; },
    removeAllListeners(kanal) { if (kanal === undefined) lyssnare.clear(); else lyssnare.delete(String(kanal)); return ipcRenderer; },
    postMessage() {},
  };
  handelse.sender = ipcRenderer;
  const contextBridge = {
    exposeInMainWorld(namn, api) {
      if (namn === 'adraze') {   // content-preload: adraze://-sidornas API läggs till, transporten står kvar
        for (const [k, v] of Object.entries(api || {})) if (!(k in adraze)) adraze[k] = v;
        return;
      }
      Object.defineProperty(window, namn, { value: api, writable: true, configurable: true, enumerable: false });
    },
    exposeInIsolatedWorld() {},
  };
  const electron = { ipcRenderer, contextBridge, webFrame: { setZoomFactor() {}, getZoomFactor: () => 1, setVisualZoomLevelLimits() {} } };
  window.__adrazeKrav = (m) => { if (m === 'electron') return electron; throw new Error('require(' + m + ') finns inte i appen'); };
  window.__adrazeProcess = { platform: 'ios', env: {}, versions: { adraze: miljo.version || '' }, argv: [], type: 'renderer' };

  /* ── Sidan: iOS-läge, viewport och iOS-CSS innan något ritas ── */
  const html = document.documentElement;
  if (html) {
    html.classList.add('ios', 'ios-' + (miljo.yta || 'sida'));
    if (miljo.liten) html.classList.add('ios-telefon');
    const vp = document.createElement('meta');
    vp.name = 'viewport';
    vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    vp.id = 'adraze-ios-viewport';
    html.appendChild(vp);
    if (miljo.css) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = miljo.css; l.id = 'adraze-ios-css';
      html.appendChild(l);
    }
  }
  window.__adrazeIosStart = { boot: !!window.__adrazeBoot, anpassa: !!boot['anpassa:alla'], ms: Math.round(performance.now() * 10) / 10 };
})();
