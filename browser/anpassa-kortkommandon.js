'use strict';
/* Anpassa › kortkommandon, kommandopalett och musgester (huvudprocessens del).
 *
 * Kortkommandon: alla fångas här via before-input-event (main.js → handleShortcut → tangent()), så de fungerar
 * även när fokus ligger i en webbsida. Tabellen byggs av standardvärdena nedan + användarens ändringar i
 * Anpassa-butiken (nycklar "kortkommandon.<id>" = lista med kombinationer). Bara kombinationer med Ctrl/Alt/Cmd
 * eller F-tangenter kan bli kortkommandon, så sidor som behöver vanliga tangenter störs inte.
 *
 * Musgester (av som standard): höger musknapp + dra på en webbsida fångas med before-mouse-event på flikens
 * webContents. Sidan får ingen ny åtkomst och ser aldrig draget. Ett klick utan rörelse spelas upp igen så att
 * den vanliga högerklicksmenyn kommer som förut. Spåret ritas i en genomskinlig vy ovanpå fliken (ui/anpassa-gest.html).
 *
 * Fönstrets del (palett, inställningar, kommandon som körs i skalet): ui/anpassa-kortkommandon.js.
 */
const path = require('path');
const { app, ipcMain, Menu, WebContentsView } = require('electron');
const { fyll } = require('./i18n-fyll');

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';

let api = null;                 // funktioner från main.js (init)
let anpassa = null;
const extraKommandon = new Map();   // kommandon som andra delar av skalet registrerat (körs i skalet)
let karta = new Map();          // kombination → kommando-id (det som gäller nu)
let standardKarta = new Map();  // kombination → kommando-id (standard), för att släppa igenom flyttade standardtangenter
let gesterPa = false, sparPa = true;
const flikWc = new Set();       // flikarnas webContents (för musgesterna)

/* ────────── Kommandona ──────────
 * var: 'main' körs här, 'skal' skickas till fönstrets skal. upprepa: får köras igen när tangenten hålls nere.
 * barn: döljs i barnläge (själva handlingen vägrar också där). sok: extra sökord för paletten. */
const KATEGORIER = ['Flikar', 'Fönster', 'Navigering', 'Sidan', 'AdRaze'];
const vy = (ctx) => (api && ctx ? api.activeView(ctx) : null);
const vyWc = (ctx) => { const v = vy(ctx); return v && !v.webContents.isDestroyed() ? v.webContents : null; };
const sidUrl = (ctx) => { const w = vyWc(ctx); let u = ''; try { u = w ? w.getURL() : ''; } catch {} return /^https?:/i.test(u) ? u : ''; };
const skicka = (ctx, ...a) => api.sendTo(ctx, ...a);
const flikNr = (n) => ({ id: 'flik-' + n, namn: fyll('Flik {n}', { n }), get visaNamn() { return api && api.T ? api.T('Flik {n}', { n }) : this.namn; }, kat: 'Flikar', std: ['CmdOrCtrl+' + n], ikon: 'flik', lamnar: true, sok: 'gå till flik nummer', kor: (ctx) => skicka(ctx, 'shortcut', 'tab-index', n - 1) });

