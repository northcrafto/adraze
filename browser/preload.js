'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('defaultBrowser', {
  state: () => ipcRenderer.invoke('defaultbrowser:state'),
  set: () => ipcRenderer.invoke('defaultbrowser:set'),
});

contextBridge.exposeInMainWorld('locale', {
  load: (lang) => { try { return ipcRenderer.sendSync('i18n:load', lang) || {}; } catch { return {}; } },
});

contextBridge.exposeInMainWorld('skoll', {
  checkUrl: (url) => ipcRenderer.invoke('skoll:check-url', url),
  dailyImage: () => ipcRenderer.invoke('skoll:daily-image'),
  adblockToggle: (on) => ipcRenderer.invoke('skoll:adblock-toggle', on),
  adblockState: () => ipcRenderer.invoke('skoll:adblock-state'),
  onAdblockCount: (cb) => ipcRenderer.on('adblock:count', (_e, n) => cb(n)),
  onAdblockTab: (cb) => ipcRenderer.on('adblock:tab', (_e, id, n) => cb(id, n)),
  onBlockinst: (cb) => ipcRenderer.on('blockinst:andrat', (_e, v) => cb(v || {})),
  onAdblockHit: (cb) => ipcRenderer.on('adblock:hit', (_e, type) => cb(type)),
});
// Anpassa/startsida: väder och ortsök hämtas av huvudprocessen (skalets CSP släpper inte ut fetch)
contextBridge.exposeInMainWorld('anpassaStartsida', {
  vader: (lat, lon) => ipcRenderer.invoke('startsida:vader', { lat, lon }),
  ortSok: (q) => ipcRenderer.invoke('startsida:ort-sok', String(q || '')),
});

contextBridge.exposeInMainWorld('auth', {
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  google: () => ipcRenderer.invoke('auth:google'),
  googleAvbryt: () => ipcRenderer.send('auth:google-avbryt'),
  signup: (email, password, name) => ipcRenderer.invoke('auth:signup', { email, password, name }),
  verifyCode: (email, code) => ipcRenderer.invoke('auth:verify-code', { email, code }),
  resetRequest: (email) => ipcRenderer.invoke('auth:reset-request', { email }),
  resetConfirm: (email, code, password) => ipcRenderer.invoke('auth:reset-confirm', { email, code, password }),
  session: (token) => ipcRenderer.invoke('auth:session', { token }),
  logout: (token) => ipcRenderer.invoke('auth:logout', { token }),
  deleteAccount: (token, password) => ipcRenderer.invoke('auth:delete', { token, password }),
  setAvatar: (token, image) => ipcRenderer.invoke('auth:avatar', { token, image }),
  remember: (account) => ipcRenderer.invoke('auth:remember', account),
  recall: () => ipcRenderer.invoke('auth:recall'),
  forget: () => ipcRenderer.invoke('auth:forget'),
  profiler: () => ipcRenderer.invoke('profiler:lista'),
  sparaProfil: (key, account, avatar) => ipcRenderer.invoke('profiler:spara', { key, account, avatar }),
  hamtaProfil: (key) => ipcRenderer.invoke('profiler:hamta', key),
  taBortProfil: (key) => ipcRenderer.invoke('profiler:ta-bort', key),
});

