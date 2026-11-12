#!/usr/bin/env node
// Tar de riktiga skärmbilderna till sajtvideon "vikblad" ur en EGEN dold AdRaze-instans.
//
//   flock /home/mint/.cache/claude-arbete/tung.lock env LATT_MEM=3500M /home/mint/bin/latt node tagbilder.mjs [--utan-surf]
//
// En instans i tredubbel skala (som en högupplöst skärm):
//   1. förbereder skalet (engelska, egna genvägar, inget foto) och surfar till riktiga nyhetssajter,
//      så att startsidans räknare visar det instansen själv stoppat. Sajterna visas aldrig.
//   2. tar bilderna (ra/k1 … k8) och skriver ra/rapport.json.
// Allt händer i en egen Xvfb (aldrig på riktiga skärmen), CDP på 9571 och huvudprocessens inspektör på 9572.
// Playwright (playwright-core, connectOverCDP) styr fönstret och tar bilderna. Instansen stängs via sin PID.
// Ingenting i en bild ändras efteråt: beskarbilder.py bara beskär och skalar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startaInstans, sov, logg } from './verktyg/instans.mjs';

const HAR = path.dirname(fileURLToPath(import.meta.url));
const UT = path.join(HAR, 'ra');
const har = (n) => process.argv.includes('--' + n);
const flagga = (n, std) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : std; };
const PRE = flagga('prefix', '');
fs.mkdirSync(UT, { recursive: true });
const STD = [['tema.accent', '#ff4b1f', 'Accentfärg'], ['tema.lage', 'ljust', 'Ljust eller mörkt'], ['tema.horn', 'normal', 'Hörn'], ['tema.densitet', 'normal', 'Densitet'], ['flikar.lage', 'upptill', 'Flikarnas placering'], ['verktyg.placering', 'uppe', 'Verktygsfältets placering']];
const rapport = { tagen: new Date().toISOString(), bilder: {} };

// ───────── En enda instans, tredubbel skala ─────────
const I = await startaInstans({ bredd: 1620, hojd: 836, skala: Number(flagga('skala', 3)) });
let skal = I.skal;
const { M, hitta } = I;
const S = (fn, arg) => skal.evaluate(fn, arg);
const bild = async (namn, sida = skal, opt = {}) => { const f = path.join(UT, PRE + namn + '.png'); await sida.screenshot({ path: f, type: 'png', animations: 'disabled', ...opt }); rapport.bilder[namn] = new Date().toISOString(); logg('bild', PRE + namn); return f; };
const satt = async (par) => { for (const [k, v, e] of par) { const r = await S(([k, v, e]) => Anpassa.set(k, v, e), [k, v, e]); if (!r || !r.ok) logg('  FEL', k, JSON.stringify(r)); } };
// Adressfältet har markören i en ny flik (så startar AdRaze): då syns accentfärgen som en ring runt fältet.
const fokus = () => S(() => { const a = document.getElementById('address'); a.focus(); });