const KOMMANDON = [
  // Flikar
  { id: 'ny-flik', namn: 'Ny flik', kat: 'Flikar', std: ['CmdOrCtrl+T'], ikon: 'plus', upprepa: true, lamnar: true, sok: 'öppna tom flik', kor: (ctx) => skicka(ctx, 'open-new-tab') },
  { id: 'stang-flik', namn: 'Stäng fliken', kat: 'Flikar', std: ['CmdOrCtrl+W', 'CmdOrCtrl+F4'], ikon: 'stang', upprepa: true, lamnar: true, kor: (ctx) => skicka(ctx, 'close-tab') },
  { id: 'oppna-igen', namn: 'Öppna stängd flik igen', kat: 'Flikar', std: ['CmdOrCtrl+Shift+T'], ikon: 'igen', upprepa: true, lamnar: true, sok: 'ångra stäng återställ', kor: (ctx) => skicka(ctx, 'shortcut', 'reopen-tab') },
  { id: 'nasta-flik', namn: 'Nästa flik', kat: 'Flikar', std: ['CmdOrCtrl+Tab', 'CmdOrCtrl+PageDown'], ikon: 'fram', upprepa: true, lamnar: true, kor: (ctx) => skicka(ctx, 'shortcut', 'switch-tab', 1) },
  { id: 'forra-flik', namn: 'Föregående flik', kat: 'Flikar', std: ['CmdOrCtrl+Shift+Tab', 'CmdOrCtrl+PageUp'], ikon: 'bak', upprepa: true, lamnar: true, kor: (ctx) => skicka(ctx, 'shortcut', 'switch-tab', -1) },
  flikNr(1), flikNr(2), flikNr(3), flikNr(4), flikNr(5), flikNr(6), flikNr(7), flikNr(8),
  { id: 'sista-flik', namn: 'Sista fliken', kat: 'Flikar', std: ['CmdOrCtrl+9'], ikon: 'flik', lamnar: true, kor: (ctx) => skicka(ctx, 'shortcut', 'tab-index', -1) },
  { id: 'flytta-vanster', namn: 'Flytta fliken åt vänster', kat: 'Flikar', std: ['CmdOrCtrl+Shift+PageUp'], ikon: 'flytt', upprepa: true, var: 'skal' },
  { id: 'flytta-hoger', namn: 'Flytta fliken åt höger', kat: 'Flikar', std: ['CmdOrCtrl+Shift+PageDown'], ikon: 'flytt', upprepa: true, var: 'skal' },
  { id: 'fast-flik', namn: 'Fäst eller lossa fliken', kat: 'Flikar', std: [], ikon: 'nal', sok: 'pin nåla', var: 'skal' },
  { id: 'tysta-flik', namn: 'Ljud av eller på i fliken', kat: 'Flikar', std: [], ikon: 'ljud', sok: 'tysta mute', var: 'skal' },
  { id: 'duplicera-flik', namn: 'Duplicera fliken', kat: 'Flikar', std: [], ikon: 'kopia', lamnar: true, sok: 'kopiera klona', var: 'skal' },
  // Fönster
  { id: 'nytt-fonster', namn: 'Nytt fönster', kat: 'Fönster', std: ['CmdOrCtrl+N'], ikon: 'fonster', lamnar: true, kor: (ctx) => { api.createWindow(false, ctx); } },
  { id: 'inkognito', namn: 'Nytt inkognitofönster', kat: 'Fönster', std: ['CmdOrCtrl+Shift+N'], ikon: 'inkognito', barn: true, lamnar: true, sok: 'privat', kor: (ctx) => { api.createWindow(true, ctx); } },   // vägrar själv i barnläge (med ett meddelande)
  { id: 'inkognito-flik', namn: 'Ny inkognitoflik', kat: 'Fönster', std: [], ikon: 'inkognito', barn: true, lamnar: true, sok: 'privat', kor: (ctx) => skicka(ctx, 'new-incognito') },   // skalet vägrar i barnläge
  { id: 'helskarm', namn: 'Helskärm', kat: 'Fönster', std: ['F11'], ikon: 'helskarm', sok: 'fullskärm', kor: (ctx) => api.toggleFull(ctx) },
  { id: 'avsluta', namn: 'Avsluta AdRaze', kat: 'Fönster', std: ['CmdOrCtrl+Q'], ikon: 'av', lamnar: true, sok: 'stäng allt', kor: () => app.quit() },
  // Navigering
  { id: 'tillbaka', namn: 'Bakåt', kat: 'Navigering', std: ['Alt+Left'], ikon: 'bak', upprepa: true, sok: 'tillbaka', kor: (ctx) => { const w = vyWc(ctx); if (!w) return false; try { const n = w.navigationHistory; if (n.canGoBack()) n.goBack(); } catch {} } },
  { id: 'framat', namn: 'Framåt', kat: 'Navigering', std: ['Alt+Right'], ikon: 'fram', upprepa: true, kor: (ctx) => { const w = vyWc(ctx); if (!w) return false; try { const n = w.navigationHistory; if (n.canGoForward()) n.goForward(); } catch {} } },
  { id: 'ladda-om', namn: 'Ladda om', kat: 'Navigering', std: ['CmdOrCtrl+R', 'F5'], ikon: 'ladda', sok: 'uppdatera', kor: (ctx) => { const w = vyWc(ctx); if (w) w.reload(); } },
  { id: 'hard-omladdning', namn: 'Ladda om utan cache', kat: 'Navigering', std: ['CmdOrCtrl+Shift+R', 'Shift+F5', 'CmdOrCtrl+F5'], ikon: 'ladda', sok: 'hård omladdning uppdatera', kor: (ctx) => { const w = vyWc(ctx); if (w) w.reloadIgnoringCache(); } },
  { id: 'adressfalt', namn: 'Gå till adressfältet', kat: 'Navigering', std: ['CmdOrCtrl+L', 'Alt+D', 'F6'], ikon: 'glob', sok: 'adress url sök', kor: (ctx) => { try { ctx.win.webContents.focus(); } catch {} skicka(ctx, 'focus-address'); } },
  // Sidan
  { id: 'sok-pa-sidan', namn: 'Sök på sidan', kat: 'Sidan', std: ['CmdOrCtrl+F'], ikon: 'sok', sok: 'hitta', kor: (ctx, wc) => {
    const v = vy(ctx); if (!v) return false;
    const sel = wc === v.webContents ? v.webContents.executeJavaScript('String(getSelection()||"").slice(0,200)').catch(() => '') : Promise.resolve('');
    sel.then((t) => api.openFind(ctx, (t || '').includes('\n') ? '' : t));
  } },
  { id: 'nasta-traff', namn: 'Nästa träff', kat: 'Sidan', std: ['F3', 'CmdOrCtrl+G'], ikon: 'sok', upprepa: true, kor: (ctx) => { if (ctx.findView) { try { ctx.findView.webContents.send('find-step', true); } catch {} } else api.openFind(ctx, ''); } },
  { id: 'forra-traff', namn: 'Föregående träff', kat: 'Sidan', std: ['Shift+F3', 'CmdOrCtrl+Shift+G'], ikon: 'sok', upprepa: true, kor: (ctx) => { if (ctx.findView) { try { ctx.findView.webContents.send('find-step', false); } catch {} } else api.openFind(ctx, ''); } },
  { id: 'bokmark', namn: 'Bokmärk sidan', kat: 'Sidan', std: ['CmdOrCtrl+D'], ikon: 'stjarna', sok: 'spara favorit', kor: (ctx) => skicka(ctx, 'shortcut', 'bookmark') },
  { id: 'spara-sida', namn: 'Spara sidan som…', kat: 'Sidan', std: ['CmdOrCtrl+S'], ikon: 'ner', kor: (ctx) => { const w = vyWc(ctx); if (w) api.savePage(ctx, w); } },
  { id: 'skriv-ut', namn: 'Skriv ut…', kat: 'Sidan', std: ['CmdOrCtrl+P'], ikon: 'skrivare', sok: 'pdf', kor: (ctx) => { const w = vyWc(ctx); if (w) api.printPage(ctx, w); } },
  { id: 'bild-i-bild', namn: 'Bild-i-bild', kat: 'Sidan', std: ['CmdOrCtrl+Shift+P'], ikon: 'pip', sok: 'video', kor: (ctx) => { const w = vyWc(ctx); if (w) api.bildIBild(ctx, w); } },
  { id: 'lasvy', namn: 'Läsläge', kat: 'Sidan', std: ['F9'], ikon: 'bok', sok: 'läsvy artikel', var: 'skal' },
  { id: 'zooma-in', namn: 'Zooma in', kat: 'Sidan', std: ['CmdOrCtrl+Plus', 'CmdOrCtrl+='], ikon: 'zoomin', upprepa: true, sok: 'större', kor: (ctx) => skicka(ctx, 'menu-zoom', 1) },
  { id: 'zooma-ut', namn: 'Zooma ut', kat: 'Sidan', std: ['CmdOrCtrl+-', 'CmdOrCtrl+_'], ikon: 'zoomut', upprepa: true, sok: 'mindre', kor: (ctx) => skicka(ctx, 'menu-zoom', -1) },
  { id: 'zoom-normal', namn: 'Återställ zoom', kat: 'Sidan', std: ['CmdOrCtrl+0'], ikon: 'zoom', sok: 'normal storlek', kor: (ctx) => skicka(ctx, 'menu-zoom', 0) },
  { id: 'kalla', namn: 'Visa sidans källa', kat: 'Sidan', std: [], ikon: 'kod', sok: 'källkod html', kor: (ctx) => { const u = sidUrl(ctx); if (u) skicka(ctx, 'open-tab-raw', 'view-source:' + u); } },
  { id: 'qr-kod', namn: 'Skapa QR-kod för sidan', kat: 'Sidan', std: [], ikon: 'qr', sok: 'telefon dela', kor: (ctx) => { const u = sidUrl(ctx); if (u) api.showQR(ctx, u); } },
  // Namn och målspråk följer användarens språk (main.js oversattning()); på svenska "Översätt till svenska" som förut
  { id: 'oversatt', namn: 'Översätt till svenska', get visaNamn() { return api && api.oversattning ? api.oversattning().namn : this.namn; }, kat: 'Sidan', std: [], ikon: 'oversatt', sok: 'översätt sidan språk', kor: (ctx) => { const u = sidUrl(ctx); const tl = api && api.oversattning ? api.oversattning().tl : 'sv'; if (u) skicka(ctx, 'open-new-tab', 'https://translate.google.com/translate?sl=auto&tl=' + encodeURIComponent(tl) + '&u=' + encodeURIComponent(u)); } },
  // AdRaze
  { id: 'palett', namn: 'Kommandopalett', kat: 'AdRaze', std: ['CmdOrCtrl+K'], ikon: 'palett', lamnar: true, sok: 'kommandon sök allt', var: 'skal' },   // skalet tar själv fokus (efter att ha valt sökrutan)
  { id: 'historik', namn: 'Historik', kat: 'AdRaze', std: ['CmdOrCtrl+H'], ikon: 'historik', lamnar: true, kor: (ctx) => skicka(ctx, 'open-history') },
  { id: 'bokmarken', namn: 'Bokmärken', kat: 'AdRaze', std: ['CmdOrCtrl+Shift+O'], ikon: 'bokmarke', lamnar: true, sok: 'favoriter', kor: (ctx) => skicka(ctx, 'open-bookmarks') },
  { id: 'bokmarksfalt', namn: 'Visa eller dölj bokmärkesfältet', kat: 'AdRaze', std: ['CmdOrCtrl+Shift+B'], ikon: 'bokmarke', kor: (ctx) => skicka(ctx, 'shortcut', 'toggle-bmbar') },
  { id: 'nedladdningar', namn: 'Nedladdningar', kat: 'AdRaze', std: ['CmdOrCtrl+J'], ikon: 'ner', sok: 'hämtade filer', kor: (ctx) => api.openDlPopup(ctx) },
  { id: 'losenord', namn: 'Lösenord', kat: 'AdRaze', std: [], ikon: 'nyckel', lamnar: true, sok: 'autofyll inloggning', kor: (ctx) => skicka(ctx, 'open-passwords') },
  { id: 'falk', namn: 'Falk', kat: 'AdRaze', std: [], ikon: 'falk', sok: 'assistent ai fråga', var: 'skal' },
  { id: 'chatt', namn: 'Chatten', kat: 'AdRaze', std: [], ikon: 'chatt', sok: 'vänner meddelande', var: 'skal' },
  { id: 'installningar', namn: 'Inställningar', kat: 'AdRaze', std: [], ikon: 'kugge', lamnar: true, sok: 'inställning', kor: (ctx) => skicka(ctx, 'open-settings') },
  { id: 'anpassa-kort', namn: 'Ändra kortkommandon', kat: 'AdRaze', std: [], ikon: 'tangentbord', lamnar: true, sok: 'kortkommando tangenter musgester', var: 'skal' },
  { id: 'meny', namn: 'Öppna menyn', kat: 'AdRaze', std: [], ikon: 'meny', var: 'skal' },
  { id: 'rensa-data', namn: 'Rensa webbdata…', kat: 'AdRaze', std: ['CmdOrCtrl+Shift+Delete'], ikon: 'papperskorg', lamnar: true, sok: 'kakor cookies cache historik', kor: (ctx) => skicka(ctx, 'open-settings', 'rensa') },
  { id: 'utvecklare', namn: 'Utvecklarverktyg', kat: 'AdRaze', std: ['F12', 'CmdOrCtrl+Shift+I'], ikon: 'kod', barn: true, sok: 'devtools inspektera konsol', kor: (ctx) => { if (api.barnNagonstans()) return; const w = vyWc(ctx); if (w) try { w.openDevTools(); } catch {} } },
];
const INBYGGDA = new Map(KOMMANDON.map((k) => [k.id, k]));

