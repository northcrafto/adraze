#!/usr/bin/env node
// Test av Anpassa → Avancerat: egen CSS för sajter, egen CSS för AdRaze (nödutgången) och användarskript.
// Körs osynligt (egen Xvfb) mot dev-bygget. Testsajterna kommer från en egen lokal http-server: alla *.example
// pekas om till den med --host-resolver-rules, så sidorna har riktiga namn (adraze-test.example, checkout.…).
// Huvudprocessen nås via Node-inspektören (som i sakerhet.js), skalet och flikarna via felsökningsporten.
// Användning: node tools/test/anpassa-avancerat.js [webbläsarmapp]   (avslutar med 0 om allt gick igenom)
// Skärmdumparna sparas i $BILDER (annars en tempmapp som skrivs ut sist).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const H = require('./hjalp');

/* ── Testsajten ── */
const SIDA = (titel) => `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>${titel}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 32px; color: rgb(20, 20, 20); background: rgb(255, 255, 255); }
  #prov { color: rgb(0, 0, 0); }
  #prov3 { color: rgb(0, 0, 0) !important; }
</style>
<script>
  window.sidansHemlis = 'hemligt';
  document.documentElement.dataset.sidaTid = String(performance.now());
  document.documentElement.dataset.sidaSagB = document.documentElement.dataset.bTid ? 'ja' : 'nej';
</script>
</head><body>
<h1 id="prov">Testsida för AdRaze</h1>
<p id="prov2">Den här raden färgas av egen CSS.</p>
<p id="prov3">Den här raden har sidans egen !important.</p>
<iframe id="ram" src="/ram" width="420" height="80"></iframe>
</body></html>`;
const RAM = '<!doctype html><meta charset="utf-8"><p>Inbäddad ram</p>';

