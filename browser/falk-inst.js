// Falks egna inställningar (Inställningar › Falk): stäng av Falk helt, och välj hur panelen ser ut och svarar.
// Värdena ligger i Anpassa-butiken (falk.*) så att de går att ångra, följer med i ångra-panelen och syns direkt i
// alla fönster. Fönstrets sida finns i ui/falk-inst.js, panelens i ui/krypto.html (window.falkInst).
//
//   falk.av       – Falk helt avstängd: ingen knapp, ingen panel, inget kortkommando, och huvudprocessen vägrar
//                   skicka något till AI-tjänsten (main.js frågar av() i varje krypto:*-kanal)
//   falk.accent   – panelens färg (knappar, länkar, markeringar)
//   falk.bredd    – sidopanelens bredd
//   falk.text     – textstorleken i samtalet
//   falk.svar     – hur långa svar Falk ger (läggs i Falks instruktioner)
//   falk.halsning – "Hej, namn" på tom panel
//   falk.tankord  – de växlande orden medan Falk tänker ("Spanar", "Grubblar" …)
const { ipcMain } = require('electron');

const BREDD = { smal: 340, normal: 400, bred: 480 };
const NYCKLAR = [
  { nyckel: 'falk.av', standard: false, etikett: 'Stäng av Falk helt', barnLast: true },
  { nyckel: 'falk.accent', standard: '#ff4b1f', etikett: 'Falks färg' },
  { nyckel: 'falk.bredd', standard: 'normal', etikett: 'Falk-panelens bredd', val: ['smal', 'normal', 'bred'] },
  { nyckel: 'falk.text', standard: 'normal', etikett: 'Textstorlek i Falk', val: ['liten', 'normal', 'stor'] },
  { nyckel: 'falk.svar', standard: 'normal', etikett: 'Hur långa svar Falk ger', val: ['kort', 'normal', 'utforlig'] },
  { nyckel: 'falk.halsning', standard: true, etikett: 'Falks hälsning' },
  { nyckel: 'falk.tankord', standard: true, etikett: 'Tänkord medan Falk tänker' },
];

let anp = null;
const av = () => !!anp && anp.hamta('falk.av') === true;
const bredd = () => BREDD[anp && anp.hamta('falk.bredd')] || BREDD.normal;
// Det panelen behöver (aldrig hela butiken: egen CSS och skript ska inte dit)
function varden() {
  const v = (n) => anp.hamta('falk.' + n);
  const farg = /^#[0-9a-f]{6}$/i.test(String(v('accent'))) ? String(v('accent')).toLowerCase() : '#ff4b1f';
  const en = (x, lista, std) => (lista.includes(x) ? x : std);
  return { av: av(), accent: farg, text: en(v('text'), ['liten', 'normal', 'stor'], 'normal'), svar: en(v('svar'), ['kort', 'normal', 'utforlig'], 'normal'),
    halsning: v('halsning') !== false, tankord: v('tankord') !== false };
}

// wins: skalets webContents-id → ctx · applyBounds(ctx) · stang(ctx): stänger och river Falk-panelen i fönstret
function init({ anpassa, wins, applyBounds, stang }) {
  anp = anpassa;
  for (const n of NYCKLAR) anp.registrera({ barnLast: false, importBar: true, ...n });
  ipcMain.on('falk-inst:alla', (e) => { e.returnValue = varden(); });
  anp.lyssna((nyckel) => {
    if (!String(nyckel).startsWith('falk.')) return;
    const v = varden();
    wins.forEach((ctx) => {
      try {
        if (nyckel === 'falk.av' && v.av) { stang(ctx); return; }
        if (ctx.kryptoView && !ctx.kryptoView.webContents.isDestroyed()) ctx.kryptoView.webContents.send('falk-inst:andrad', v);
        if (nyckel === 'falk.bredd') applyBounds(ctx);
      } catch {}
    });
  });
}

module.exports = { init, av, bredd, varden, NYCKLAR, BREDD };