// Musgester: riktningarna L/R/U/D i den ordning man drar. Standard enligt specen, resten "ingen".
const GESTER = [
  { m: 'L', namn: 'Vänster', std: 'tillbaka' },
  { m: 'R', namn: 'Höger', std: 'framat' },
  { m: 'U', namn: 'Upp', std: 'ny-flik' },
  { m: 'D', namn: 'Ned', std: '' },
  { m: 'UD', namn: 'Upp och ned', std: 'ladda-om' },
  { m: 'DU', namn: 'Ned och upp', std: '' },
  { m: 'DR', namn: 'Ned och höger', std: 'stang-flik' },
  { m: 'DL', namn: 'Ned och vänster', std: '' },
  { m: 'UR', namn: 'Upp och höger', std: '' },
  { m: 'UL', namn: 'Upp och vänster', std: '' },
  { m: 'LR', namn: 'Vänster och höger', std: '' },
  { m: 'RL', namn: 'Höger och vänster', std: '' },
];
const GEST_MONSTER = new Set(GESTER.map((g) => g.m));

const kommando = (id) => INBYGGDA.get(id) || extraKommandon.get(id) || null;
const allaKommandon = () => [...KOMMANDON, ...extraKommandon.values()];

/* ────────── Tangenter → kombination ──────────
 * Formatet är Electrons acceleratorer ("CmdOrCtrl+Shift+T"): CmdOrCtrl = Ctrl (Cmd på Mac). Bokstäver och siffror
 * enligt tangentens plats när layouten inte har latinska tecken (rysk m.fl.), annars enligt det som står på tangenten.
 * Skiljetecken som kräver Shift (t.ex. + på amerikanskt tangentbord) räknas utan Shift. */
