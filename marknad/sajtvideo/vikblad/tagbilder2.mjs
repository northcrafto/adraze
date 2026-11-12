#!/usr/bin/env node
// Andra omgången skärmbilder till "vikblad": nya utseenden 4 och 5, så att alla fem skiljer sig även i telefonstorlek.
// Samma upplägg som tagbilder.mjs: EN egen dold instans (Xvfb, CDP 9571, inspektör 9572), tredubbel skala, Playwright.
//
//   flock /home/mint/.cache/claude-arbete/tung.lock env LATT_MEM=3500M /home/mint/bin/latt node tagbilder2.mjs [--ut=<mapp>]
//
// Klockan och hälsningen är avslagna i de nya bilderna (startsida.halsning), och i bild 5 även statistiken
// (startsida.statistik). Annars skulle klockan visa en annan tid än i bild 1 till 3 (tagna 09:05) och räknaren
// ett annat tal än 47. Båda är riktiga val i Anpassa. Inget i bilderna ändras efteråt: beskarbilder.py bara beskär.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startaInstans, sov, logg } from './verktyg/instans.mjs';

const HAR = path.dirname(fileURLToPath(import.meta.url));
const flagga = (n, std) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : std; };
const UT = flagga('ut', path.join(HAR, 'ra'));
fs.mkdirSync(UT, { recursive: true });
const STD = [['tema.accent', '#ff4b1f', 'Accentfärg'], ['tema.lage', 'ljust', 'Ljust eller mörkt'], ['tema.horn', 'normal', 'Hörn'], ['tema.densitet', 'normal', 'Densitet'],
  ['tema.palett', 'standard', 'Färguppsättning'], ['tema.typsnitt', 'system', 'Typsnitt'], ['flikar.lage', 'upptill', 'Flikarnas placering'], ['verktyg.placering', 'uppe', 'Verktygsfältets placering'],
  ['startsida.halsning', true, 'Klocka och hälsning'], ['startsida.logga', false, 'Logga på startsidan'], ['startsida.statistik', true, 'Statistik längst ned']];
const rapport = { tagen: new Date().toISOString(), bilder: {}, satt: {} };

const I = await startaInstans({ bredd: 1620, hojd: 836, skala: 3 });
let skal = I.skal;
const { hitta } = I;
const S = (fn, arg) => skal.evaluate(fn, arg);
const bild = async (namn) => { const f = path.join(UT, namn + '.png'); await skal.screenshot({ path: f, type: 'png', animations: 'disabled' }); rapport.bilder[namn] = new Date().toISOString(); logg('bild', f); return f; };
const satt = async (par) => { for (const [k, v, e] of par) { const r = await S(([k, v, e]) => Anpassa.set(k, v, e), [k, v, e]); if (!r || !r.ok) logg('  FEL', k, JSON.stringify(r)); } };
const fokus = () => S(() => { document.getElementById('address').focus(); });
const las = () => S(() => { const g = (k) => Anpassa.get(k); return { lage: g('tema.lage'), accent: g('tema.accent'), palett: g('tema.palett'), typsnitt: g('tema.typsnitt'), flikar: g('flikar.lage'), verktyg: g('verktyg.placering'), halsning: g('startsida.halsning'), logga: g('startsida.logga'), statistik: g('startsida.statistik') }; });
const variant = async (namn, par) => { await satt(STD); await sov(600); await satt(par); await fokus(); await sov(2000); rapport.satt[namn] = await las(); await bild(namn); logg(namn, JSON.stringify(rapport.satt[namn]), 'synligt:', await S(() => document.getElementById('newtabpage').innerText.replace(/\s+/g, ' ').slice(0, 160))); };

async function main() {
  // Som tagbilder.mjs: engelska, ingen intro, egna genvägar, AdRaze Search, inga förstagångsnotiser
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
  logg('utan foto', JSON.stringify(await S(() => Anpassa.set('startsida.bakgrund', false, 'Bakgrundsbild på startsidan'))));
  await sov(800);
  // Samma flikar som i första omgången: AdRaze egna sidor och en ny flik sist
  for (const u of ['https://adraze.app/en/', 'https://download.adraze.app/en/']) { await S((u) => { createTab(u); }, u); await sov(8000); }
  await S(() => { tabs.filter((t) => !t.url).forEach((t) => closeTab(t)); });
  await sov(800);
  await S(() => { createTab(null); });
  await sov(2500);
  rapport.flikar = await S(() => tabs.map((t) => [t.title, t.url]));
  logg('flikar', JSON.stringify(rapport.flikar));

  const UTAN_KLOCKA = [['startsida.halsning', false, 'Klocka och hälsning']];
  // Utseende 4: Sand, dolda flikar, loggan på startsidan i stället för klockan
  await variant('k4n-a', [['tema.accent', '#e8a317', 'Accentfärg'], ['tema.horn', 'rund', 'Hörn'], ['flikar.lage', 'dolda', 'Flikarnas placering'], ...UTAN_KLOCKA, ['startsida.logga', true, 'Logga på startsidan']]);
  await variant('k4n-b', [['tema.accent', '#e8a317', 'Accentfärg'], ['tema.horn', 'rund', 'Hörn'], ['flikar.lage', 'dolda', 'Flikarnas placering'], ...UTAN_KLOCKA, ['startsida.logga', true, 'Logga på startsidan'], ['tema.typsnitt', 'mono', 'Typsnitt']]);
  // Utseende 5: verktygsraden nere, mörkt, utan klocka och statistik
  const NERE = [['verktyg.placering', 'nere', 'Verktygsfältets placering'], ...UTAN_KLOCKA, ['startsida.statistik', false, 'Statistik längst ned']];
  await variant('k5n-a', [['tema.accent', '#5f6b7a', 'Accentfärg'], ['tema.lage', 'morkt', 'Ljust eller mörkt'], ['tema.horn', 'kantig', 'Hörn'], ['tema.densitet', 'kompakt', 'Densitet'], ...NERE, ['startsida.logga', true, 'Logga på startsidan']]);
  await variant('k5n-b', [['tema.accent', '#d9a441', 'Accentfärg'], ['tema.lage', 'morkt', 'Ljust eller mörkt'], ['tema.palett', 'jul', 'Färguppsättning'], ...NERE, ['startsida.logga', true, 'Logga på startsidan']]);
  await variant('k5n-c', [['tema.accent', '#0b8a8f', 'Accentfärg'], ['tema.lage', 'morkt', 'Ljust eller mörkt'], ['tema.horn', 'rund', 'Hörn'], ...NERE, ['tema.typsnitt', 'mono', 'Typsnitt'], ['startsida.logga', true, 'Logga på startsidan']]);
  await satt(STD);
  fs.writeFileSync(path.join(UT, 'rapport2.json'), JSON.stringify(rapport, null, 1));
  logg('klart');
}

main().then(() => I.stang(), async (e) => { console.error('FEL:', e && e.stack || e); try { console.error(fs.readFileSync(path.join(I.profil, 'logg.txt'), 'utf8').slice(-2500)); } catch {} await I.stang(); process.exit(1); });