contextBridge.exposeInMainWorld('family', {
  createChild: (token, name, age) => ipcRenderer.invoke('family:child', { token, name, age }),
  join: (code) => ipcRenderer.invoke('family:join', { code }),
  approve: (code, approval) => ipcRenderer.invoke('family:approve', { code, approval }),
  children: (token) => ipcRenderer.invoke('family:children', { token }),
  removeChild: (token, child_id) => ipcRenderer.invoke('family:remove', { token, child_id }),
  setBlocklist: (token, child_id, blocklist) => ipcRenderer.invoke('family:blocklist', { token, child_id, blocklist }),
  setSound: (token, child_id, sound, volume) => ipcRenderer.invoke('family:sound', { token, child_id, sound, volume }),
  allow: (token, child_id, host, minutes) => ipcRenderer.invoke('family:allow', { token, child_id, host, minutes }),
  notis: (title, body) => ipcRenderer.send('family:notis', { title, body }),
  onOppna: (fn) => ipcRenderer.on('family:oppna', () => fn()),
  enhet: (token) => ipcRenderer.invoke('family:enhet', { token }),
  annatKonto: (token, enhet) => ipcRenderer.invoke('family:annat-konto', { token, enhet }),
  ask: (token, host, text) => ipcRenderer.invoke('family:ask', { token, host, text }),
  answer: (token, id, answer, minutes) => ipcRenderer.invoke('family:answer', { token, id, answer, minutes }),
  historyAdd: (token, url, title) => ipcRenderer.invoke('family:history-add', { token, url, title }),
  history: (token, child_id) => ipcRenderer.invoke('family:history', { token, child_id }),
  me: (token) => ipcRenderer.invoke('family:me', { token }),
  logoutChild: (token, child_id) => ipcRenderer.invoke('family:logout-child', { token, child_id }),
  rotateCode: (token, child_id) => ipcRenderer.invoke('family:rotate-code', { token, child_id }),
  sessions: (token, child_id) => ipcRenderer.invoke('family:sessions', { token, child_id }),
  logoutSession: (token, child_id, sid) => ipcRenderer.invoke('family:logout-session', { token, child_id, sid }),
});