const NAMNGIVNA = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete', Backspace: 'Backspace', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', ' ': 'Space', Spacebar: 'Space' };
const MODTANGENTER = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock', 'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock']);
function tangentDel(key, code) {
  key = String(key || ''); code = String(code || '');
  let m;
  if ((m = /^F(\d{1,2})$/.exec(key)) || (m = /^F(\d{1,2})$/.exec(code))) { const n = Number(m[1]); return n >= 1 && n <= 24 ? 'F' + n : null; }
  if (MODTANGENTER.has(key)) return null;
  if (NAMNGIVNA[key]) return NAMNGIVNA[key];
  if ((m = /^(?:Digit|Numpad)(\d)$/.exec(code))) return m[1];
  if (code === 'NumpadAdd') return 'Plus';
  if (code === 'NumpadSubtract') return '-';
  if (code === 'NumpadEnter') return 'Enter';
  if (key.length === 1) {
    if (/^[a-z]$/i.test(key)) return key.toUpperCase();
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];               // icke-latinsk layout, Alt-tecken på Mac
    if (key === '+') return 'Plus';
    if (/^\s$/.test(key)) return 'Space';
    if (key.toUpperCase() !== key.toLowerCase()) return key.toUpperCase();   // å ä ö …
    return key;                                                       // skiljetecken
  }
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];                   // död tangent på Mac (Alt+E) m.fl.
  return null;
}
const arTecken = (t) => t === 'Plus' || (t.length === 1 && !/^[A-Z0-9]$/.test(t) && t.toUpperCase() === t.toLowerCase());
function modDelar(i) {
  const d = [];
  if (MAC) { if (i.meta) d.push('CmdOrCtrl'); if (i.control) d.push('Ctrl'); }
  else { if (i.control) d.push('CmdOrCtrl'); if (i.meta) d.push('Meta'); }
  if (i.alt) d.push('Alt');
  return d;
}
function acc(i) {
  if (!i || i.isComposing) return null;
  const t = tangentDel(i.key, i.code); if (!t) return null;
  // Windows: AltGr = Ctrl+Alt. Tecken som @ £ $ { [ ] } \ ska skrivas, inte bli kortkommandon.
  if (WIN && i.control && i.alt && typeof i.key === 'string' && i.key.length === 1 && !/^[a-z0-9]$/i.test(i.key)) return null;
  const d = modDelar(i);
  if (i.shift && !arTecken(t)) d.push('Shift');
  d.push(t);
  return d.join('+');
}
const MOD_ORDNING = ['CmdOrCtrl', 'Ctrl', 'Meta', 'Alt', 'Shift'];
// Godtycklig accelerator (t.ex. 'Alt+Command+I' i en meny) → samma form som acc()
function normAcc(s) {
  const delar = String(s || '').split('+'); let t = delar.pop();
  if (t === '' && delar.length && delar[delar.length - 1] === '') { delar.pop(); t = 'Plus'; }
  const mods = new Set();
  for (const p of delar) {
    const x = p.toLowerCase();
    if (x === 'cmdorctrl' || x === 'commandorcontrol') mods.add('CmdOrCtrl');
    else if (x === 'ctrl' || x === 'control') mods.add(MAC ? 'Ctrl' : 'CmdOrCtrl');
    else if (x === 'cmd' || x === 'command') mods.add(MAC ? 'CmdOrCtrl' : 'Meta');
    else if (x === 'alt' || x === 'option') mods.add('Alt');
    else if (x === 'shift') mods.add('Shift');
    else if (x === 'meta' || x === 'super') mods.add('Meta');
    else return '';
  }
  if (/^[a-z]$/.test(t)) t = t.toUpperCase();
  if (t === 'Escape') t = 'Esc'; if (t === 'Return') t = 'Enter';
  return [...MOD_ORDNING.filter((m) => mods.has(m)), t].join('+');
}
const giltigForm = (a) => typeof a === 'string' && a.length <= 40 && /^((CmdOrCtrl|Ctrl|Meta|Alt|Shift)\+)*[^+]+$/.test(a);
// Varför en kombination inte får bli ett kortkommando ('' = den får)
const REDIGERING = new Set(['CmdOrCtrl+C', 'CmdOrCtrl+V', 'CmdOrCtrl+X', 'CmdOrCtrl+A', 'CmdOrCtrl+Z', 'CmdOrCtrl+Shift+Z', 'CmdOrCtrl+Y', 'CmdOrCtrl+Shift+V']);
function ogiltig(a) {
  if (!giltigForm(a)) return 'form';
  const t = a.split('+').pop();
  if (!/^F\d{1,2}$/.test(t) && !/(^|\+)(CmdOrCtrl|Ctrl|Meta|Alt)\+/.test(a)) return 'mod';
  if (REDIGERING.has(a)) return 'redigering';
  if (WIN && a === 'Alt+F4') return 'system';
  return '';
}

