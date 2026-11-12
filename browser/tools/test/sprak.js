#!/usr/bin/env node
// Språktest: startar AdRaze osynligt (egen Xvfb, egen profil, CDP på en port i 9591–9599), byter språk och går igenom
// gränssnittet: nya fliken, varje inställningskategori, Anpassa (alla delar), Falks inställningar, kontot och
// Vänner & chatt (med ett låtsat konto), chattpanelen, Falk-panelen (låst och olåst), menyerna (huvudprocessens
// Menu-mallar: appmenyn, flikmenyn, högerklick i skalet och på en sida), nedladdningsrutan och Sök på sidan.
// I varje vy samlas all text (textnoder, även dolda, och attributen title/placeholder/aria-label/data-tip/…; inte inom
// translate="no", script eller style) och letas efter svenska rester: å/ä/ö (i språk där de inte hör hemma) och vanliga
// svenska ord. Antalet rester skrivs per vy, och testet misslyckas om något hittas som inte står i UNDANTAG.
//
// Användning: node tools/test/sprak.js [webbläsarmapp] [--sprak en,de,ar,ja] [--bilder <mapp>] [--lista]
//   --sprak    språken att testa (standard: en,de,ar,ja – en fullt, de/ar/ja som stickprov med samma vyer)
//   --bilder   sparar skärmbilder per vy (<mapp>/<språk>-<nr>-<vy>.png)
//   --lista    skriv ut alla rester (annars högst 12 per vy)
const path = require('path');
const fs = require('fs');
const net = require('net');
const H = require('./hjalp');

// Text som får se svensk ut: namn och varumärken (jämförs mot hela texten eller som delsträng med /…/)
const UNDANTAG = [
  /Säkerkoll/, /AdRaze/, 'Svenska', 'Norsk', 'Norsk bokmål', 'Dansk', 'Suomi', 'Íslenska', 'Português (BR)', 'Português (PT)', 'Türkçe',
  /^Visa\b.*•{2,}/,               // kortmärket Visa
  'Pexels', / · Pexels$/,          // fotografens namn under bakgrundsbilden
];
// Vanliga svenska ord (hela ord). Per språk tas ord bort som också är vanliga där.
const SV_ORD = ('och att inte för är på eller inga ingen inget här från också sidan fliken flikar inställningar inställning visa stäng ' +
  'spara sparat ändra välj öppna ladda laddar hämta ångra återställ sök kopiera klistra radera avbryt fortsätt tillbaka framåt läge mörkt ljust ' +
  'logga användare lösenord nedladdningar historik bokmärken din ditt dina vill kan ska alla nya ny när så som med till av om du den det ett en har ' +
  'bara redan sedan igen mer fler annan andra webbläsaren sajt sajter konto dag dagar timmar minuter sekunder nej klar klart tryck skriv gäller ' +
  'mitt mina våra hur vad varför också utan genom').split(/\s+/);
const BORT = { en: ['till', 'den', 'an'], de: ['den', 'du', 'konto', 'man', 'an', 'om', 'klar'], ar: [], ja: [] };
const HAR_AAO = { de: /[å]/, fi: /[å]/, et: /[å]/, da: /[äö]/, no: /[äö]/, nb: /[äö]/, hu: /[åä]/, tr: /[åä]/, is: /[åä]/ };

function svenskt(text, lang) {
  const t = String(text || '').trim();
  if (!t || UNDANTAG.some((u) => (u instanceof RegExp ? u.test(t) : u === t))) return null;
  const aao = HAR_AAO[lang] || /[åäöÅÄÖ]/;
  if (aao.test(t)) return 'åäö';
  const bort = new Set(BORT[lang] || []);
  const ord = t.toLowerCase().match(/[\p{L}]+/gu) || [];
  const hit = ord.find((w) => SV_ORD.includes(w) && !bort.has(w));
  return hit ? 'ord "' + hit + '"' : null;
}