async function main() {
  // Engelska, ingen intro, egna genvägar, AdRaze Search som sökmotor (annars står ett annat företags namn i adressfältet),
  // inga förstagångsnotiser (flytterbjudandet nämner en annan webbläsare, och frågan om huvudwebbläsare får aldrig
  // besvaras härifrån).
  await S(() => {
    localStorage.setItem('adraze-lang', 'en');
    localStorage.setItem('adraze-hacker-intro-v3', '1');
    localStorage.setItem('skoll-engine', 'adraze');
    localStorage.setItem('skoll-shortcuts', JSON.stringify([{ label: 'AdRaze', url: 'https://adraze.app/en/' }, { label: 'Download', url: 'https://download.adraze.app/en/' }]));
    localStorage.setItem('adraze-utan-skoll', '1');
    localStorage.setItem('adraze-flytt-erbjuden', '1');
    localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 30 * 24 * 3600 * 1000));
  });
  await skal.reload({ waitUntil: 'load' });
  await sov(3000);
  skal = await hitta('shell.html');
  // Inget foto på startsidan: annars står fotografens namn där.
  logg('utan foto', JSON.stringify(await S(() => Anpassa.set('startsida.bakgrund', false, 'Bakgrundsbild på startsidan'))));
  await sov(1000);
  logg('språk', await S(() => document.documentElement.lang), 'sökmotor', await S(() => document.getElementById('search-engine').textContent), 'dpr', await S(() => devicePixelRatio), 'yta', await S(() => innerWidth + 'x' + innerHeight));

  // ── En riktig räknare: surfa till riktiga nyhetssajter. De visas aldrig, bara det instansen stoppade räknas.
  if (!har('utan-surf')) {
    const sajter = ['https://www.aftonbladet.se', 'https://www.expressen.se', 'https://www.theguardian.com/international', 'https://edition.cnn.com'];
    for (const u of sajter) {
      await S((u) => { window.__nyhet = createTab(u); }, u);
      await sov(15000);
      logg('surfade', u, 'räknare nu', await S(() => JSON.stringify(stats)));
      await S(() => { closeTab(window.__nyhet); });
      await sov(1200);
    }
  }
  // AdRaze egna sidor som flikar, så att flikraden och flikpanelen har något att visa (bara egna namn och ikoner)
  for (const u of ['https://adraze.app/en/', 'https://download.adraze.app/en/']) { await S((u) => { createTab(u); }, u); await sov(8000); }
  await S(() => { tabs.filter((t) => !t.url).forEach((t) => closeTab(t)); });
  await sov(800);
  await S(() => { createTab(null); });                                        // startsidan sist och aktiv
  await sov(2500);
  rapport.raknare = await S(() => JSON.parse(JSON.stringify(stats)));
  rapport.flikar = await S(() => tabs.map((t) => [t.title, t.url]));
  rapport.raknareIBild = await S(() => [document.getElementById('stat-blocked').textContent, document.getElementById('stat-band').textContent + ' ' + document.getElementById('stat-band-u').textContent, document.getElementById('stat-time').textContent + ' ' + document.getElementById('stat-time-u').textContent]);
  logg('räknare', JSON.stringify(rapport.raknare), 'i bild', JSON.stringify(rapport.raknareIBild), 'flikar', JSON.stringify(rapport.flikar));
  logg('synlig text:', await S(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)));

  // ── K1 till K5: samma fönster, fem utseenden (riktiga Anpassa-nycklar). Vänta in en ny minut så att klockan är densamma.
  // Hälsningen byts varje timme: börja inte så nära ett timslag att K1 och K7 hamnar på var sin sida.
  { const d = new Date(), tillTimme = 3600 - d.getMinutes() * 60 - d.getSeconds(); if (tillTimme < 100) { logg('väntar', tillTimme, 's på ny timme'); await sov(tillTimme * 1000 + 1500); await S(() => { greet(); }); } }
  const kvar = 60 - new Date().getSeconds(); if (kvar < 30) { logg('väntar', kvar, 's på ny minut'); await sov(kvar * 1000 + 400); }
  await satt(STD); await fokus(); await sov(1600);
  await bild('k1');
  await satt([['tema.accent', '#2f9e67', 'Accentfärg'], ['tema.horn', 'rund', 'Hörn'], ['tema.densitet', 'luftig', 'Densitet'], ['flikar.lage', 'vertikal', 'Flikarnas placering']]); await fokus(); await sov(1900);
  await bild('k2');
  await satt([['tema.accent', '#3b6fe0', 'Accentfärg'], ['tema.lage', 'morkt', 'Ljust eller mörkt'], ['tema.horn', 'normal', 'Hörn'], ['tema.densitet', 'normal', 'Densitet'], ['flikar.lage', 'upptill', 'Flikarnas placering']]); await fokus(); await sov(1900);
  await bild('k3');
  await satt([['tema.accent', '#e8a317', 'Accentfärg'], ['tema.lage', 'ljust', 'Ljust eller mörkt'], ['tema.horn', 'rund', 'Hörn'], ['flikar.lage', 'dolda', 'Flikarnas placering']]); await fokus(); await sov(1900);
  await bild('k4');
  await satt([['tema.accent', '#5f6b7a', 'Accentfärg'], ['tema.lage', 'morkt', 'Ljust eller mörkt'], ['tema.horn', 'kantig', 'Hörn'], ['tema.densitet', 'kompakt', 'Densitet'], ['flikar.lage', 'upptill', 'Flikarnas placering'], ['verktyg.placering', 'nere', 'Verktygsfältets placering']]); await fokus(); await sov(1900);
  await bild('k5');
  rapport.klocka15 = await S(() => document.getElementById('nt-clock').textContent); rapport.halsning = await S(() => document.getElementById('nt-greet').textContent);
  logg('klockan i K1 till K5', rapport.klocka15, 'hälsning', rapport.halsning);
  await satt(STD); await fokus(); await sov(1600);

  // ── Falk. AI-tjänstens svar ersätts i huvudprocessen (bygget har ingen Pro-inloggning), som i tools/test/falk-inst.js.
  //    Taggarna i svaret körs av den riktiga koden (ui/anpassa-falk.js → anpassa-falk.js), och fönstret byter utseende på riktigt.
  await M(`(() => { const el = process.mainModule.require('electron'); const h = el.ipcMain._invokeHandlers;
    globalThis.__sista = null; globalThis.__vanta = 9000;
    globalThis.__svar = 'Done. Dark, with the tabs on the side.\\n\\n[[gör:anpassa=tema.lage|morkt]] [[gör:anpassa=flikar.lage|vertikal]]';
    h.set('krypto:samtycke', async () => true);
    h.set('krypto:chat', (e, messages) => { globalThis.__sista = messages; return new Promise((r) => setTimeout(() => r({ ok: true, reply: globalThis.__svar }), globalThis.__vanta)); }); return 1; })()`);
  await S(() => { const t = document.querySelector('#tgl-falk-tankord'); if (t && t.checked) t.click(); });   // Inställningar › Falk › Tänkord av: då står det bara att Falk tänker
  // Pro-konto utan namn (adressen börjar med en siffra: då skrivs inget namn i hälsningen)
  await S(() => { account = { email: '1@adraze.test', token: 't', pro: true, name: '' }; openKrypto(true); });
  const falk = await hitta('/ui/krypto.html', 15000);
  if (!falk) throw new Error('Falk-panelen öppnades inte');
  await sov(3000);
  logg('falk yta', await falk.evaluate(() => innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio));
  await bild('k6a', falk);
  await falk.focus('#inp');
  const ord = ['make', ' it', ' dark,', ' tabs', ' on', ' the', ' side'];
  for (let i = 0; i < ord.length; i++) { await falk.keyboard.type(ord[i], { delay: 45 }); await sov(250); await bild('k6b' + (i + 1), falk); }
  rapport.skrivet = await falk.evaluate(() => document.getElementById('inp').value);
  const fore = await S(() => [Anpassa.get('tema.lage'), Anpassa.get('flikar.lage')]);
  await falk.keyboard.press('Enter');
  await sov(1500);
  await bild('k6c', falk);
  rapport.tillTjansten = JSON.parse(String(await M('JSON.stringify((globalThis.__sista || []).slice(-1))')));
  rapport.tanker = await falk.evaluate(() => [(document.querySelector('.msg.typing .tt') || {}).textContent || '', document.getElementById('convtitle') ? document.getElementById('convtitle').textContent : '']);
  logg('skickat:', JSON.stringify(rapport.tillTjansten), 'före svaret:', JSON.stringify(fore), 'panelen:', JSON.stringify(rapport.tanker));
  for (let i = 0; i < 40; i++) { await sov(500); if ((await S(() => Anpassa.get('flikar.lage'))) === 'vertikal') break; }
  await sov(2500);
  const efter = await S(() => [Anpassa.get('tema.lage'), Anpassa.get('flikar.lage')]);
  rapport.falk = { fore, efter, bytte: efter[0] === 'morkt' && efter[1] === 'vertikal' && fore[0] === 'ljust' && fore[1] === 'upptill' };
  logg('efter svaret:', JSON.stringify(efter), rapport.falk.bytte ? 'FALK BYTTE UTSEENDET PÅ RIKTIGT' : 'INGET BYTE');
  await bild('k6d', falk);                                                     // bara översta remsan används (raderna om vad Falk ändrat är på svenska)
  rapport.falkEfter = (await falk.evaluate(() => document.getElementById('log').innerText)).replace(/\s+/g, ' ').slice(0, 300);
  await S(() => { openKrypto(false); });
  await sov(1500); await fokus(); await sov(900);
  await bild('k7');
  rapport.klocka7 = await S(() => document.getElementById('nt-clock').textContent);
  logg('klockan i K7', rapport.klocka7, 'hälsning', await S(() => document.getElementById('nt-greet').textContent));

  // ── K8: Familj, i standardutseendet
  await satt(STD); await sov(1500);
  await S(() => { openFamily(); });
  await sov(2500);
  await bild('k8');
  const panel = skal.locator('.set-panel[data-cat="familj"]');
  rapport.familj = { ruta: await panel.boundingBox(), text: (await panel.innerText()).replace(/\s+/g, ' ') };
  rapport.familj.rad = await S(() => { const r = document.querySelector('.set-panel[data-cat="familj"] .fam-open').getBoundingClientRect(); const s = document.querySelector('.set-panel[data-cat="familj"] .fam-open span').getBoundingClientRect(); const h = document.querySelector('.set-panel[data-cat="familj"] .set-h').getBoundingClientRect(); const b = document.getElementById('fam-body').getBoundingClientRect(); return { rad: [r.x, r.y, r.width, r.height], text: [s.x, s.y, s.width, s.height], rubrik: [h.x, h.y, h.width, h.height], kort: [b.x, b.y, b.width, b.height] }; });
  logg('familj', JSON.stringify(rapport.familj));
  await S(() => { closeSettings(); });
  fs.writeFileSync(path.join(UT, PRE + 'rapport.json'), JSON.stringify(rapport, null, 1));
  logg('klart');
}

main().then(() => I.stang(), async (e) => { console.error('FEL:', e && e.stack || e); try { console.error(fs.readFileSync(path.join(I.profil, 'logg.txt'), 'utf8').slice(-2500)); } catch {} await I.stang(); process.exit(1); });