/* ────────── Bindningar ────────── */
function bindningar(id) {
  const k = kommando(id); if (!k) return [];
  let v; try { v = anpassa.hamta('kortkommandon.' + id); } catch {}
  return Array.isArray(v) ? v.filter((a) => !ogiltig(a)).slice(0, 4) : (k.std || []).slice();   // även en delningskod går genom samma kontroll
}
function bygg() {
  const ny = new Map(), std = new Map();
  for (const k of allaKommandon()) {
    for (const a of k.std || []) if (!std.has(a)) std.set(a, k.id);
    for (const a of bindningar(k.id)) if (!ny.has(a)) ny.set(a, k.id);
  }
  karta = ny; standardKarta = std;
}
function gestKommando(m) {
  if (!GEST_MONSTER.has(m)) return '';
  let v; try { v = anpassa.hamta('gester.' + m); } catch {}
  return typeof v === 'string' && kommando(v) ? v : '';
}

/* ────────── Köra ett kommando ────────── */
function kor(id, ctx, wc, kalla) {
  const k = kommando(id); if (!k || !ctx || !ctx.win || ctx.win.isDestroyed()) return false;
  if (id !== 'palett') sakraFokus(ctx);
  if (k.var === 'skal') {
    skicka(ctx, 'anpassa-kort:kommando', id, kalla || '', !!(wc && wc.__tabId != null));   // sista: tangenten/gesten kom från webbsidan
    return true;
  }
  try { return k.kor(ctx, wc || vyWc(ctx) || ctx.win.webContents) !== false; } catch (e) { console.warn('[kortkommandon]', id, e && e.message); return true; }
}
/* Efter ett kommando: göms eller stängs fliken som hade fokus (ny flik, byta flik, stänga flik …) hamnar fokus
 * ingenstans, och då når nästa tangenttryckning ingen – inte ens nästa kortkommando – förrän man klickar.
 * Har inget i fönstret fokus en stund efteråt får sidan som syns det, eller skalet (t.ex. adressfältet på en ny flik). */
function sakraFokus(ctx) {
  for (const ms of [80, 300]) setTimeout(() => {
    try {
      if (!ctx.win || ctx.win.isDestroyed() || !ctx.win.isFocused()) return;
      const alla = [ctx.win.webContents, ...[...ctx.views.values()].map((v) => v.webContents),
        ...['findView', 'kryptoView', 'chattView', 'dlView', 'pwView'].map((n) => ctx[n] && ctx[n].webContents)];
      if (alla.some((w) => w && !w.isDestroyed() && w.isFocused())) return;
      const w = vyWc(ctx) || ctx.win.webContents;
      w.focus();
    } catch {}
  }, ms);
}

/* Anropas först i handleShortcut (main.js). true = hanterat (sidan får inte tangenten), false = släpp igenom
 * till sidan/skalet, undefined = inte vårt (main.js gamla regler får försöka, t.ex. Esc som stänger sökrutan). */
function tangent(wc, input, ctx) {
  try {
    if (!input || input.type !== 'keyDown' || !ctx) return undefined;
    if (ctx.anpInspelning && ctx.win && wc === ctx.win.webContents) {
      if (Date.now() - ctx.anpInspelning < 120000) return spelaIn(ctx, input);
      ctx.anpInspelning = 0;                                    // glömd inspelning: tillbaka till det vanliga
    }
    const a = acc(input); if (!a) return undefined;
    const kandidater = [a];
    if (MAC && input.control && !input.meta) kandidater.push(a.replace(/^Ctrl\b/, 'CmdOrCtrl'));   // på Mac fungerade Ctrl som Cmd förut
    for (const x of kandidater) {
      const id = karta.get(x); const k = id && kommando(id); if (!k) continue;
      if (input.isAutoRepeat && !k.upprepa) return true;        // hålls nere: bara t.ex. zoom och flikbyte upprepas
      return kor(id, ctx, wc, 'tangent');
    }
    return kandidater.some((x) => standardKarta.has(x)) ? false : undefined;   // flyttat standardkortkommando: tangenten går till sidan
  } catch { return undefined; }
}

/* Inspelning av ett nytt kortkommando: skalet ber om det, och då går tangenterna hit i stället för till kommandona.
 * Samma tolkning som när kortkommandot sedan används, och inget kommando körs medan man spelar in. */
function spelaIn(ctx, input) {
  const s = (d) => skicka(ctx, 'anpassa-kort:inspelning', d);
  const t = tangentDel(input.key, input.code);
  const utanMod = !input.control && !input.alt && !input.meta;
  if (!t) { if (MODTANGENTER.has(String(input.key || ''))) s({ forhand: [...modDelar(input), ...(input.shift ? ['Shift'] : [])].join('+') }); return true; }
  if (utanMod && t === 'Tab') return false;                     // Tab flyttar fokus som vanligt
  if (utanMod && !input.shift && t === 'Esc') { s({ avbryt: true }); return true; }
  if (utanMod && !input.shift && (t === 'Backspace' || t === 'Delete')) { s({ taBort: true }); return true; }
  const a = acc(input); if (!a) return true;
  const fel = ogiltig(a);
  if (fel) { s({ ogiltig: a, fel }); return true; }
  ctx.anpInspelning = 0;
  s({ acc: a });
  return true;
}

/* ────────── Menyernas etiketter följer användarens kortkommandon ──────────
 * Acceleratorerna i AdRazes popupmenyer är bara etiketter (main.js). Står det ett standardkortkommando som
 * användaren flyttat visas det nya i stället (eller inget). Rör aldrig något annat i menyn. */