contextBridge.exposeInMainWorld('anpassaBro', {
  alla: () => ipcRenderer.sendSync('anpassa:alla'),
  satt: (nyckel, varde, etikett) => ipcRenderer.invoke('anpassa:satt', { nyckel, varde, etikett }),
  angra: () => ipcRenderer.invoke('anpassa:angra'),
  aterstall: (prefix) => ipcRenderer.invoke('anpassa:aterstall', prefix),
  historik: () => ipcRenderer.invoke('anpassa:historik'),
  exportera: (prefix) => ipcRenderer.invoke('anpassa:exportera', prefix),
  importera: (kod, prefix) => ipcRenderer.invoke('anpassa:importera', { kod, prefix }),
  onAndrad: (fn) => ipcRenderer.on('anpassa:andrad', (_e, d) => fn(d)),
});
// Jultemat (ui/jul.js ↔ jul.js): läget (säsong, låtsat datum, frågan, luckor, bilder), svaret på frågan, julkalenderns
// luckor, statistiken per dag och delningsbilden. Inställningarna själva (jul.*) går via anpassaBro.
contextBridge.exposeInMainWorld('julBro', {
  lage: () => { try { return ipcRenderer.sendSync('jul:lage'); } catch { return null; } },
  svara: (svar) => ipcRenderer.invoke('jul:svara', svar === 'ja' ? 'ja' : 'nej'),
  visad: () => ipcRenderer.send('jul:visad'),
  lucka: (n) => ipcRenderer.invoke('jul:lucka', n),
  stat: () => ipcRenderer.invoke('jul:stat'),
  bild: (atgard, data) => ipcRenderer.invoke('jul:bild', { atgard, data }),
  onAndrad: (fn) => ipcRenderer.on('jul:andrad', (_e, d) => fn(d)),
  onTyst: (fn) => ipcRenderer.on('jul:tyst', (_e, ms) => fn(ms)),   // huvudprocessen ändrar tema på egen hand: ingen "Ändrat · Ångra"
});
// Anpassa-krok (tema): engångsflytt av det gamla ljust/mörkt-valet till tema.lage (ui/anpassa-tema.js, ../anpassa-tema.js)
contextBridge.exposeInMainWorld('anpassaTema', {
  flyttaLage: (lage) => ipcRenderer.send('anpassa-tema:flytta-lage', lage),
});
// Anpassa → flikar (ui/anpassa-flikar.js): fästa flikar sover aldrig, tyst sparning av grupper, gruppens meny,
// Ctrl+Shift+A (dolda flikar) och flikar som somnat (main.js skickar tab-discarded)
contextBridge.exposeInMainWorld('anpassaFlikar', {
  fasta: (ids) => ipcRenderer.send('anpassa-flikar:fasta', ids),
  grupperTyst: (lista) => ipcRenderer.invoke('anpassa-flikar:grupper-tyst', lista),
  gruppMeny: (g) => ipcRenderer.send('anpassa-flikar:gruppmeny', g),
  antalFonster: () => { try { return ipcRenderer.sendSync('anpassa-flikar:fonster') || 1; } catch { return 1; } },
  onGruppVal: (fn) => ipcRenderer.on('anpassa-flikar:gruppval', (_e, a, id) => fn(a, id)),
  onKortkommando: (fn) => ipcRenderer.on('anpassa-flikar:kortkommando', () => fn()),
  onSover: (fn) => ipcRenderer.on('tab-discarded', (_e, id) => fn(id)),
});
// Anpassa › verktyg (ui/anpassa-verktyg.js): högerklicksmenyn på verktygsraden + webbytans kanter när raden ligger längst ner
contextBridge.exposeInMainWorld('anpassaVerktyg', {
  meny: (info) => ipcRenderer.send('anpassa-verktyg:meny', info),
  kanter: (k) => ipcRenderer.send('anpassa-verktyg:kanter', k),
  onVal: (fn) => ipcRenderer.on('anpassa-verktyg:val', (_e, d) => fn(d)),
});
// Anpassa → per sajt (anpassa-sajt.js): sajt-panelen från skölden, tystade sajter, "Alla sajter" från panelen
contextBridge.exposeInMainWorld('anpassaSajt', {
  oppna: (d) => ipcRenderer.send('sajt:oppna', d),
  onLjud: (fn) => ipcRenderer.on('sajt:ljud', (_e, flik, tyst) => fn(flik, !!tyst)),
  onVisaAlla: (fn) => ipcRenderer.on('sajt:visa-alla', () => fn()),
});
// Anpassa → Avancerat (ui/anpassa-avancerat.js): kontrollera ett skript (kompileras, körs aldrig) och
// "Redigera CSS för den här sajten" från sidans högerklicksmeny. Värdena själva går via anpassaBro.
contextBridge.exposeInMainWorld('anpassaAvancerat', {
  kolla: (d) => ipcRenderer.invoke('avancerat:kolla', d),
  onRedigeraCss: (fn) => ipcRenderer.on('avancerat:redigera-css', (_e, host) => fn(String(host || ''))),
});
// Anpassa › Ångra (ui/anpassa-angra.js): ångra en hel grupp, spara alla inställningar som fil, Falks ändringar → toast.
// Toasten: syns en webbsida lägger huvudprocessen den ovanpå sidan (svarar true), annars ritar skalet den (false).
contextBridge.exposeInMainWorld('anpassaAngra', {
  angra: () => ipcRenderer.invoke('anpassa-angra:angra'),
  sparaFil: () => ipcRenderer.invoke('anpassa-angra:spara-fil'),
  onFalk: (fn) => ipcRenderer.on('anpassa-angra:falk', (_e, d) => fn(d)),
  toast: (d) => ipcRenderer.invoke('anpassa-angra:toast', d),
  gomToast: () => ipcRenderer.send('anpassa-angra:toast-gom'),
  onToastAngra: (fn) => ipcRenderer.on('anpassa-angra:toast-angra', () => fn()),   // Ångra i toasten ovanpå sidan
  onToastISkalet: (fn) => ipcRenderer.on('anpassa-angra:toast-i-skalet', (_e, d) => fn(d)),   // sidan göms: toasten fortsätter i skalet
  onToastOvanpa: (fn) => ipcRenderer.on('anpassa-angra:toast-ovanpa', () => fn()),            // sidan visas: toasten ligger nu ovanpå den
});
// Anpassa › Arbetsytor (ui/anpassa-arbetsytor.js): flikar i andra arbetsytor ligger vilande tills de visas
contextBridge.exposeInMainWorld('anpassaArbetsytor', {
  vilande: (id, url) => ipcRenderer.send('arbetsytor:vilande', id, url),
  aktiv: (id) => ipcRenderer.send('arbetsytor:aktiv', id),                       // för huvudmenyns bock
  onByt: (fn) => ipcRenderer.on('arbetsytor:byt', (_e, v) => fn(v)),             // huvudmenyn › Arbetsytor
});
// Anpassa: temagalleriet (ui/anpassa-galleri.js ↔ anpassa-galleri.js). Kontots token skickas med per anrop, som family:*.
contextBridge.exposeInMainWorld('anpassaGalleri', {
  lista: (d) => ipcRenderer.invoke('galleri:lista', d),
  mina: (d) => ipcRenderer.invoke('galleri:mina', d),
  rosta: (d) => ipcRenderer.invoke('galleri:rosta', d),
  anmal: (d) => ipcRenderer.invoke('galleri:anmal', d),
  taBort: (d) => ipcRenderer.invoke('galleri:ta-bort', d),
  prova: (d) => ipcRenderer.invoke('galleri:prova', d),
  behall: (d) => ipcRenderer.invoke('galleri:behall', d),
  angra: () => ipcRenderer.invoke('galleri:angra'),
  prov: () => ipcRenderer.invoke('galleri:prov'),
  onProv: (fn) => ipcRenderer.on('galleri:prov', (_e, p) => fn(p)),
  mitt: () => ipcRenderer.invoke('galleri:mitt'),
  publicera: (d) => ipcRenderer.invoke('galleri:publicera', d),
});
// Anpassa › kortkommandon, kommandopalett och musgester (ui/anpassa-kortkommandon.js ↔ anpassa-kortkommandon.js)
contextBridge.exposeInMainWorld('anpassaKortkommandon', {
  lista: () => ipcRenderer.sendSync('anpassa-kort:lista'),
  kor: (id) => ipcRenderer.invoke('anpassa-kort:kor', String(id || '')),
  bild: () => ipcRenderer.invoke('anpassa-kort:bild'),
  fokusSida: () => ipcRenderer.send('anpassa-kort:fokus'),
  fokusSkal: () => ipcRenderer.send('anpassa-kort:fokus-skal'),
  spelaIn: (pa) => ipcRenderer.send('anpassa-kort:spela-in', !!pa),
  extra: (lista) => ipcRenderer.send('anpassa-kort:extra', lista),
  onKommando: (fn) => ipcRenderer.on('anpassa-kort:kommando', (_e, id, kalla, franSida) => fn(id, kalla, franSida)),
  onInspelning: (fn) => ipcRenderer.on('anpassa-kort:inspelning', (_e, d) => fn(d)),
});
contextBridge.exposeInMainWorld('kontoLage', {
  fonster: () => ipcRenderer.sendSync('konto:fonster'),
  hamta: () => ipcRenderer.sendSync('konto:lage'),
  satt: (perFonster) => ipcRenderer.invoke('konto:satt-lage', !!perFonster),
  omstart: () => ipcRenderer.send('app:omstart'),
});
contextBridge.exposeInMainWorld('session', {
  setkey: (key) => ipcRenderer.invoke('session:setkey', { key }),
  login: (key) => ipcRenderer.invoke('session:login', { key }),
  logout: (key) => ipcRenderer.invoke('session:logout', { key }),
});