// Körs i sidan (via toString): all text under roten
function samla(sel) {
  const ATTR = ['title', 'placeholder', 'aria-label', 'data-tip', 'data-tom', 'data-drop', 'data-ftext', 'alt'];
  const rotter = sel ? [...document.querySelectorAll(sel)] : [document.body];
  const ut = [];
  const vag = (el) => { const d = []; for (let e = el; e && e.nodeType === 1 && d.length < 3; e = e.parentElement) d.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.classList[0] ? '.' + e.classList[0] : '')); return d.reverse().join('>'); };
  const nej = (el) => !el || !!el.closest('[translate="no"],script,style,noscript,template');
  for (const rot of rotter) {
    const w = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && !nej(n.parentElement)) ut.push({ t, var: vag(n.parentElement) }); }
    for (const el of [rot, ...rot.querySelectorAll('*')]) {
      if (nej(el)) continue;
      for (const a of ATTR) { const v = el.getAttribute && el.getAttribute(a); if (v && v.trim()) ut.push({ t: v.trim(), var: vag(el) + '@' + a }); }
    }
  }
  if (!sel) ut.push({ t: document.title || '', var: 'title' });
  return JSON.stringify(ut);
}

// Ledig port i 9591–9599 (uppdraget: testinstanser använder bara de portarna)
async function port() {
  for (let p = 9591; p <= 9599; p++) {
    const ok = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
    if (ok && !upptagna.has(p)) { upptagna.add(p); return p; }
  }
  throw new Error('ingen ledig port i 9591–9599');
}
const upptagna = new Set();