const ELECTRON_TANGENT = /^([A-Z0-9]|F\d{1,2}|Plus|Space|Tab|Backspace|Delete|Insert|Enter|Esc|Up|Down|Left|Right|Home|End|PageUp|PageDown|[-=,./;'`[\]\\])$/;
const electronOk = (a) => giltigForm(a) && ELECTRON_TANGENT.test(a.split('+').pop());
function justeraMall(mall) {
  return mall.map((it) => {
    if (!it || typeof it !== 'object') return it;
    let n = it;
    if (typeof it.accelerator === 'string') {
      const a = normAcc(it.accelerator), id = standardKarta.get(a);
      if (id) {
        const b = bindningar(id);
        if (!b.includes(a)) { n = { ...it }; const f = b.find(electronOk); if (f) n.accelerator = f; else delete n.accelerator; }
      }
    }
    if (Array.isArray(it.submenu)) n = { ...n, submenu: justeraMall(it.submenu) };
    return n;
  });
}
function patchaMenyer() {
  const orig = Menu.buildFromTemplate;
  if (!orig || orig.__anpKort) return;
  const ny = function (mall) {
    if (Array.isArray(mall)) { try { return orig.call(this, justeraMall(mall)); } catch {} }
    return orig.call(this, mall);
  };
  ny.__anpKort = true;
  Menu.buildFromTemplate = ny;
}

/* ────────── Musgester ────────── */
const STEG = 20;          // px i en riktning innan den räknas
const SPAR_FRAN = 8;      // px rörelse innan spåret visas
const KLICK_MAX = 30;     // kortare än så utan riktning = ett vanligt högerklick
// Hålls höger knapp nere under rörelsen? Electron ger knappen i "button" (den nedtryckta) – "modifiers" finns inte alltid
const hogerNere = (m) => m.button === 'right' || (Array.isArray(m.modifiers) && m.modifiers.includes('rightbuttondown'));
// En rörelse utan knapp mitt i en gest: nära spåret har knappen släppts utan att vi såg det (gesten avbryts).
// Långt ifrån är det en konstgjord rörelse där markören står, t.ex. när spårvyn dyker upp – den struntar vi i.
const slapptHar = (g, m) => Math.hypot(m.x - g.lx, m.y - g.ly) <= 60;
function kopplaMus(wc) { if (wc.__anpMus || wc.isDestroyed()) return; wc.__anpMus = (ev, m) => mus(wc, ev, m); wc.on('before-mouse-event', wc.__anpMus); }
function kopplaLossMus(wc) { if (!wc.__anpMus) return; try { wc.removeListener('before-mouse-event', wc.__anpMus); } catch {} wc.__anpMus = null; }
function uppdateraGester() {
  let pa = false, spar = true;
  try { pa = anpassa.hamta('gester.pa') === true; spar = anpassa.hamta('gester.spar') !== false; } catch {}
  gesterPa = pa; sparPa = spar;
  // Lyssnaren kostar ett anrop per musrörelse – den finns bara när gesterna är på
  for (const wc of flikWc) { if (wc.isDestroyed()) { flikWc.delete(wc); continue; } if (pa) kopplaMus(wc); else kopplaLossMus(wc); }
  if (!pa) for (const ctx of api.wins.values()) avbryt(ctx);
}
// Händelsen kommer från sidans huvudram om (global − lokal) = vyns hörn. En inbäddad korsdomänram har
// egna koordinater; där rör vi inget (högerklicket går direkt till ramen som vanligt).
function huvudram(ctx, wc, m) {
  if (typeof m.globalX !== 'number' || typeof m.globalY !== 'number') return true;
  const v = ctx.views && ctx.views.get(wc.__tabId); if (!v) return false;
  try {
    const cb = ctx.win.getContentBounds(), vb = v.getBounds();
    return Math.abs(m.globalX - m.x - (cb.x + vb.x)) <= 2 && Math.abs(m.globalY - m.y - (cb.y + vb.y)) <= 2;
  } catch { return false; }
}
function mus(wc, ev, m) {
  try {
    if (wc.__anpUppspel) {                                      // vårt eget uppspelade högerklick: släpp igenom allt tills det är klart
      if (Date.now() > wc.__anpUppspel) wc.__anpUppspel = 0;
      else { if (m.type === 'mouseUp' && m.button === 'right') wc.__anpUppspel = 0; return; }
    }
    const ctx = wc.__ctx; if (!ctx || !gesterPa || wc.__tabId == null) return;
    let g = ctx.anpDrag;
    if (g && g.wc !== wc) { avbryt(ctx); g = null; }
    if (m.type === 'mouseDown') {
      if (g) { avbryt(ctx); g = null; }                         // en annan knapp mitt i en gest
      if (m.button !== 'right' || ctx.htmlFull) return;          // helskärmsvideo/spel: rör inte
      if (!huvudram(ctx, wc, m)) return;
      ev.preventDefault();
      ctx.anpDrag = { wc, x0: m.x, y0: m.y, px: m.x, py: m.y, lx: m.x, ly: m.y, langd: 0, riktn: '', synlig: false };
      if (sparPa) gestVy(ctx);                                   // värm upp spårvyn medan man börjar dra
      return;
    }
    if (!g) return;
    if (m.type === 'mouseMove') {
      if (!hogerNere(m)) { if (slapptHar(g, m)) avbryt(ctx); return; }
      ev.preventDefault();
      folj(ctx, g, m.x, m.y);
    } else if (m.type === 'mouseUp') {
      if (m.button !== 'right') return;
      ev.preventDefault();
      slut(ctx, g);
    } else if (m.type === 'contextMenu') ev.preventDefault();
  } catch {}
}
function folj(ctx, g, x, y) {
  g.langd += Math.hypot(x - g.lx, y - g.ly); g.lx = x; g.ly = y;
  const dx = x - g.px, dy = y - g.py, ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) >= STEG) {
    if (ax >= ay * 1.4 || ay >= ax * 1.4) {                     // tydligt åt ett håll (snett räknas inte)
      const r = ax > ay ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
      if (g.riktn.slice(-1) !== r) g.riktn = (g.riktn + r).slice(0, 6);
    }
    g.px = x; g.py = y;
  }
  if (!sparPa || g.langd < SPAR_FRAN) return;
  if (!g.synlig) { g.synlig = true; visaSpar(ctx, g); }
  const id = g.riktn && gestKommando(g.riktn), k = id && kommando(id);
  sparSkicka(ctx, 'anpassa-gest:punkt', { x, y, pilar: k ? g.riktn.split('').map((r) => ({ L: '←', R: '→', U: '↑', D: '↓' }[r])).join(' ') : '', namn: k ? (k.visaNamn || (api.T ? api.T(k.namn) : k.namn)) : '' });
}
function slut(ctx, g) {
  ctx.anpDrag = null;
  doljSpar(ctx);
  if (!g.riktn) { if (g.langd < KLICK_MAX) spelaUppHogerklick(g.wc, g.x0, g.y0); return; }
  const id = gestKommando(g.riktn);
  if (id) kor(id, ctx, g.wc, 'gest');
}
function avbryt(ctx) { if (!ctx || !ctx.anpDrag) return; ctx.anpDrag = null; doljSpar(ctx); }
// Ett klick utan rörelse: skicka högerklicket till sidan igen, nu förbi oss → sidan och menyn som vanligt
function spelaUppHogerklick(wc, x, y) {
  if (!wc || wc.isDestroyed()) return;
  wc.__anpUppspel = Date.now() + 400;
  try {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1, modifiers: ['rightButtonDown'] });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 });
  } catch { wc.__anpUppspel = 0; }
}
// Spåret: en genomskinlig vy ovanpå fliken (en per fönster), skapas när den behövs och stängs efter en stund utan gester
function gestVy(ctx) {
  let v = ctx.anpGestVy;
  if (v && !v.webContents.isDestroyed()) { clearTimeout(ctx.anpGestStang); return v; }
  v = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'popup-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try { v.setBackgroundColor('#00000000'); } catch {}
  v.setVisible(false);
  // Under en gest har fliken musen (implicit fångst). Hamnar händelserna ändå här (vyn ligger ovanpå och har samma
  // koordinater) fortsätter gesten härifrån. Utan gest göms vyn direkt, så att den aldrig ligger kvar över sidan.
  v.webContents.on('before-mouse-event', (ev, m) => {
    if (m.type === 'mouseEnter' || m.type === 'mouseLeave') return;
    ev.preventDefault();
    const g = ctx.anpDrag;
    if (g && m.type === 'mouseMove' && hogerNere(m)) { folj(ctx, g, m.x, m.y); return; }
    if (g && m.type === 'mouseUp' && m.button === 'right') { slut(ctx, g); return; }
    if (g && (m.type === 'mouseWheel' || m.type === 'contextMenu' || (m.type === 'mouseMove' && !slapptHar(g, m)))) return;
    avbryt(ctx); doljSpar(ctx);
  });
  v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  v.webContents.on('will-navigate', (e) => e.preventDefault());
  try { ctx.win.contentView.addChildView(v); } catch {}
  ctx.anpGestVy = v; ctx.anpGestKlar = false; ctx.anpGestKo = [];
  v.webContents.loadFile(path.join(__dirname, 'ui', 'anpassa-gest.html')).then(() => {
    if (ctx.anpGestVy !== v) return;
    ctx.anpGestKlar = true;
    for (const [k, d] of ctx.anpGestKo) { try { v.webContents.send(k, d); } catch {} }
    ctx.anpGestKo = [];
  }).catch(() => {});
  return v;
}
function sparSkicka(ctx, kanal, d) {
  const v = ctx.anpGestVy; if (!v || v.webContents.isDestroyed()) return;
  if (ctx.anpGestKlar) { try { v.webContents.send(kanal, d); } catch {} } else if (ctx.anpGestKo.length < 600) ctx.anpGestKo.push([kanal, d]);
}
function visaSpar(ctx, g) {
  const v = gestVy(ctx), fv = ctx.views.get(g.wc.__tabId); if (!fv) return;
  try { ctx.win.contentView.addChildView(v); v.setBounds(fv.getBounds()); v.setVisible(true); } catch {}
  sparSkicka(ctx, 'anpassa-gest:start', { x: g.x0, y: g.y0 });
}
function doljSpar(ctx) {
  const v = ctx.anpGestVy; if (!v) return;
  try { v.setVisible(false); } catch {}   // direkt: en synlig vy ovanpå skulle ta musen från sidan
  sparSkicka(ctx, 'anpassa-gest:slut', {});
  clearTimeout(ctx.anpGestStang);
  ctx.anpGestStang = setTimeout(() => stangGestVy(ctx), 60000);
}
function stangGestVy(ctx) {
  const v = ctx.anpGestVy; if (!v || ctx.anpDrag) return;
  ctx.anpGestVy = null; ctx.anpGestKlar = false; ctx.anpGestKo = [];
  try { if (!ctx.win.isDestroyed()) ctx.win.contentView.removeChildView(v); } catch {}
  try { v.webContents.close(); } catch {}
}

