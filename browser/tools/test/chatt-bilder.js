#!/usr/bin/env node
// Tar bilder av chatten med låtsaskonton (panel + helskärm, ljust + mörkt) för att granska utseendet.
// Egen kopia av adraze-api med tom databas, dolda AdRaze-instanser. Rör inga riktiga konton.
// Användning: node tools/test/chatt-bilder.js <mapp för bilderna> [webbläsarmapp]
const fs = require('fs');
const path = require('path');
const H = require('./hjalp');
const M = require('./chatt-miljo');

(async () => {
  const ut = path.resolve(process.argv[2] || 'chatt-bilder'), rot = path.resolve(process.argv[3] || path.join(__dirname, '..', '..'));
  fs.mkdirSync(ut, { recursive: true });
  const srv = await M.startaServer(rot);
  const xa = await H.startaXvfb(), xb = await H.startaXvfb();
  let a, b;
  try {
    const KA = srv.nyAnvandare('alva@example.com', 'Alva'), KB = srv.nyAnvandare('bosse@example.com', 'Bosse'), KC = srv.nyAnvandare('cilla@example.com', 'Cilla');
    a = await M.startaInstans(rot, xa, 'a', srv.bas, [], 9641); await a.loggaIn(KA); await M.skapaProfil(a, 'Alva');
    b = await M.startaInstans(rot, xb, 'b', srv.bas, [], 9642); await b.loggaIn(KB); await M.skapaProfil(b, 'Bosse');
    await srv.api(KA, 'POST', '/chatt/contacts/request', { username: 'Bosse' });
    await srv.api(KB, 'POST', '/chatt/contacts/accept', { username: 'Alva' });
    for (const i of [a, b]) { await i.C(`refreshContacts(); 1`); await i.vanta(`contactsCache.length === 1`); await i.C(`openContact(contactsCache[0]); 1`); }
    await H.sov(800);
    const sag = async (i, text) => { await i.C(`chatInput.value = ${JSON.stringify(text)}; sendMessage(); 1`); await H.sov(700); };
    await sag(b, 'Tja! Har du testat nya AdRaze än?');
    await sag(a, 'Japp, sitter i den nu');
    await sag(a, 'Inte en enda annons på Aftonbladet 😄');
    await sag(b, 'Haha nice. Ska vi ta en fika i morgon och gå igenom sajten? Jag har några idéer om startsidan som jag vill visa innan vi släpper nästa version.');
    await sag(a, 'Absolut, 10 på det vanliga stället?');
    await sag(b, 'Perfekt 👍');
    await H.sov(1500);
    for (const tema of ['light', 'dark']) {
      await a.C(`setTheme(${JSON.stringify(tema)}); 1`); await H.sov(400);
      await a.C(`setFull(false); 1`); await H.sov(700); await a.bild(path.join(ut, `panel-${tema}.png`));
      await a.C(`setFull(true); 1`); await H.sov(900); await a.bild(path.join(ut, `full-${tema}.png`));
      await a.C(`chatInput.value = 'Jag tar med datorn'; chatInput.dispatchEvent(new Event('input')); 1`); await H.sov(300); await a.bild(path.join(ut, `full-${tema}-skriver.png`));
      await a.C(`chatInput.value = ''; chatInput.dispatchEvent(new Event('input')); closeChat(); 1`); await H.sov(500); await a.bild(path.join(ut, `full-${tema}-lista.png`));
      await a.C(`openContact(contactsCache[0]); 1`); await H.sov(900);
    }
    console.log('bilder i', ut, fs.readdirSync(ut).join(' '));
  } catch (e) { console.error('FEL', e.message); process.exitCode = 1; }
  finally { for (const i of [a, b]) if (i) { try { process.kill(i.p.pid, 'SIGTERM'); } catch {} } srv.stang(); await H.sov(800); for (const x of [xa, xb]) x.stoppa(); setTimeout(() => process.exit(), 300); }
})();