function startaServer() {
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/favicon.ico') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(u.pathname === '/ram' ? RAM : SIDA(req.headers.host + u.pathname));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

/* ── Skripten och CSS:en som testet lägger in ── */
const rakna = (k) => `var d = document.documentElement.dataset; d.${k} = String((Number(d.${k}) || 0) + 1);`;
const NAMN = ['require', 'process', 'module', 'Buffer', 'global', 'window.auth', 'window.anpassaBro', 'window.anpassaAvancerat', 'window.adrazeIpc', 'window.view', 'window.sidansHemlis'];
const KOD_A = [
  rakna('aKor'),
  `d.aTyper = [${NAMN.map((n) => 'typeof ' + n).join(', ')}].join(',');`,
  "d.aGm = typeof GM_addStyle + '/' + typeof GM_info + '/' + (typeof GM_info === 'object' ? GM_info.script.name : '');",
  "window.skriptHemlis = 'skript';",
  "GM_addStyle('#prov2 { outline: 2px solid rgb(0, 0, 255); }');",
].join('\n');
const KOD_B = [   // "Tidigt": skriver tiden så fort <html> finns (före sidans eget skript i <head>)
  'var t = performance.now();',
  'var skriv = function () { var d = document.documentElement.dataset; d.bTid = String(t); d.bKor = String((Number(d.bKor) || 0) + 1); };',
  'if (document.documentElement) skriv(); else new MutationObserver(function (_m, o) { if (document.documentElement) { o.disconnect(); skriv(); } }).observe(document, { childList: true });',
].join('\n');
const SAJT = '*.adraze-test.example/*';
const SKRIPT = [
  { id: 'sA', namn: 'Test A', match: [SAJT], exclude: ['*.adraze-test.example/utan*'], tid: 'document-end', ramar: true, pa: true, kod: KOD_A },
  { id: 'sB', namn: 'Test B tidigt', match: [SAJT], exclude: [], tid: 'document-start', ramar: false, pa: true, kod: KOD_B },
  { id: 'sC', namn: 'Bara ramen', match: ['*://adraze-test.example/ram*'], exclude: [], tid: 'document-end', ramar: true, pa: true, kod: rakna('cKor') },
  { id: 'sD', namn: 'Inte i ramar', match: [SAJT], exclude: [], tid: 'document-end', ramar: false, pa: true, kod: rakna('dKor') },
  { id: 'sE', namn: 'Avstängt', match: [SAJT], exclude: [], tid: 'document-end', ramar: true, pa: false, kod: rakna('eKor') },
  { id: 'sF', namn: 'SPA', match: ['*.adraze-test.example/spa*'], exclude: [], tid: 'document-end', ramar: false, pa: true, kod: rakna('fKor') },
  { id: 'sG', namn: 'Trasigt skript', match: [SAJT], exclude: [], tid: 'document-end', ramar: true, pa: true, kod: '// Saknar värde\ndocument.documentElement.dataset.gKor = "1";\nvar = ;' },
  { id: 'sH', namn: 'Alla sajter', match: ['<all_urls>'], exclude: [], tid: 'document-end', ramar: false, pa: true, kod: rakna('allaKor') },
  { id: 'sK', namn: 'Kastar fel', match: [SAJT], exclude: [], tid: 'document-end', ramar: false, pa: true, kod: 'throw new Error("avsiktligt fel i testskript");' },
];
const CSS_SAJT = '/* Testregel */\n#prov { color: rgb(255, 0, 0); }\n#prov2 { color: rgb(255, 0, 0); }\n#prov3 { color: rgb(255, 0, 0) !important; }';
const CSS = [
  { id: 'c1', mal: 'adraze-test.example', under: true, css: CSS_SAJT, pa: true },
  { id: 'c2', mal: '*', under: true, css: 'body { border-top: 7px solid rgb(0, 128, 0); }\n#prov3 { color: rgb(0, 0, 255) !important; }', pa: true },
];
const SKALCSS = { pa: true, css: ':root { --anp-test: 42px; }\n#tabs { box-shadow: inset 0 -3px 0 rgb(255, 75, 31); }' };

/* ── Små hjälpare ── */
async function vanta(fn, ms = 8000, steg = 150) {
  const slut = Date.now() + ms; let v;
  while (Date.now() < slut) { try { v = await fn(); if (v) return v; } catch {} await H.sov(steg); }
  return v;
}
const KLAR = `new Promise((r) => { const k = () => (document.readyState === 'complete' ? r(1) : setTimeout(k, 50)); k(); })`;
async function oppnaFlik(cdp, villkor, ms = 15000) {
  const t = await H.mal(cdp, villkor, ms);
  if (!t) return null;
  const c = await H.anslut(t.webSocketDebuggerUrl);
  await c.skicka('Runtime.enable');
  await c.kor(KLAR);
  await H.sov(400);   // "När sidan har laddats"-skripten och CSS:en hinner fram
  return c;
}
const data = async (c) => JSON.parse(await c.kor('JSON.stringify(Object.assign({}, document.documentElement.dataset))'));
const ramData = async (c) => JSON.parse(await c.kor(`JSON.stringify(Object.assign({}, document.getElementById('ram').contentDocument.documentElement.dataset))`));
const stil = (c, id, prop) => c.kor(`getComputedStyle(document.getElementById(${JSON.stringify(id)}))[${JSON.stringify(prop)}]`);
const ODEF = NAMN.map(() => 'undefined').join(',');
async function bild(c, fil) {
  const r = await c.skicka('Page.captureScreenshot', { format: 'png' });
  if (r && r.result && r.result.data) fs.writeFileSync(fil, Buffer.from(r.result.data, 'base64'));
  return fil;
}
// Rulla fram ett element i inställningarna, nedanför den klistrade sökrutan (redigerarna har egen scroll-margin)
const VISA = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; e.scrollIntoView({ block: 'start' });
  if (e.classList.contains('anp-red')) return 1;
  let p = e.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  const t = document.querySelector('#settings .set-top'); if (p && t) p.scrollTop -= t.offsetHeight + 12; return 1; })()`;

/* ── Del 1: ren Node (mönster, känsliga sidor, kontrollen) ── */
function enhet(R, rot) {
  const { _test: T } = require(path.join(rot, 'anpassa-avancerat'));
  const m = (p, u) => T.matchar(T.tolkaMonster(p), new URL(u));
  R.ok('mönster *.example.com/* gäller example.com och underdomäner', m('*.example.com/*', 'https://example.com/') && m('*.example.com/*', 'http://a.b.example.com/x?y=1'));
  R.ok('mönster *.example.com/* gäller inte grannar', !m('*.example.com/*', 'https://notexample.com/') && !m('*.example.com/*', 'https://example.com.evil.net/'));
  R.ok('mönster med https:// gäller inte http', m('https://example.com/*', 'https://example.com/a') && !m('https://example.com/*', 'http://example.com/a'));
  R.ok('mönster utan sökväg gäller hela sajten', m('example.com', 'http://example.com/a/b'));
  R.ok('mönster med sökväg', m('*.example.com/spa*', 'https://example.com/spa/1') && !m('*.example.com/spa*', 'https://example.com/x'));
  R.ok('<all_urls> och *://*/*', m('<all_urls>', 'https://x.se/') && m('*://*/*', 'http://y.se/z'));
  R.ok('jokertecken mitt i värden (@include-stil)', m('*example.com*', 'https://www.example.com/a') && !m('*example.com*', 'https://exempel.se/'));
  R.ok('reguljära uttryck och andra scheman nekas', T.tolkaMonster('/.*/') === null && T.tolkaMonster('ftp://x/*') === null && T.tolkaMonster('file:///*') === null);
  const t0 = Date.now();
  const elak = T.glob('*a*a*a*a*a*a*a*a*a*a*a*a*b', 'a'.repeat(20000));
  R.ok('elakt mönster låser inte huvudprocessen', elak === false && Date.now() - t0 < 1000, Date.now() - t0 + ' ms');
  const kansliga = ['https://adraze.app/', 'https://accounts.adraze.app/login', 'https://js.stripe.com/v3/', 'https://www.paypal.com/checkoutnow', 'https://checkout.shop.example/',
    'https://shop.example/checkout/steg1', 'https://shop.example/sv/kassa', 'https://shop.example/wallet', 'https://wallet.shop.example/', 'https://shop.example/pay/123', 'https://shop.example/betalning?x=1', 'https://appleid.apple.com/', 'https://accounts.google.com/signin',
    'adraze://adblock', 'file:///etc/passwd', 'about:blank', 'chrome://settings', 'inte en adress'];
  const fel = kansliga.filter((u) => !T.kanslig(u));
  R.ok('känsliga sidor (AdRaze, inloggning, betalning, interna) känns igen', !fel.length, fel);
  const vanliga = ['https://example.com/', 'https://shop.example/checkoutinfo', 'https://news.example/payments-industry', 'https://adraze.app.evil.example/'];
  R.ok('vanliga sidor räknas inte som känsliga', vanliga.every((u) => !T.kanslig(u)), vanliga.filter((u) => T.kanslig(u)));
  R.ok('sajtnamn normaliseras', T.normVard('https://www.Example.com/x') === 'example.com' && T.normVard('*.example.com') === 'example.com' && T.normVard('räksmörgås.se') === 'xn--rksmrgs-5wao1o.se' && T.normVard('javascript:alert(1)') === '' && T.normVard('*') === '*');
  delete globalThis.__anpKordes;
  const k1 = T.kolla({ kod: 'globalThis.__anpKordes = 1;' });
  R.ok('kontrollen kompilerar men kör aldrig skriptet', k1.ok === true && globalThis.__anpKordes === undefined);
  const k2 = T.kolla({ kod: '// rad 1\nvar a = 1;\nvar = ;\n' });
  R.ok('kontrollen hittar raden med syntaxfel', k2.ok === false && k2.rad === 3, k2);
  const k3 = T.kolla({ kod: '1', match: ['/re/', '*.ok.example/*'], exclude: ['ftp://a/*'] });
  R.ok('kontrollen pekar ut ogiltiga mönster', JSON.stringify(k3.ogiltiga) === JSON.stringify(['/re/', 'ftp://a/*']), k3);
}

/* ── Del 2 och 3: appen ── */
async function kor(rot) {
  const R = H.resultat();
  const bilder = process.env.BILDER || H.tempDir('avancerat-bilder');
  fs.mkdirSync(bilder, { recursive: true });
  try { enhet(R, rot); } catch (e) { R.ok('enhetstesterna kördes', false, String(e && e.stack || e)); }

  const server = await startaServer();
  const P = server.address().port;
  const x = await H.startaXvfb();
  const profil = H.tempDir('avancerat');
  const logg = path.join(profil, 'logg.txt');
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  let p = null;
  const anslutningar = [];

  // Startar AdRaze och ansluter till huvudprocessen och skalet
  async function starta(extra) {
    const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
    p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp, '--host-resolver-rules=MAP *.example 127.0.0.1:' + P, ...extra], H.testMiljo(x.display, profil), logg);
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    if (!shellT) throw new Error('skalet startade inte');
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
    await main.skicka('Runtime.enable');
    const shell = await H.anslut(shellT.webSocketDebuggerUrl);
    await shell.skicka('Runtime.enable');
    await shell.kor(KLAR);
    // Ingen fråga om standardwebbläsare mitt i testet. Introt avslutas på riktigt (klick) innan det tas bort –
    // annars ligger dess Enter/Esc-lyssnare kvar och flyttar fokus till startsidans sökruta.
    await shell.kor(`localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e5)); localStorage.setItem('adraze-flytt-erbjuden', '1'); 1`);
    await H.sov(1500);
    await shell.kor(`(() => { const i = document.getElementById('hxintro'); if (i) { i.click(); i.remove(); } const b = document.getElementById('defbrowser-banner'); if (b) b.remove(); return 1; })()`);
    anslutningar.push(main, shell);
    const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); const av = process.mainModule.require('./anpassa-avancerat'); const wcFor = (u) => el.webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL().startsWith(u)); ${expr} })()`);
    return { cdp, main, shell, M };
  }
  const flik = async (cdp, url, villkor) => { const c = await oppnaFlik(cdp, villkor || ((t) => t.url === url)); if (c) anslutningar.push(c); return c; };
  const fel = (s) => s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);

  try {
    /* ═════ Körning 1 ═════ */
    const { cdp, shell, M } = await starta([]);
    const B = 'http://adraze-test.example';
    const satt = (k, v, etikett) => shell.kor(`Anpassa.set(${JSON.stringify(k)}, ${JSON.stringify(v)}, ${JSON.stringify(etikett || 'test')})`);
    R.ok('Anpassa: CSS för sajter sparas', (await satt('avancerat.css', CSS)).ok === true);
    R.ok('Anpassa: användarskript sparas', (await satt('avancerat.skript', SKRIPT)).ok === true);
    R.ok('Anpassa: CSS för AdRaze sparas', (await satt('avancerat.skalcss', SKALCSS)).ok === true);
    await shell.kor(`window.__toasts = []; (() => { const o = showToast; window.showToast = (m) => { window.__toasts.push(String(m)); return o(m); }; })(); 1`);

    // Skalets egen CSS
    const skalVar = () => shell.kor(`getComputedStyle(document.documentElement).getPropertyValue('--anp-test').trim()`);
    R.ok('egen CSS för AdRaze gäller i skalet', (await vanta(async () => (await skalVar()) === '42px', 5000)) === true);

    // IPC: kontrollen bara för skalet; skriptlistan bara för flikar, och bara för vanliga sidor
    const ui = `{ senderFrame: { url: el.webContents.getAllWebContents().map((w) => w.getURL()).find((u) => u.includes('/ui/shell.html')), origin: 'file://' }, sender: {} }`;
    const webb = `{ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: {} }`;
    R.ok('avancerat:kolla nekas från webbsida', (await M(`return await el.ipcMain._invokeHandlers.get('avancerat:kolla')(${webb}, { kod: '1' })`)) === null);
    const k = await M(`delete globalThis.__anpKordes; const r = await el.ipcMain._invokeHandlers.get('avancerat:kolla')(${ui}, { kod: 'globalThis.__anpKordes = 1;' }); return { r, kordes: typeof globalThis.__anpKordes }`);
    R.ok('avancerat:kolla från skalet kompilerar utan att köra', k && k.r && k.r.ok === true && k.kordes === 'undefined', k);
    const k2 = await M(`return await el.ipcMain._invokeHandlers.get('avancerat:kolla')(${ui}, { kod: 'var a = 1;\\nvar = ;' })`);
    R.ok('avancerat:kolla ger raden med felet', k2 && k2.ok === false && k2.rad === 2, k2);
    const skriptFran = (sender, url, topp) => M(`const f = el.ipcMain.listeners('avancerat:skript')[0]; const e = { sender: ${sender}, senderFrame: { url: ${JSON.stringify(url)}, parent: ${topp ? 'null' : '{}'} }, returnValue: undefined }; f(e); const v = e.returnValue; return v ? { varld: v.varld, id: v.skript.map((s) => s.id) } : v;`);
    R.ok('avancerat:skript: inget till ett sken-avsändare', (await skriptFran('{}', 'https://evil.example/', true)) === null);
    R.ok('avancerat:skript: inget till skalet', (await skriptFran(`wcFor('file://')`, B + '/', false)) === null);

    // ── Flik 1: vanlig sida med alla skript och CSS
    await shell.kor(`createTab(${JSON.stringify(B + '/forsta')}); 1`);
    const f1 = await flik(cdp, B + '/forsta');
    R.ok('flik 1 laddad', !!f1);
    if (!f1) return R;
    await vanta(async () => (await data(f1)).aKor === '1', 5000);
    const d1 = await data(f1);
    R.ok('skript körs på sajten (När sidan har laddats)', d1.aKor === '1' && d1.dKor === '1', d1);
    R.ok('skript kan inte läsa require, process, window.auth, AdRazes API:er eller sidans variabler', d1.aTyper === ODEF, d1.aTyper);
    R.ok('sidan ser inte skriptets variabler', (await f1.kor(`typeof window.skriptHemlis + '/' + typeof window.GM_addStyle + '/' + typeof window.GM_info`)) === 'undefined/undefined/undefined');
    R.ok('GM_addStyle och GM_info finns för skripten', d1.aGm === 'function/object/Test A' && (await stil(f1, 'prov2', 'outlineColor')) === 'rgb(0, 0, 255)', d1.aGm);
    R.ok('"Tidigt"-skript körs före sidans egna skript', d1.bKor === '1' && d1.sidaSagB === 'ja' && Number(d1.bTid) <= Number(d1.sidaTid), { b: d1.bTid, sida: d1.sidaTid, sag: d1.sidaSagB });
    R.ok('avstängt skript körs inte', d1.eKor === undefined);
    R.ok('skript med syntaxfel körs inte (och stoppar inga andra)', d1.gKor === undefined && d1.allaKor === '1');
    R.ok('skript körs inte där mönstret inte gäller', d1.cKor === undefined && d1.fKor === undefined);
    const r1 = await ramData(f1);
    R.ok('ramar: skript med "Även i inbäddade ramar" körs en gång i ramen', r1.aKor === '1' && r1.cKor === '1', r1);
    R.ok('ramar: skript utan ramar och "Tidigt" (utan ramar) körs inte i ramen', r1.dKor === undefined && r1.bKor === undefined && r1.allaKor === undefined, r1);
    R.ok('isolerad: skriptet i ramen ser inte heller require/process', r1.aTyper === ODEF, r1.aTyper);
    // CSS
    R.ok('egen CSS för sajten gäller', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(255, 0, 0)', 4000)) === true);
    R.ok('egen CSS med !important vinner över sajtens !important, och sajtens regel över "Alla sajter"', (await stil(f1, 'prov3', 'color')) === 'rgb(255, 0, 0)');
    const likaStark = await stil(f1, 'prov', 'color');
    R.ok('CSS för alla sajter gäller', (await stil(f1, 'prov2', 'color')) && (await f1.kor(`getComputedStyle(document.body).borderTopWidth + ' ' + getComputedStyle(document.body).borderTopColor`)) === '7px rgb(0, 128, 0)');
    console.log('[info] lika stark regel som sajtens (#prov): ' + (likaStark === 'rgb(255, 0, 0)' ? 'egen CSS vinner' : 'sajten vinner') + ' (' + likaStark + ')');
    await bild(f1, path.join(bilder, '1-testsida.png'));
    // Ändra CSS:en: byts direkt i den öppna fliken, utan omladdning
    await f1.kor('window.__ingenOmladdning = 1');
    await satt('avancerat.css', [{ ...CSS[0], css: CSS_SAJT.replace('#prov2 { color: rgb(255, 0, 0); }', '#prov2 { color: rgb(0, 0, 255); }') }, CSS[1]]);
    R.ok('ändrad CSS gäller direkt i öppen flik', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(0, 0, 255)', 4000)) === true);
    await satt('avancerat.css', [{ ...CSS[0], pa: false }, CSS[1]]);
    R.ok('avslagen regel försvinner direkt (båda kopiorna, "Alla sajter" gäller då)', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(20, 20, 20)' && (await stil(f1, 'prov3', 'color')) === 'rgb(0, 0, 255)', 4000)) === true);
    await satt('avancerat.css', CSS);
    R.ok('påslagen igen', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(255, 0, 0)', 4000)) === true);
    R.ok('ingen omladdning när CSS:en ändras', (await f1.kor('window.__ingenOmladdning')) === 1);
    R.ok('skript körs inte om när CSS:en ändras', (await data(f1)).aKor === '1');
    R.ok('avancerat:skript: underram får bara ram-skripten', JSON.stringify(await skriptFran(`wcFor(${JSON.stringify(B + '/forsta')})`, B + '/ram', false)) === JSON.stringify({ varld: 4100, id: ['sA', 'sC', 'sG'] }));
    for (const u of ['https://accounts.adraze.app/login', 'adraze://adblock', 'file:///etc/passwd', 'https://checkout.stripe.com/c/pay']) {
      const s = await skriptFran(`wcFor(${JSON.stringify(B + '/forsta')})`, u, false);
      R.ok('avancerat:skript: inga skript till ' + u, s && s.id.length === 0, s);
    }

    // ── Undantag (!) och känsliga sidor
    await shell.kor(`createTab(${JSON.stringify(B + '/utan')}); 1`);
    const f2 = await flik(cdp, B + '/utan');
    const d2 = f2 ? await data(f2) : {};
    R.ok('undantag (!mönster) stoppar skriptet, andra körs', d2.aKor === undefined && d2.dKor === '1' && d2.bKor === '1', d2);
    for (const u of ['http://checkout.adraze-test.example/', B + '/kassa/', B + '/konto/betalning']) {
      await shell.kor(`createTab(${JSON.stringify(u)}); 1`);
      const f = await flik(cdp, u);
      const d = f ? await data(f) : null;
      const r = f ? await ramData(f) : null;
      R.ok('betalsida ' + u + ': inga skript (inte heller i ramen)', !!d && d.aKor === undefined && d.bKor === undefined && d.allaKor === undefined && r.aKor === undefined && r.cKor === undefined, { d, r });
      R.ok('betalsida ' + u + ': ingen egen CSS', !!f && (await stil(f, 'prov2', 'color')) === 'rgb(20, 20, 20)' && (await f.kor('getComputedStyle(document.body).borderTopWidth')) === '0px');
      if (f) R.ok('betalsida ' + u + ': inget "Redigera CSS" i högerklicksmenyn', (await M(`return av.menyval(wcFor(${JSON.stringify(u)})).length`)) === 0);
    }
    await shell.kor(`createTab('http://annan.example/sida'); 1`);
    const f3 = await flik(cdp, 'http://annan.example/sida');
    const d3 = f3 ? await data(f3) : {};
    R.ok('annan sajt: bara "Alla sajter"-skriptet och -CSS:en', d3.allaKor === '1' && d3.aKor === undefined && d3.bKor === undefined && (await stil(f3, 'prov2', 'color')) === 'rgb(20, 20, 20)' && (await stil(f3, 'prov3', 'color')) === 'rgb(0, 0, 255)' && (await f3.kor('getComputedStyle(document.body).borderTopWidth')) === '7px', d3);
    await shell.kor(`createTab('adraze://adblock'); 1`);
    const f4 = await flik(cdp, 'adraze://adblock', (t) => t.url.startsWith('adraze://adblock'));
    R.ok('AdRazes egna sidor: inga skript (inte ens <all_urls>)', !!f4 && (await f4.kor('document.documentElement.dataset.allaKor === undefined')) === true);
    R.ok('AdRazes egna sidor: inget "Redigera CSS"', (await M(`return av.menyval(wcFor('adraze://adblock')).length`)) === 0);

    // ── SPA: adressbyte utan omladdning
    await shell.kor(`createTab(${JSON.stringify(B + '/start')}); 1`);
    const f5 = await flik(cdp, B + '/start');
    if (f5) {
      await f5.kor(`window.__spa = 1; history.pushState({}, '', '/spa/vy2'); 1`);
      R.ok('SPA: skript som börjar gälla på nya adressen körs', (await vanta(async () => (await data(f5)).fKor === '1', 4000)) === true);
      await f5.kor(`history.pushState({}, '', '/spa/vy3'); 1`);
      await H.sov(700);
      const d5 = await data(f5);
      R.ok('SPA: inget skript körs två gånger i samma dokument', d5.fKor === '1' && d5.aKor === '1', d5);
      await f5.kor(`history.pushState({}, '', '/kassa/'); 1`);
      const omladdad = await vanta(async () => (await f5.kor(`typeof window.__spa === 'undefined' && document.readyState === 'complete' && location.pathname`)) === '/kassa/', 6000);
      await H.sov(400);
      const d5b = omladdad ? await data(f5) : {};
      R.ok('SPA till en kassa: sidan laddas om och skripten är borta', omladdad === true && d5b.aKor === undefined && d5b.bKor === undefined, d5b);
    } else R.ok('SPA-fliken laddad', false);

    // ── Inkognito: varken CSS eller skript
    await shell.kor(`createTab(${JSON.stringify(B + '/inkognito')}, true); 1`);
    const f6 = await flik(cdp, B + '/inkognito');
    R.ok('inkognitofliken har en tillfällig session', (await M(`return wcFor(${JSON.stringify(B + '/inkognito')}).session.isPersistent()`)) === false);
    const d6 = f6 ? await data(f6) : null;
    R.ok('inkognito: inga skript', !!d6 && d6.aKor === undefined && d6.bKor === undefined && d6.allaKor === undefined, d6);
    R.ok('inkognito: ingen egen CSS', !!f6 && (await stil(f6, 'prov2', 'color')) === 'rgb(20, 20, 20)' && (await f6.kor('getComputedStyle(document.body).borderTopWidth')) === '0px');
    R.ok('inkognito: avancerat:skript ger inget', (await skriptFran(`wcFor(${JSON.stringify(B + '/inkognito')})`, B + '/x', true)) === null);
    R.ok('inkognito: inget "Redigera CSS"', (await M(`return av.menyval(wcFor(${JSON.stringify(B + '/inkognito')})).length`)) === 0);

    // ── Delningskod: CSS och skript följer aldrig med, och kan inte smugglas in
    const avkoda = (kod) => `JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(${kod}.slice(6).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))`;
    const ex = await shell.kor(`(async () => { const a = ${avkoda('(await Anpassa.exportera())')}; const b = ${avkoda("(await Anpassa.exportera('avancerat.'))")}; return { alla: Object.keys(a), avancerat: Object.keys(b) }; })()`);
    R.ok('delningskoden innehåller ingen egen CSS eller skript', ex && !ex.alla.some((k) => k.startsWith('avancerat.')) && ex.avancerat.length === 0, ex);
    const elak = { 'avancerat.skript': [{ id: 'elak', namn: 'Elak', match: ['<all_urls>'], tid: 'document-start', pa: true, kod: 'alert(1)' }], 'avancerat.css': [{ id: 'e', mal: '*', css: 'body{display:none}' }], 'avancerat.skalcss': { pa: true, css: '*{display:none}' } };
    const imp = await shell.kor(`(async () => { const json = ${JSON.stringify(JSON.stringify(elak))}; const kod = 'ADRZ1.' + btoa(unescape(encodeURIComponent(json))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); const r = await Anpassa.importera(kod); return { r, skript: Anpassa.get('avancerat.skript').map((s) => s.id), css: Anpassa.get('avancerat.css').length, skal: Anpassa.get('avancerat.skalcss').css }; })()`);
    R.ok('delningskod med skript/CSS importeras inte', imp && imp.r && imp.r.ok === true && imp.r.antal === 0 && !imp.skript.includes('elak') && imp.css === 2 && imp.skal === SKALCSS.css, imp);

    // ── Värdena skickas bara till AdRazes egna fönster, aldrig till en webbsida i ett eget fönster (popup)
    await M(`const w = new el.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } }); await w.loadURL('http://annan.example/popup'); const sent = []; const o = w.webContents.send.bind(w.webContents); w.webContents.send = (k, ...a) => { sent.push(k); return o(k, ...a); }; globalThis.__anpPopup = { w, sent }; return 1`);
    await satt('avancerat.skript', SKRIPT.map((s) => (s.id === 'sE' ? { ...s, namn: 'Avstängt (ändrat)' } : s)));
    await H.sov(300);
    const pop = await M(`const p = globalThis.__anpPopup; const s = p.sent.slice(); p.w.destroy(); delete globalThis.__anpPopup; return s`);
    R.ok('popupfönster med webbsida får inga Anpassa-värden', Array.isArray(pop) && !pop.includes('anpassa:andrad'), pop);
    R.ok('skalet fick ändringen', (await shell.kor(`Anpassa.get('avancerat.skript').find((s) => s.id === 'sE').namn`)) === 'Avstängt (ändrat)');

    // ── Nödutgången: Ctrl+Shift+Alt+R stänger av skalets CSS, oavsett var fokus är, och laddar inte om fliken
    const nod = (u) => M(`wcFor(${JSON.stringify(u)}).emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'R', code: 'KeyR', control: true, shift: true, alt: true, meta: false }); return 1`);
    await f1.kor('window.__fore = 1');
    await nod('file://');
    R.ok('nödutgången (från skalet) stänger av CSS:en för AdRaze', (await vanta(async () => (await skalVar()) === '', 4000)) === true);
    R.ok('nödutgången sparar "av"', (await shell.kor(`Anpassa.get('avancerat.skalcss').pa`)) === false);
    R.ok('nödutgången visar ett meddelande', (await vanta(async () => (await shell.kor(`window.__toasts.join('|')`)).includes('Egen CSS för AdRaze är avstängd'), 3000)) === true);
    R.ok('nödutgången laddar inte om fliken (inte Ctrl+Shift+R)', (await f1.kor('window.__fore')) === 1);
    await satt('avancerat.skalcss', SKALCSS);
    R.ok('CSS:en för AdRaze kan slås på igen', (await vanta(async () => (await skalVar()) === '42px', 4000)) === true);
    await nod(B + '/forsta');
    R.ok('nödutgången fungerar även med fokus i en flik', (await vanta(async () => (await skalVar()) === '', 4000)) === true);
    R.ok('…och fliken laddades inte om', (await f1.kor('window.__fore')) === 1);

    // ── Inställningarna: listor, redigerare, högerklicksmenyn och skärmdumpar
    await satt('avancerat.skalcss', SKALCSS);
    await shell.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(1600);
    await shell.kor(VISA('#anp-avancerat'));
    await H.sov(300);
    const ui1 = await shell.kor(`(() => { const r = document.getElementById('anp-avancerat'); return { h3: [...r.querySelectorAll('h3')].map((h) => h.textContent), css: r.querySelectorAll('[data-lista="css"] .anp-rad').length, skript: r.querySelectorAll('[data-lista="skript"] .anp-rad').length, skal: r.querySelector('.anp-skal textarea').value, brytare: r.querySelector('.set-row:not(.anp-rad) .switch input').checked, varning: r.querySelector('.anp-varning').textContent, lostext: [...r.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent) }; })()`);
    R.ok('inställningarna ritar tre delar med listorna', ui1 && JSON.stringify(ui1.h3) === JSON.stringify(['Egen CSS för sajter', 'Egen CSS för AdRaze', 'Användarskript']) && ui1.css === 2 && ui1.skript === SKRIPT.length, ui1);
    R.ok('CSS för AdRaze visas med varningen och nödutgången', ui1 && ui1.skal === SKALCSS.css && ui1.brytare === true && /svåranvänt/.test(ui1.varning) && /Ctrl\+Shift\+Alt\+R/.test(ui1.varning.replace(/\s+/g, '')) && /--utan-skal-css/.test(ui1.varning), ui1 && ui1.varning);
    R.ok('ingen lös text (t.ex. "null") i delen', ui1 && ui1.lostext.length === 0, ui1 && ui1.lostext);
    await bild(shell, path.join(bilder, '2-installningar.png'));
    await shell.kor(VISA('#anp-avancerat h3:nth-of-type(3)'));
    await H.sov(300);
    await bild(shell, path.join(bilder, '2b-skriptlista.png'));
    // Ett skript med syntaxfel öppnas: felet och raden visas
    await shell.kor(`document.querySelector('#anp-avancerat .anp-rad[data-id="sG"] [data-gor="redigera"]').click(); 1`);
    const felrad = await vanta(async () => shell.kor(`(() => { const m = document.querySelector('#anp-avancerat .anp-red[data-red="skript"] .anp-medd[data-typ="fel"]:not([hidden])'); const f = document.querySelector('#anp-avancerat .anp-red .anp-kod-fel:not([hidden])'); return m && f ? m.textContent : ''; })()`), 4000);
    R.ok('skriptredigeraren visar syntaxfelet och raden', /rad 3/.test(String(felrad)), felrad);
    await shell.kor(VISA('#anp-avancerat .anp-red'));
    await H.sov(500);
    await bild(shell, path.join(bilder, '3-skriptredigerare.png'));
    R.ok('sajtfältet i skriptredigeraren är tre rader högt', (await shell.kor(`document.querySelector('#anp-avancerat .anp-red textarea[aria-label="Sajter"]').offsetHeight`)) < 110);
    // Huvudet i ett inklistrat skript fyller i fälten
    await shell.kor(`document.querySelector('#anp-avancerat .anp-red .anp-x').click(); document.querySelector('#anp-avancerat [data-ny="skript"]').click(); 1`);
    await H.sov(300);
    await shell.kor(`(() => { const ta = document.querySelector('#anp-avancerat .anp-red[data-red="skript"] .anp-kod-text'); ta.focus(); return 1; })()`);
    await shell.skicka('Input.insertText', { text: '// ==UserScript==\n// @name        Inklistrat\n// @match       *://*.exempel.se/*\n// @exclude     *://*.exempel.se/konto/*\n// @run-at      document-start\n// @noframes\n// @grant       GM_xmlhttpRequest\n// ==/UserScript==\nconsole.log(1);' });
    await H.sov(900);
    const huvud = await shell.kor(`(() => { const r = document.querySelector('#anp-avancerat .anp-red[data-red="skript"]'); return { namn: r.querySelector('input[aria-label="Namn"]').value, sajter: r.querySelector('textarea[aria-label="Sajter"]').value, tid: r.querySelector('.seg-btn.on').dataset.v, ramar: r.querySelector('.anp-val input').checked, varning: [...r.querySelectorAll('.anp-medd:not([hidden])')].map((m) => m.textContent).join(' ') }; })()`);
    R.ok('// ==UserScript== fyller i namn, sajter, tid och ramar', huvud && huvud.namn === 'Inklistrat' && huvud.sajter === '*://*.exempel.se/*\n!*://*.exempel.se/konto/*' && huvud.tid === 'document-start' && huvud.ramar === false, huvud);
    R.ok('saknade @grant ger en varning', huvud && /GM_xmlhttpRequest/.test(huvud.varning), huvud && huvud.varning);
    // Osparade ändringar: att öppna något annat stoppas tills man sparar eller avbryter
    await shell.kor(`document.querySelector('#anp-avancerat [data-ny="css"]').click(); 1`);
    const stopp = await shell.kor(`(() => { const r = document.querySelectorAll('#anp-avancerat .anp-red'); return r.length + ' ' + r[0].dataset.red + ' ' + r[0].querySelector('.anp-medd[data-typ="fel"]:not([hidden])')?.textContent; })()`);
    R.ok('osparade ändringar kastas inte i tysthet', /^1 skript Spara eller avbryt/.test(String(stopp)), stopp);
    await shell.kor(`(() => { const b = document.querySelectorAll('#anp-avancerat .anp-red .anp-knappar .set-btn')[1]; b.click(); b.click(); return 1; })()`);
    R.ok('Avbryt två gånger stänger redigeraren', (await shell.kor(`document.querySelectorAll('#anp-avancerat .anp-red').length`)) === 0);
    // Högerklicksmenyn på sidan: "Redigera CSS för den här sajten" öppnar regeln för sajten
    const meny = await M(`const v = av.menyval(wcFor(${JSON.stringify(B + '/forsta')})); if (v[0]) v[0].click(); return v.map((x) => x.label)`);
    R.ok('högerklicksmenyn har "Redigera CSS för den här sajten"', JSON.stringify(meny) === JSON.stringify(['Redigera CSS för den här sajten']), meny);
    const red = await vanta(async () => shell.kor(`(() => { const r = document.querySelector('#anp-avancerat .anp-red[data-red="css"]'); return r ? { vard: r.querySelector('.anp-sajtfalt input').value, rubrik: r.querySelector('.anp-red-topp b').textContent, kod: r.querySelector('.anp-kod-text').value, synlig: !document.getElementById('settings').classList.contains('hidden') } : null; })()`), 4000);
    R.ok('…och öppnar sajtens CSS-regel i inställningarna', red && red.vard === 'adraze-test.example' && red.rubrik === 'Redigera CSS' && red.kod === CSS_SAJT && red.synlig, red);
    // Kodfältet: Tab = två mellanslag, Enter behåller indraget, } drar ut
    await shell.kor(`(() => { const ta = document.querySelector('#anp-avancerat .anp-red .anp-kod-text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return 1; })()`);
    const tangent = async (key, code, kc, text) => { await shell.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc, text }); await shell.skicka('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc }); };
    await shell.skicka('Input.insertText', { text: '\nbody {' });
    await tangent('Enter', 'Enter', 13, '\r');
    await shell.skicka('Input.insertText', { text: 'margin: 0;' });
    await tangent('Enter', 'Enter', 13, '\r');
    await tangent('}', 'BracketRight', 221, '}');
    await tangent('Enter', 'Enter', 13, '\r');
    await tangent('Tab', 'Tab', 9);
    const kod = await shell.kor(`(() => { const r = document.querySelector('#anp-avancerat .anp-red'); return { v: r.querySelector('.anp-kod-text').value, nr: r.querySelector('.anp-kod-nr').textContent.trim().split('\\n').length, fokus: document.activeElement === r.querySelector('.anp-kod-text') }; })()`);
    R.ok('kodfältet: Enter drar in efter {, } drar ut, Tab ger två mellanslag och fokus stannar', kod && kod.v === CSS_SAJT + '\nbody {\n  margin: 0;\n}\n  ' && kod.fokus, kod && JSON.stringify(kod.v.slice(CSS_SAJT.length)));
    R.ok('kodfältet: radnumren följer texten', kod && kod.nr === kod.v.split('\n').length, kod && kod.nr);
    await shell.kor(VISA('#anp-avancerat .anp-red'));
    await H.sov(500);
    await bild(shell, path.join(bilder, '4-cssredigerare.png'));
    await shell.kor(`document.documentElement.dataset.theme = 'dark'; 1`);
    await H.sov(400);
    await bild(shell, path.join(bilder, '5-cssredigerare-mork.png'));
    await shell.kor(VISA('#anp-avancerat'));
    await H.sov(400);
    await bild(shell, path.join(bilder, '6-installningar-mork.png'));
    await shell.kor(`delete document.documentElement.dataset.theme; (() => { const b = document.querySelectorAll('#anp-avancerat .anp-red .anp-knappar .set-btn')[1]; b.click(); b.click(); })(); 1`);

    // ── Barnläge: inget gäller, inget kan ändras, flikar där skript har körts laddas om
    await f1.kor('window.__fore = 2');
    await shell.kor(`window.view.barnRegler({ last: false, blocklist: [], allows: [] }); 1`);
    const omBarn = await vanta(async () => (await f1.kor(`typeof window.__fore === 'undefined' && document.readyState === 'complete'`)) === true, 6000);
    await H.sov(500);
    const db = await data(f1);
    R.ok('barnläge: fliken där skript körts laddas om, utan skript', omBarn === true && db.aKor === undefined && db.bKor === undefined && db.allaKor === undefined, db);
    R.ok('barnläge: ingen egen CSS på sajten', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(20, 20, 20)', 3000)) === true && (await f1.kor('getComputedStyle(document.body).borderTopWidth')) === '0px');
    R.ok('barnläge: ingen egen CSS i skalet', (await vanta(async () => (await skalVar()) === '', 3000)) === true);
    const bs = await satt('avancerat.skript', []);
    R.ok('barnläge: skript och CSS går inte att ändra', bs && bs.ok === false && bs.error === 'barnlast' && (await satt('avancerat.skalcss', { pa: false, css: '' })).error === 'barnlast', bs);
    R.ok('barnläge: inget "Redigera CSS" i högerklicksmenyn', (await M(`return av.menyval(wcFor(${JSON.stringify(B + '/forsta')})).length`)) === 0);
    R.ok('barnläge: avancerat:skript ger inget', (await skriptFran(`wcFor(${JSON.stringify(B + '/forsta')})`, B + '/x', true)) === null);
    await shell.kor(`showSettingsCat('anpassa'); 1`);
    await shell.kor(VISA('#anp-avancerat'));
    await H.sov(500);
    R.ok('barnläge: inställningarna visar att det är avstängt', /Avstängt i barnläge/.test(await shell.kor(`document.querySelector('#anp-avancerat .anp-last')?.textContent || ''`)));
    await bild(shell, path.join(bilder, '7-barnlage.png'));
    await shell.kor(`createTab(${JSON.stringify(B + '/barn')}); 1`);
    const f7 = await flik(cdp, B + '/barn');
    const d7 = f7 ? await data(f7) : null;
    R.ok('barnläge: ny flik får inga skript och ingen CSS', !!d7 && d7.aKor === undefined && d7.bKor === undefined && (await stil(f7, 'prov2', 'color')) === 'rgb(20, 20, 20)', d7);
    await shell.kor(`window.view.barnRegler(null); 1`);
    R.ok('ur barnläge: CSS:en för AdRaze tillbaka', (await vanta(async () => (await skalVar()) === '42px', 4000)) === true);
    R.ok('ur barnläge: sajtens CSS tillbaka utan omladdning', (await vanta(async () => (await stil(f1, 'prov2', 'color')) === 'rgb(255, 0, 0)', 4000)) === true);
    await f1.skicka('Page.reload', {});
    await H.sov(600);
    await f1.kor(KLAR);
    R.ok('ur barnläge: skripten körs igen efter omladdning', (await vanta(async () => (await data(f1)).aKor === '1', 5000)) === true);
    await shell.kor(`showSettingsCat('anpassa'); 1`);
    R.ok('ur barnläge: inställningarna går att använda igen', (await shell.kor(`document.querySelectorAll('#anp-avancerat [data-lista="css"] .anp-rad').length`)) === 2);

    // ── Inkognitofönster (Ctrl+Shift+N): ingen CSS för AdRaze där, och inställningarna säger varför
    await M(`wcFor('file://').emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'N', code: 'KeyN', control: true, shift: true, alt: false, meta: false }); return 1`);
    const inkT = await H.mal(cdp, (t) => t.url.includes('shell.html?incognito=1'), 10000);
    R.ok('inkognitofönstret öppnades', !!inkT);
    if (inkT) {
      const ink = await H.anslut(inkT.webSocketDebuggerUrl);
      anslutningar.push(ink);
      await ink.skicka('Runtime.enable');
      await ink.kor(KLAR);
      await H.sov(1200);
      R.ok('inkognitofönster: ingen egen CSS för AdRaze', (await ink.kor(`getComputedStyle(document.documentElement).getPropertyValue('--anp-test').trim()`)) === '' && (await skalVar()) === '42px');
      await ink.kor(`(() => { const i = document.getElementById('hxintro'); if (i) { i.click(); i.remove(); } openSettings(); showSettingsCat('anpassa'); return 1; })()`);
      await H.sov(1500);
      await ink.kor(VISA('#anp-avancerat'));
      await H.sov(300);
      const not = await ink.kor(`document.querySelector('#anp-avancerat .anp-not-topp')?.textContent || ''`);
      R.ok('inkognitofönster: inställningarna säger att CSS och skript inte gäller här', /inkognitofönster/.test(not), not);
      await bild(ink, path.join(bilder, '8-inkognitofonster.png'));
      const inkFel = fel(ink);
      R.ok('inga JS-fel i inkognitofönstret', !inkFel.length, inkFel);
      await M(`const w = el.BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('shell.html?incognito=1')); if (w) w.destroy(); return 1`);
    }

    // Loggen och skalet efter körning 1
    const text = fs.readFileSync(logg, 'utf8');
    const nekade = text.split('\n').filter((r) => r.includes('[ipc] nekad'));
    R.ok('inga legitima IPC-kanaler nekade', nekade.every((r) => /evil\.example/.test(r)), nekade.filter((r) => !/evil\.example/.test(r)));
    R.ok('inga varningar från avancerat i loggen', !/\[avancerat\]/.test(text), text.split('\n').filter((r) => r.includes('[avancerat]')));
    const skalfel = fel(shell);
    R.ok('inga JS-fel i skalet', !skalfel.length, skalfel);
    await H.stang(p); p = null;
    for (const a of anslutningar.splice(0)) a.stang();

    /* ═════ Körning 2: start med --utan-skal-css ═════ */
    const k2r = await starta(['--utan-skal-css']);
    R.ok('--utan-skal-css: ingen egen CSS i skalet', (await k2r.shell.kor(`getComputedStyle(document.documentElement).getPropertyValue('--anp-test').trim()`)) === '');
    R.ok('--utan-skal-css: sparas som avstängd', (await k2r.shell.kor(`Anpassa.get('avancerat.skalcss').pa`)) === false);
    R.ok('--utan-skal-css: meddelande om varför', /--utan-skal-css/.test(await k2r.shell.kor(`document.getElementById('apptoast').textContent`)));
    await k2r.shell.kor(`createTab(${JSON.stringify(B + '/igen')}); 1`);
    const f8 = await flik(k2r.cdp, B + '/igen');
    const d8 = f8 ? await data(f8) : {};
    R.ok('efter omstart: skript och CSS för sajter gäller fortfarande', d8.aKor === '1' && d8.bKor === '1' && (await stil(f8, 'prov2', 'color')) === 'rgb(255, 0, 0)', d8);
    const skalfel2 = fel(k2r.shell);
    R.ok('inga JS-fel i skalet (körning 2)', !skalfel2.length, skalfel2);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    for (const a of anslutningar) a.stang();
    if (p) await H.stang(p);
    x.stoppa();
    server.close();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
    console.log('[info] skärmdumpar: ' + bilder);
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