/* ────────── Paletten: bild av sidan bakom ──────────
 * Skalet ritar paletten i sin egen HTML och gömmer flikens vy medan den är öppen (som adressfältets förslag).
 * En nedskalad bild av sidan ligger kvar bakom, så att det ser ut som att sidan finns kvar under. */
async function bild(ctx) {
  if (!ctx || !ctx.visibleTab) return null;
  const v = ctx.views.get(ctx.visibleTab); if (!v) return null;
  const b = v.getBounds(), ut = { flik: ctx.visibleTab, x: b.x, y: b.y, w: b.width, h: b.height, data: null };
  try {
    let img = await v.webContents.capturePage();
    if (!img.isEmpty()) {
      const w = Math.min(b.width, 1400);
      if (img.getSize().width > w) img = img.resize({ width: w, quality: 'good' });
      ut.data = 'data:image/jpeg;base64,' + img.toJPEG(72).toString('base64');
    }
  } catch {}
  return ut;
}

/* ────────── Till skalet ────────── */
function listaForSkal() {
  return {
    mac: MAC, win: WIN, kategorier: KATEGORIER,
    kommandon: allaKommandon().map((k) => ({ id: k.id, namn: k.visaNamn || k.namn, kat: k.kat, std: (k.std || []).slice(), var: k.var === 'skal' ? 'skal' : 'main', ikon: k.ikon || '', barn: !!k.barn, sok: k.sok || '', extra: !!k.extra, lamnar: !!k.lamnar })),
    gester: GESTER.map((g) => ({ m: g.m, namn: g.namn, std: g.std })),
  };
}
function laggTillExtra(lista) {
  if (!Array.isArray(lista)) return;
  let nytt = false;
  for (const d of lista.slice(0, 50)) {
    const id = d && String(d.id || '');
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || INBYGGDA.has(id) || extraKommandon.has(id)) continue;
    const std = (Array.isArray(d.std) ? d.std : []).filter((a) => !ogiltig(a)).slice(0, 2);
    const k = { id, namn: String(d.namn || id).slice(0, 60), kat: KATEGORIER.includes(d.kat) ? d.kat : 'AdRaze', std, var: 'skal', ikon: String(d.ikon || '').slice(0, 20), sok: String(d.sok || '').slice(0, 80), extra: true };
    extraKommandon.set(id, k);
    anpassa.registrera({ nyckel: 'kortkommandon.' + id, standard: std.slice(), etikett: fyll('Kortkommando: {x}', { x: k.namn }) });
    nytt = true;
  }
  if (nytt) bygg();
}