contextBridge.exposeInMainWorld('pw', {
  list: () => ipcRenderer.invoke('pw:list'),
  save: (c) => ipcRenderer.invoke('pw:save', c),
  openPopup: (d) => ipcRenderer.send('pw:popup-open', d),   // flytande "Spara lösenordet?"-notis
  setAutofill: (o) => ipcRenderer.invoke('pw:set-autofill', o),
  del: (id) => ipcRenderer.invoke('pw:delete', id),
  onOffer: (cb) => ipcRenderer.on('pw-offer', (_e, c) => cb(c)),
});
contextBridge.exposeInMainWorld('wallet', {
  list: () => ipcRenderer.invoke('wallet:list'),
  get: (id) => ipcRenderer.invoke('wallet:get', id),
  save: (c) => ipcRenderer.invoke('wallet:save', c),
  del: (id) => ipcRenderer.invoke('wallet:delete', id),
  fillNow: (id) => ipcRenderer.send('wallet:fill-now', id),
  onOffer: (cb) => ipcRenderer.on('wallet-offer', (_e, c) => cb(c)),
  onFillOffer: (cb) => ipcRenderer.on('wallet-fill-offer', (_e, cards) => cb(cards)),
});
contextBridge.exposeInMainWorld('dl', {
  list: () => ipcRenderer.invoke('dl:list'),
  open: (id) => ipcRenderer.send('dl:open', id),
  folder: (id) => ipcRenderer.send('dl:folder', id),
  popupToggle: () => ipcRenderer.send('dl:popup-toggle'),
  removeThreat: (id) => ipcRenderer.send('dl:remove-threat', id),
  keepAnyway: (id) => ipcRenderer.send('dl:keep-anyway', id),
  pause: (id) => ipcRenderer.send('dl:pause', id),
  resume: (id) => ipcRenderer.send('dl:resume', id),
  cancel: (id) => ipcRenderer.send('dl:cancel', id),
  onUpdate: (cb) => ipcRenderer.on('download-update', (_e, r) => cb(r)),
  onThreat: (cb) => ipcRenderer.on('download-threat', (_e, t) => cb(t)),
});