async function kor(rot, { sprak, bilder, lista }) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const rapport = [];
  let app = null;
  try {
    for (const lang of sprak) {
      const profil = H.tempDir('sprak-' + lang);
      const logg = path.join(profil, 'logg.txt');
      upptagna.clear();
      const [insp, cdp] = [await port(), await port()];
      const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
      const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
      app = { p };
      try {
        await H.vantaPaPort(cdp);
        const t = await H.mal(cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html'));
        if (!t) throw new Error('skalet startade inte');
        const s = await H.anslut(t.webSocketDebuggerUrl);
        await s.skicka('Runtime.enable'); await s.skicka('Page.enable');
        const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
        await main.skicka('Runtime.enable');
        const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); ${expr} })()`);
        const redo = async (ss) => { for (let i = 0; i < 80 && (await ss.kor(`typeof showSettingsCat === 'function' && document.readyState === 'complete'`)) !== true; i++) await H.sov(250); await H.sov(1200); };
        await redo(s);
        // Byt språk (sparas i localStorage och laddar om skalet)
        await s.kor(`window.i18n.set(${JSON.stringify(lang)}); 1`);
        await H.sov(1500); await redo(s);
        const aktivt = await s.kor(`window.i18n.lang + '|' + document.documentElement.lang + '|' + document.documentElement.dir`);
        R.ok(lang + ': språket bytt', String(aktivt).startsWith(lang + '|' + lang), aktivt);

        let nr = 0;
        const bild = async (ss, namn) => {
          if (!bilder) return;
          try { const r = await ss.skicka('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(bilder, { recursive: true }); fs.writeFileSync(path.join(bilder, lang + '-' + String(++nr).padStart(2, '0') + '-' + namn + '.png'), Buffer.from(r.result.data, 'base64')); } catch {}
        };
        const vy = async (ss, namn, sel, ta) => {
          await H.sov(350);
          let lista0 = [];
          try { lista0 = JSON.parse(await ss.kor('(' + samla.toString() + ')(' + JSON.stringify(sel || null) + ')')); } catch (e) { R.ok(lang + ': ' + namn + ' gick att läsa', false, String(e)); return; }
          const rester = [];
          const sett = new Set();
          for (const x of lista0) { const why = svenskt(x.t, lang); if (why && !sett.has(x.t)) { sett.add(x.t); rester.push({ ...x, why }); } }
          rapport.push({ lang, namn, texter: lista0.length, rester });
          R.ok(lang + ': ' + namn + ' (' + lista0.length + ' texter, ' + rester.length + ' svenska)', rester.length === 0, rester.slice(0, 3).map((r) => r.t.slice(0, 50)));
          if (ta !== false) await bild(ss, namn);
        };

        // Intro för nya användare (visas första gången) – sedan bort så att den inte skymmer
        if (await s.kor(`!!document.getElementById('hxintro')`)) { await vy(s, 'intro', '#hxintro'); }
        await s.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); document.querySelectorAll('.notis').forEach((n) => n.remove()); return 1; })()`);

        // Skalet: flikraden, verktygsraden och nya fliken
        await vy(s, 'nya-fliken', '#newtabpage');
        await vy(s, 'flikrad-och-verktygsrad', '#tabstrip, #toolbar', false);
        await vy(s, 'inkognitosidan', '#incogpage', false);

        // Menyerna: fånga mallarna i huvudprocessen
        await M(`if (!globalThis.__sprakMeny) { globalThis.__sprakMeny = []; const o = el.Menu.buildFromTemplate; el.Menu.buildFromTemplate = function (mall) { const ut = []; const gå = (l) => (l || []).forEach((m) => { if (m && m.label) ut.push(String(m.label)); if (m && Array.isArray(m.submenu)) gå(m.submenu); }); gå(mall); globalThis.__sprakMeny.push(ut); const menu = o.call(this, mall); setTimeout(() => { try { menu.closePopup(); } catch {} }, 400); return menu; }; } return 1;`);
        const menyer = async (namn, gor) => {
          await M(`globalThis.__sprakMeny.length = 0; return 1;`);
          await gor();
          await H.sov(900);
          const etiketter = JSON.parse(await M(`return JSON.stringify(globalThis.__sprakMeny.flat());`) || '[]');
          const rester = [...new Set(etiketter)].filter((e) => svenskt(e, lang)).map((e) => ({ t: e, var: 'meny', why: svenskt(e, lang) }));
          rapport.push({ lang, namn, texter: etiketter.length, rester });
          R.ok(lang + ': ' + namn + ' (' + etiketter.length + ' rader, ' + rester.length + ' svenska)', etiketter.length > 0 && rester.length === 0, rester.length ? rester.slice(0, 3).map((r) => r.t) : etiketter.length ? undefined : 'ingen meny fångades');
        };
        await menyer('menyn', () => s.kor(`window.view.openMenu(); 1`));
        await menyer('flikmenyn', () => s.kor(`window.view.tabMenu({ id: (typeof active !== 'undefined' && active) ? active.id : 1, hasUrl: true, pinned: false, muted: false, count: 2, canReopen: true }); 1`));
        const hoger = async (ss, x0, y0) => { for (const type of ['mousePressed', 'mouseReleased']) await ss.skicka('Input.dispatchMouseEvent', { type, x: x0, y: y0, button: 'right', clickCount: 1 }); };
        await menyer('högerklick i skalet', () => hoger(s, 700, 600));

        // Inställningar: varje kategori
        await s.kor(`openSettings(); 1`); await H.sov(600);
        await vy(s, 'inställningar-sidomeny', '.set-nav, #settings nav, .set-tabs', false);
        const kategorier = JSON.parse(await s.kor(`JSON.stringify([...document.querySelectorAll('.set-tab[data-cat]')].map((b) => b.dataset.cat))`));
        for (const cat of kategorier) {
          await s.kor(`showSettingsCat(${JSON.stringify(cat)}); 1`);
          await H.sov(cat === 'anpassa' ? 1500 : 500);
          await vy(s, 'inställningar-' + cat, `.set-panel[data-cat="${cat}"]`);
        }
        // Anpassa: öppna alla hopfällda rader och delar och läs igen
        await s.kor(`showSettingsCat('anpassa'); document.querySelectorAll('#settings .set-panel[data-cat="anpassa"] [aria-expanded="false"]').forEach((b) => { try { b.click(); } catch {} }); 1`);
        await H.sov(800);
        await vy(s, 'anpassa-utfällt', '.set-panel[data-cat="anpassa"]');

        // Låtsat konto (vuxen, utan Pro): kontot, Vänner & chatt, familjen
        const konto = `account = { token: 'sprak-test', email: 'test@example.com', pro: false, name: 'Test' }; try { updateAccountBtn(); } catch {} 1`;
        await s.kor(konto);
        await s.kor(`showSettingsCat('konto'); Promise.resolve(renderKonto()).catch(() => {}).then(() => 1)`); await H.sov(900);
        await vy(s, 'kontot-inloggad', '.set-panel[data-cat="konto"]');
        await s.kor(konto);
        await s.kor(`showSettingsCat('vanner'); Promise.resolve(renderFriends()).catch(() => {}).then(() => 1)`); await H.sov(900);
        await vy(s, 'vänner-och-chatt-inloggad', '.set-panel[data-cat="vanner"]');
        await s.kor(konto);
        await s.kor(`showSettingsCat('familj'); 1`); await H.sov(700);
        await vy(s, 'familj-inloggad', '.set-panel[data-cat="familj"]');
        await s.kor(`closeSettings && closeSettings(); 1`); await H.sov(400);

        // Inloggningsrutan
        await s.kor(`account = null; try { openLogin(); } catch {} 1`); await H.sov(700);
        await vy(s, 'inloggningen', '#login, #login-modal, .login, #acct-modal');
        await s.kor(`try { closeLogin(); } catch {} 1`); await H.sov(300);

        // Falk-panelen: låst (inget Pro) och sedan själva panelen
        await s.kor(konto);
        await s.kor(`try { openKrypto(true); } catch (e) {} 1`); await H.sov(2500);
        const falkMal = await H.mal(cdp, (m) => m.type === 'page' && /krypto(-lock)?\.html/.test(m.url), 6000);
        if (falkMal) {
          const f = await H.anslut(falkMal.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await f.skicka('Page.enable');
          await H.sov(800);
          const ladda = (fil, hash) => M(`const wc = el.webContents.getAllWebContents().find((w) => /(krypto(-lock)?|checkout)\\.html/.test(w.getURL())); if (wc) await wc.loadFile(process.mainModule.require('path').join(${JSON.stringify(rot)}, 'ui', ${JSON.stringify(fil)}), ${JSON.stringify(hash ? { hash } : {})}).catch(() => {}); return 1;`);
          if (!falkMal.url.includes('lock')) await vy(f, 'falk-panelen', null);
          // Den låsta panelen (utloggad och utan Pro) och kassan laddas i samma vy för att läsa deras texter
          for (const [fil, hash, namn] of [['krypto-lock.html', 'signedout', 'falk-låst-utloggad'], ['krypto-lock.html', 'nopro', 'falk-låst-utan-pro']]) {
            await ladda(fil, hash); await H.sov(1500);
            await vy(f, namn, null);
          }
          await ladda('krypto.html'); await H.sov(2500);
          if (falkMal.url.includes('lock')) await vy(f, 'falk-panelen', null);
          // och kassan
          await ladda('checkout.html', 'pro_month'); await H.sov(2000);
          await vy(f, 'falk-kassan', null);
          f.stang();
        } else R.ok(lang + ': Falk-panelen öppnades', false);
        await s.kor(`try { openKrypto(false); } catch (e) {} 1`); await H.sov(500);

        // Chattpanelen (hela sidan, även inställningarna som är dolda)
        await s.kor(konto);
        await s.kor(`try { openChatt(true); } catch (e) {} 1`); await H.sov(3000);
        const chattMal = await H.mal(cdp, (m) => m.type === 'page' && /chatt\.html/.test(m.url), 6000);
        if (chattMal) {
          const c = await H.anslut(chattMal.webSocketDebuggerUrl); await c.skicka('Runtime.enable'); await c.skicka('Page.enable');
          await H.sov(800);
          await vy(c, 'chatten', null);
          c.stang();
        } else R.ok(lang + ': chatten öppnades', false);
        await s.kor(`try { openChatt(false); } catch (e) {} account = null; try { updateAccountBtn(); } catch {} 1`); await H.sov(500);

        // En webbsida i en flik: högerklick på sidan, Sök på sidan och nedladdningsrutan
        await s.kor(`createTab('https://example.com/'); 1`);
        await H.sov(3000);
        const sida = await H.mal(cdp, (m) => m.type === 'page' && m.url.startsWith('https://example.com'), 8000);
        if (sida) {
          const w = await H.anslut(sida.webSocketDebuggerUrl);
          await menyer('högerklick på en sida', () => hoger(w, 200, 200));
          w.stang();
        } else R.ok(lang + ': en webbsida öppnades i en flik', false, (await H.hamtaJson(cdp, '/json')).map((m) => m.type + ' ' + m.url.slice(0, 60)));
        await s.kor(`window.anpassaKortkommandon.kor('sok-pa-sidan').then(() => 1)`); await H.sov(1500);
        const sok = await H.mal(cdp, (m) => m.type === 'page' && /find\.html/.test(m.url), 5000);
        if (sok) {
          const f = await H.anslut(sok.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await f.skicka('Page.enable');
          await vy(f, 'sök-på-sidan', null);
          await bild(s, 'sök-på-sidan-i-fönstret');
          f.stang();
        } else R.ok(lang + ': Sök på sidan öppnades', false);
        await s.kor(`window.dl.popupToggle(); 1`); await H.sov(1500);
        const dl = await H.mal(cdp, (m) => m.type === 'page' && /downloads\.html/.test(m.url), 5000);
        if (dl) {
          const d = await H.anslut(dl.webSocketDebuggerUrl); await d.skicka('Runtime.enable'); await d.skicka('Page.enable');
          await vy(d, 'nedladdningsrutan', null);
          await bild(s, 'nedladdningsrutan-i-fönstret');
          d.stang();
        } else R.ok(lang + ': nedladdningsrutan öppnades', false);

        const nekade = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => r.includes('[ipc] nekad'));
        R.ok(lang + ': inga IPC-kanaler nekade', !nekade.length, nekade.slice(0, 3));
        s.stang(); main.stang();
      } finally {
        await H.stang(p);
        app = null;
        try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
      }
    }
  } catch (e) {
    R.ok('testet kördes klart', false, String((e && e.stack) || e));
  } finally {
    if (app) await H.stang(app.p);
    x.stoppa();
  }
  // Sammanställning per vy
  const rader = ['', 'Svenska rester per vy:'];
  for (const r of rapport) {
    rader.push('  ' + r.lang.padEnd(3) + ' ' + r.namn.padEnd(34) + String(r.rester.length).padStart(4) + ' av ' + r.texter);
    for (const x of r.rester.slice(0, lista ? 1e9 : 12)) rader.push('        ' + JSON.stringify(x.t.slice(0, 110)) + '  [' + x.why + ']  ' + x.var);
  }
  R.sammanstallning = rader.join('\n');
  return R;
}

module.exports = { kor, svenskt };
if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
  const bilder = val('--bilder') ? path.resolve(val('--bilder')) : null;
  const sprak = (val('--sprak') || 'en,de,ar,ja').split(',').filter(Boolean);
  const mapp = a.find((v, j) => !v.startsWith('--') && !['--bilder', '--sprak'].includes(a[j - 1]));
  kor(path.resolve(mapp || path.join(__dirname, '..', '..')), { sprak, bilder, lista: a.includes('--lista') }).then((R) => {
    console.log(R.text());
    console.log(R.sammanstallning || '');
    if (bilder) console.log('Skärmbilder: ' + bilder);
    process.exit(R.fel.length ? 1 : 0);
  });
}