function init(a) {
  api = a; anpassa = a.anpassa;
  for (const k of KOMMANDON) anpassa.registrera({ nyckel: 'kortkommandon.' + k.id, standard: k.std.slice(), etikett: fyll('Kortkommando: {x}', { x: k.namn }) });
  anpassa.registrera({ nyckel: 'gester.pa', standard: false, etikett: 'Musgester' });
  anpassa.registrera({ nyckel: 'gester.spar', standard: true, etikett: 'Musgester: visa spåret' });
  for (const g of GESTER) anpassa.registrera({ nyckel: 'gester.' + g.m, standard: g.std, etikett: fyll('Musgest: {x}', { x: g.namn }) });
  bygg();
  patchaMenyer();
  anpassa.lyssna((nyckel) => {
    if (String(nyckel).startsWith('kortkommandon.')) bygg();
    if (String(nyckel).startsWith('gester.')) uppdateraGester();
  });
  // Flikarnas webContents (ensureView sätter __tabId innan sidan börjar laddas)
  app.on('web-contents-created', (_e, wc) => {
    wc.once('did-start-loading', () => {
      if (wc.__tabId == null || !wc.__ctx) return;
      flikWc.add(wc); wc.once('destroyed', () => flikWc.delete(wc));
      if (gesterPa) kopplaMus(wc);
    });
  });
  app.on('browser-window-created', (_e, win) => {
    const ctxFor = () => { for (const ctx of api.wins.values()) if (ctx.win === win) return ctx; return null; };
    win.on('blur', () => { const ctx = ctxFor(); if (ctx) { avbryt(ctx); ctx.anpInspelning = 0; } });
    win.once('closed', () => { const ctx = ctxFor(); if (ctx) { clearTimeout(ctx.anpGestStang); ctx.anpGestVy = null; ctx.anpDrag = null; } });
  });
  uppdateraGester();

  const ctxAv = (e) => api.wins.get(e.sender.id) || null;
  ipcMain.on('anpassa-kort:lista', (e) => { e.returnValue = listaForSkal(); });
  ipcMain.handle('anpassa-kort:kor', (e, id) => { const ctx = ctxAv(e); id = String(id || ''); if (!ctx || !kommando(id)) return false; return kor(id, ctx, null, 'palett'); });
  ipcMain.handle('anpassa-kort:bild', (e) => bild(ctxAv(e)));
  ipcMain.on('anpassa-kort:fokus', (e) => { const ctx = ctxAv(e); const w = ctx && vyWc(ctx); if (w) { try { w.focus(); } catch {} } });
  ipcMain.on('anpassa-kort:fokus-skal', (e) => { const ctx = ctxAv(e); if (ctx) { try { ctx.win.webContents.focus(); } catch {} } });
  ipcMain.on('anpassa-kort:spela-in', (e, pa) => { const ctx = ctxAv(e); if (ctx) ctx.anpInspelning = pa ? Date.now() : 0; });
  ipcMain.on('anpassa-kort:extra', (_e, lista) => laggTillExtra(lista));
}

// Läget just nu, för det automatiska testet (tools/test/anpassa-kortkommandon.js)
function tillstand() {
  const ctx = api ? [...api.wins.values()][0] : null;
  if (!ctx) return { gesterPa, sparPa, karta: karta.size };
  const v = ctx.visibleTab ? ctx.views.get(ctx.visibleTab) : null, gv = ctx.anpGestVy;
  let sparSyns = false; try { sparSyns = !!(gv && gv.getVisible()); } catch {}
  return { gesterPa, sparPa, karta: karta.size, drag: ctx.anpDrag ? ctx.anpDrag.riktn || '-' : '', sparSyns, inspelning: !!ctx.anpInspelning,
    visibleTab: ctx.visibleTab || null, cb: ctx.win.getContentBounds(), vb: v ? v.getBounds() : null };
}

module.exports = { init, tangent, acc, normAcc, ogiltig, kor, bindningar, tillstand };