contextBridge.exposeInMainWorld('view', {
  load: (id, url) => ipcRenderer.send('view:load', id, url),
  show: (id) => ipcRenderer.send('view:show', id),
  hide: () => ipcRenderer.send('view:hide'),
  suggest: (q, engine) => ipcRenderer.invoke('omni:suggest', { q, engine }),
  bounds: (r) => ipcRenderer.send('view:bounds', r),
  onPanelInset: (cb) => ipcRenderer.on('panel-inset', (_e, px) => cb(px)),
  insetTop: (px) => ipcRenderer.send('view:inset-top', px),
  insetLeft: (px) => ipcRenderer.send('view:inset-left', px),
  zoom: (id, dir) => ipcRenderer.send('view:zoom', id, dir),
  defaultZoom: (f) => ipcRenderer.send('view:default-zoom', f),
  print: (id) => ipcRenderer.send('view:print', id),
  openMenu: () => ipcRenderer.send('open-app-menu'),
  markIncognito: (id) => ipcRenderer.send('view:incognito', id),
  onNewIncognito: (cb) => ipcRenderer.on('new-incognito', () => cb()),
  barnRegler: (r) => ipcRenderer.send('barn:regler', r),                                   // familjespärren gäller i huvudprocessen
  onBarnSparrad: (cb) => ipcRenderer.on('barn-sparrad', (_e, id, url) => cb(id, url)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, m) => cb(m)),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', (_e, v) => cb(v)),
  installUpdate: () => ipcRenderer.send('update:install'),
  updateStatus: (force) => ipcRenderer.invoke('update:status', !!force),
  proStatus: (t) => ipcRenderer.invoke('pro:status', t),
  proCancel: (t) => ipcRenderer.invoke('pro:cancel', t),
  proResume: (t) => ipcRenderer.invoke('pro:resume', t),
  webbGet: () => ipcRenderer.invoke('webb:get'),
  webbSet: (k, v) => ipcRenderer.invoke('webb:set', k, v),
  webbPickDir: () => ipcRenderer.invoke('webb:pick-download-dir'),
  webbClear: (what) => ipcRenderer.invoke('webb:clear', what),
  importKallor: () => ipcRenderer.invoke('import:kallor'),
  importLas: (val) => ipcRenderer.invoke('import:las', val),
  importLosenCsv: () => ipcRenderer.invoke('import:losen-csv'),
  importTillagg: (ids) => ipcRenderer.invoke('import:tillagg', ids),
  synkGet: (token, sorts) => ipcRenderer.invoke('synk:get', token, sorts),
  synkPush: (token, sorts, poster, borttagna) => ipcRenderer.invoke('synk:push', token, sorts, poster, borttagna),
  extList: () => ipcRenderer.invoke('ext:list'),
  extAdd: (text) => ipcRenderer.invoke('ext:add', text),
  extToggle: (id, on) => ipcRenderer.invoke('ext:toggle', id, on),
  extRemove: (id) => ipcRenderer.invoke('ext:remove', id),
  extStore: (id) => ipcRenderer.send('ext:store', id),
  allowHttp: (host) => ipcRenderer.send('webb:allow-http', host),
  onHttpsFailed: (cb) => ipcRenderer.on('https-failed', (_e, id, url) => cb(id, url)),
  onPermAsk: (cb) => ipcRenderer.on('perm-ask', (_e, q) => cb(q)),
  onPermCancel: (cb) => ipcRenderer.on('perm-cancel', (_e, id) => cb(id)),
  permAnswer: (id, allow, remember) => ipcRenderer.send('perm:answer', id, allow, remember),
  onOpenHistory: (cb) => ipcRenderer.on('open-history', () => cb()),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, name, arg) => cb(name, arg)),
  onOpenBookmarks: (cb) => ipcRenderer.on('open-bookmarks', () => cb()),
  onOpenDownloads: (cb) => ipcRenderer.on('open-downloads', () => cb()),
  onOpenPasswords: (cb) => ipcRenderer.on('open-passwords', () => cb()),
  onKryptoSet: (cb) => ipcRenderer.on('krypto-set', (_e, a) => cb(a)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', (_e, cat) => cb(cat)),
  onClearData: (cb) => ipcRenderer.on('clear-data', () => cb()),
  onMenuZoom: (cb) => ipcRenderer.on('menu-zoom', (_e, d) => cb(d)),
  onMenuPrint: (cb) => ipcRenderer.on('menu-print', () => cb()),
  onCloseTab: (cb) => ipcRenderer.on('close-tab', () => cb()),
  onCloseTabId: (cb) => ipcRenderer.on('close-tab-id', (_e, id) => cb(id)),
  onConfirmClose: (cb) => ipcRenderer.on('confirm-close', () => cb()),
  doClose: () => ipcRenderer.send('win:do-close'),
  openCloseConfirm: (n) => ipcRenderer.send('open-close-confirm', n),
  onPersistSkipClose: (cb) => ipcRenderer.on('persist-skip-close', () => cb()),
  onFocusAddress: (cb) => ipcRenderer.on('focus-address', () => cb()),
  back: (id) => ipcRenderer.send('view:back', id),
  forward: (id) => ipcRenderer.send('view:forward', id),
  reload: (id) => ipcRenderer.send('view:reload', id),
  mute: (id, on) => ipcRenderer.send('view:mute', id, !!on),
  reader: (id, theme) => ipcRenderer.send('view:reader', id, theme),
  onReader: (cb) => ipcRenderer.on('reader-available', (_e, id, ok, on) => cb(id, ok, on)),
  pip: (id) => ipcRenderer.send('view:pip', id),
  onPip: (cb) => ipcRenderer.on('pip-state', (_e, id, has, on) => cb(id, has, on)),
  onFalkGranskar: (cb) => ipcRenderer.on('falk-granskar', (_e, id, on) => cb(id, on)),
  tabMenu: (info) => ipcRenderer.send('tab:menu', info),
  onTabAudio: (cb) => ipcRenderer.on('tab-audio', (_e, id, audible) => cb(id, audible)),
  onTabAction: (cb) => ipcRenderer.on('tab-action', (_e, action, id) => cb(action, id)),
  stop: (id) => ipcRenderer.send('view:stop', id),
  destroy: (id) => ipcRenderer.send('view:destroy', id),
  kryptoToggle: (open, mode, account) => ipcRenderer.send('krypto:toggle', open, mode, account),
  kryptoPrefill: (text) => ipcRenderer.send('krypto:prefill', text),
  chattToggle: (open, opts) => ipcRenderer.send('chatt:toggle', open, opts),
  chattTheme: (theme, accent) => ipcRenderer.send('chatt:theme', theme, accent),
  onChattUnread: (cb) => ipcRenderer.on('chatt-unread', (_e, n) => cb(n)),
  onChattOppna: (cb) => ipcRenderer.on('chatt-oppna', () => cb()),
  onChattClosed: (cb) => ipcRenderer.on('chatt-closed', () => cb()),
  onOpenLogin: (cb) => ipcRenderer.on('open-login', () => cb()),
  onKryptoRecheck: (cb) => ipcRenderer.on('krypto-recheck', () => cb()),
  platform: process.platform,
  setTitlebar: (c) => ipcRenderer.send('win:titlebar', c),
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winToggleMax: () => ipcRenderer.send('win:toggle-max'),
  winClose: () => ipcRenderer.send('win:close'),
  onWinMaximized: (cb) => ipcRenderer.on('win-maximized', (_e, v) => cb(!!v)),
  onLinkNavigate: (cb) => ipcRenderer.on('link-navigate', (_e, id, url) => cb(id, url)),
  onDidNavigate: (cb) => ipcRenderer.on('did-navigate', (_e, id, url, b, f) => cb(id, url, b, f)),
  onAdrazeDanger: (cb) => ipcRenderer.on('adraze-danger', (_e, id, url) => cb(id, url)),
  adrazeOpenAnyway: (url) => ipcRenderer.invoke('adraze:open-anyway', url),
  onTitle: (cb) => ipcRenderer.on('title', (_e, id, t) => cb(id, t)),
  onFavicon: (cb) => ipcRenderer.on('favicon', (_e, id, f) => cb(id, f)),
  onLoading: (cb) => ipcRenderer.on('loading', (_e, id, l) => cb(id, l)),
  onOpenNewTab: (cb) => ipcRenderer.on('open-new-tab', (_e, url) => cb(url)),
  onOpenTabRaw: (cb) => ipcRenderer.on('open-tab-raw', (_e, url) => cb(url)),
  onShowQR: (cb) => ipcRenderer.on('show-qr', (_e, url, dataUrl) => cb(url, dataUrl)),
  onContentWarning: (cb) => ipcRenderer.on('content-warning', (_e, id, url, res) => cb(id, url, res)),
  onWindowResized: (cb) => ipcRenderer.on('window-resized', () => cb()),
});

// Anpassa: sidopanel med webbappar (ui/anpassa-sidopanel.js ↔ anpassa-sidopanel.js). Bara de egna kanalerna.
const SP_HANDELSER = new Set(['tillstand', 'info', 'ikon', 'ikon-ra', 'fraga', 'fraga-klar', 'stangd', 'atgard']);
contextBridge.exposeInMainWorld('anpassaSidopanel', {
  tillstand: () => { try { return ipcRenderer.sendSync('sidopanel:tillstand'); } catch { return null; } },
  oppna: (id, yta, bakgrund) => ipcRenderer.send('sidopanel:oppna', id, yta, bakgrund),
  stang: () => ipcRenderer.send('sidopanel:stang'),
  yta: (r) => ipcRenderer.send('sidopanel:yta', r),
  skymd: (on) => ipcRenderer.send('sidopanel:skymd', !!on),
  gor: (id, vad) => ipcRenderer.send('sidopanel:gor', id, vad),
  meny: (id) => ipcRenderer.send('sidopanel:meny', id || null),
  sparaIkon: (id, png, kalla) => ipcRenderer.send('sidopanel:spara-ikon', id, png, kalla),
  svar: (qid, allow, remember) => ipcRenderer.send('sidopanel:svar', qid, !!allow, !!remember),
  on: (namn, fn) => { if (SP_HANDELSER.has(namn)) ipcRenderer.on('sidopanel:' + namn, (_e, ...a) => fn(...a)); },
});
