#!/usr/bin/env node
// Chatten: online-prick, nya bubblan, reaktioner (båda hållen + väljaren), röstsamtal (ringer, svara, ljud kommer
// fram, lägg på, liten ruta över webbsidan, missat samtal med rad och loggat mejl) och skärmdelning av en flik
// (sändaren och tittaren får bild). Två dolda AdRaze-instanser i var sin Xvfb med låtsas-mikrofon/kamera, mot en
// egen kopia av adraze-api med tom temp-databas (mejl loggas, skickas aldrig). Rör inga riktiga konton.
// Användning: node tools/test/chatt.js [webbläsarmapp]   (avslutar med 0 om allt gick igenom)
//   ADRAZE_TEST_BILDER = mapp att spara skärmdumpar i (valfritt, t.ex. chatt-bilder)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const H = require('./hjalp');
const M = require('./chatt-miljo');

const BILDER = process.env.ADRAZE_TEST_BILDER || '';
const MEDIA = ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

async function kor(rot) {
  const R = H.resultat();
  if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
  const srv = await M.startaServer(rot);
  const xa = await H.startaXvfb(), xb = await H.startaXvfb();
  // En färgglad sida att visa i skärmdelningen
  const sida = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>Semesterplanering</title><body style="margin:0;font:48px sans-serif;background:linear-gradient(135deg,#ff7a45,#5b6cff);color:#fff;display:grid;place-items:center;height:100vh"><div><b>Semesterplanering</b><p style="font-size:24px">Stockholm → Lissabon, 12–19 juli</p></div>'); });
  await new Promise((ok) => sida.listen(0, '127.0.0.1', ok));
  const sidaUrl = 'http://127.0.0.1:' + sida.address().port + '/';
  let a, b;
  const bild = async (i, namn) => { if (BILDER) await i.bild(path.join(BILDER, namn + '.png')); };
  const skarm = (x, namn) => { if (!BILDER) return; try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1600x1000', '-i', x.display, '-frames:v', '1', path.join(BILDER, namn + '.png')], { stdio: 'ignore' }); } catch {} };
  try {
    const KA = srv.nyAnvandare('alva@example.com', 'Alva'), KB = srv.nyAnvandare('bosse@example.com', 'Bosse');
    a = await M.startaInstans(rot, xa, 'a', srv.bas, MEDIA, 9581); await a.loggaIn(KA); await M.skapaProfil(a, 'Alva');
    b = await M.startaInstans(rot, xb, 'b', srv.bas, MEDIA, 9582); await b.loggaIn(KB); await M.skapaProfil(b, 'Bosse');
    for (const i of [a, b]) await i.s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });
    await srv.api(KA, 'POST', '/chatt/contacts/request', { username: 'Bosse' });
    await srv.api(KB, 'POST', '/chatt/contacts/accept', { username: 'Alva' });
    for (const i of [a, b]) { await i.C(`refreshContacts(); 1`); await i.vanta(`contactsCache.length === 1`); }

    // ===== Online-prick =====
    await a.C(`refreshContacts(); 1`); await H.sov(800);
    R.ok('online: Bosse syns som online i listan', await a.vanta(`document.querySelector('#contacts-list .pres.on')`, 8000));
    await a.C(`openContact(contactsCache[0]); 1`); await H.sov(600);
    R.ok('online: chatthuvudet säger Online', await a.vanta(`document.getElementById('peer-sub').textContent.trim() === 'Online'`, 5000), await a.C(`document.getElementById('peer-sub').textContent`));
    await bild(a, 'online-prick');
    // Bosse döljer sin status: då syns ingen prick (och han ser inte Alvas heller)
    R.ok('online: dölj status sparas', (await srv.api(KB, 'POST', '/chatt/users/privacy', { presence: false })).s === 200);
    await a.C(`refreshContacts(); 1`);
    R.ok('online: dold status = ingen grön prick', await a.vanta(`!document.querySelector('#contacts-list .pres.on')`, 6000));
    const kb = await srv.api(KB, 'GET', '/chatt/contacts');
    R.ok('online: den som döljer ser inte andras status', kb.j && kb.j.contacts && kb.j.contacts[0] && kb.j.contacts[0].online == null, kb.j && kb.j.contacts && kb.j.contacts[0]);
    await srv.api(KB, 'POST', '/chatt/users/privacy', { presence: true });
    await a.C(`refreshContacts(); 1`); await a.vanta(`document.querySelector('#contacts-list .pres.on')`, 6000);

    // ===== Meddelanden och reaktioner =====
    await a.C(`setFull(true); 1`); await b.C(`setFull(true); openContact(contactsCache[0]); 1`); await H.sov(800);
    const send = async (i, t) => { await i.C(`chatInput.value = ${JSON.stringify(t)}; sendMessage(); 1`); await H.sov(600); };
    await send(a, 'Ska vi ses på fredag?');
    await send(b, 'Ja! Efter jobbet funkar');
    await send(b, 'Jag tar med kaffe');
    await H.sov(4000);
    const sista = (i) => i.J(`(() => { const ids = Object.keys(msgMeta).map(Number).sort((x, y) => x - y); return ids[ids.length - 1]; })()`);
    const mid = await sista(a);
    R.ok('meddelanden: kom fram', mid > 0 && await b.vanta(`msgMeta[${mid}]`, 8000));
    await a.C(`rxToggle(${mid}, '👍'); 1`);
    await b.C(`rxToggle(${mid}, '❤️'); 1`); await H.sov(300);
    await b.C(`rxToggle(${mid}, '👍'); 1`);
    const chips = (i) => i.J(`[...document.querySelectorAll('.rx-row[data-for="${mid}"] .rx-chip:not(.rx-add)')].map((c) => c.querySelector('.rx-e').textContent + c.querySelector('.rx-n').textContent + (c.classList.contains('mine') ? '*' : ''))`);
    await a.C(`pollMessages(true); 1`); await b.C(`pollMessages(true); 1`);
    const okA = await a.vanta(`(() => { const c = [...document.querySelectorAll('.rx-row[data-for="${mid}"] .rx-chip:not(.rx-add)')].map((c) => c.textContent).join(); return c.includes('👍2') && c.includes('❤️1'); })()`, 12000);
    R.ok('reaktioner: Alva ser 👍2 och ❤️1', okA, await chips(a));
    const okB = await b.vanta(`(() => { const c = [...document.querySelectorAll('.rx-row[data-for="${mid}"] .rx-chip:not(.rx-add)')].map((c) => c.textContent).join(); return c.includes('👍2') && c.includes('❤️1'); })()`, 12000);
    R.ok('reaktioner: Bosse ser 👍2 och ❤️1', okB, await chips(b));
    R.ok('reaktioner: mina är markerade', (await chips(a)).some((c) => c.startsWith('👍') && c.endsWith('*')));
    // Reaktionsposterna syns inte som egna bubblor
    R.ok('reaktioner: inga extra bubblor', await a.J(`document.querySelectorAll('#chat-body .bubble').length`) === 3, await a.J(`document.querySelectorAll('#chat-body .bubble').length`));
    // Hos någon som inte har nya chatten blir de vanliga meddelanden med text (fallback): kolla posten
    await H.sov(500);
    await bild(a, 'reaktioner');
    await bild(b, 'reaktioner-b');
    // Ta bort: Alva klickar på sin 👍 → Bosse ser 👍1
    await a.C(`rxToggle(${mid}, '👍'); 1`);
    await b.C(`pollMessages(true); 1`);
    R.ok('reaktioner: ta bort syns hos den andra', await b.vanta(`[...document.querySelectorAll('.rx-row[data-for="${mid}"] .rx-chip:not(.rx-add)')].map((c) => c.textContent).join().includes('👍1')`, 12000), await chips(b));
    // Verktygsraden vid hovring
    await a.C(`(() => { const b = document.querySelector('.bubble[data-id="${mid}"]'); b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return 1; })()`); await H.sov(400);
    R.ok('reaktioner: verktygsraden vid hovring', await a.C(`document.getElementById('msg-tools').classList.contains('open')`) === true);
    await bild(a, 'reaktioner-hovring');
    await a.C(`mtGom(true); 1`);
    // Emojiväljaren: från textrutan, sök, välj
    await a.C(`document.getElementById('chat-emoji').click(); 1`); await H.sov(400);
    R.ok('väljare: öppnas från textrutan', await a.C(`document.getElementById('emoji-pick').classList.contains('open')`) === true);
    R.ok('väljare: har många emojis', await a.J(`document.querySelectorAll('#emoji-pick .ep-e').length`) > 50, await a.J(`document.querySelectorAll('#emoji-pick .ep-e').length`));
    await bild(a, 'emoji-valjare');
    await a.C(`(() => { const s = document.querySelector('#emoji-pick input'); s.value = 'pizza'; s.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await H.sov(300);
    R.ok('väljare: sök "pizza" hittar 🍕', await a.C(`[...document.querySelectorAll('#emoji-pick .ep-e')].some((e) => e.textContent === '🍕')`) === true);
    await a.C(`[...document.querySelectorAll('#emoji-pick .ep-e')].find((e) => e.textContent === '🍕').click(); 1`); await H.sov(200);
    R.ok('väljare: emojin hamnar i textrutan', (await a.C(`chatInput.value`)).includes('🍕'), await a.C(`chatInput.value`));
    await a.C(`chatInput.value = ''; closeEmojiPick(); 1`);

    // ===== Röstsamtal =====
    await a.C(`ring(contactsCache[0]); 1`);
    R.ok('samtal: Bosse får ringsignalen', await b.vanta(`samtal && samtal.fas === 'ringer' && !samtal.ut && !document.getElementById('call-ov').hidden`, 15000));
    await H.sov(600);
    await bild(b, 'samtal-ringer');
    await bild(a, 'samtal-ringer-ut');
    await b.C(`svara(); 1`);
    const pagar = (await a.vanta(`samtal && samtal.fas === 'pagar'`, 20000)) && (await b.vanta(`samtal && samtal.fas === 'pagar'`, 10000));
    R.ok('samtal: kopplas upp hos båda', pagar, [await a.J(`samtal && samtal.fas`), await b.J(`samtal && samtal.fas`)]);
    await H.sov(3500);
    const nA = await a.J(`window.__samtal.niva()`), nB = await b.J(`window.__samtal.niva()`);
    R.ok('samtal: ljud kommer fram till Bosse', nB && nB.max > 0.01, nB);
    R.ok('samtal: ljud kommer fram till Alva', nA && nA.max > 0.01, nA);
    await bild(a, 'samtal-pagar');
    // Bosse stänger chatten: samtalet blir en liten ruta över webbsidan
    await b.K(`openChatt(false); 1`); await H.sov(1200);
    R.ok('samtal: liten ruta när chatten stängs', await b.C(`document.documentElement.classList.contains('mini') && !document.getElementById('mini').hidden`) === true);
    skarm(xb, 'samtal-mini');
    if (BILDER) await b.bild(path.join(BILDER, 'samtal-mini-ruta.png'));
    // Minimera samtalet hos Alva: remsan överst
    await a.C(`document.getElementById('co-min').click(); 1`); await H.sov(500);
    R.ok('samtal: minimerat = remsa överst', await a.C(`!document.getElementById('call-strip').hidden`) === true);
    await bild(a, 'samtal-remsa');
    await a.C(`avsluta('klart'); 1`);
    R.ok('samtal: Bosse märker att Alva lade på', await b.vanta(`!samtal`, 10000));
    R.ok('samtal: rutan försvinner', await b.vanta(`!document.documentElement.classList.contains('mini')`, 4000));
    await a.C(`pollMessages(true); 1`);
    R.ok('samtal: rad "Röstsamtal · …" i konversationen', await a.vanta(`[...document.querySelectorAll('#chat-body .call-row')].some((r) => /Röstsamtal ·/.test(r.textContent))`, 8000),
      await a.J(`[...document.querySelectorAll('#chat-body .call-row')].map((r) => r.textContent)`));

    // Olästa-siffran i skalet (röda pricken på chattknappen) efter en omräkning i Bosses chatt
    const bOlast = async (villkor, ms = 15000) => { for (let i = 0; i < ms / 600; i++) { await b.C(`refreshContacts().then(() => 1)`); if (await b.K(`(${villkor})(chattUnread)`) === true) return true; await H.sov(600); } return false; };
    const bNotiser = () => b.J(`window.__notiser.slice()`);
    // ===== Missat samtal (chatten stängd hos Bosse) =====
    await H.sov(1500);
    await a.C(`ring(contactsCache[0]); 1`);
    R.ok('missat: ringrutan över webbsidan', await b.vanta(`samtal && samtal.fas === 'ringer' && document.documentElement.classList.contains('mini') && document.querySelector('#mini.ring')`, 15000));
    await H.sov(800);
    skarm(xb, 'samtal-mini-ringer');
    if (BILDER) await b.bild(path.join(BILDER, 'samtal-mini-ringer-ruta.png'));
    R.ok('missat: Alvas klient ger upp efter ~30 s', await a.vanta(`!samtal`, 40000));
    R.ok('missat: ringningen slutar hos Bosse', await b.vanta(`!samtal`, 10000));
    R.ok('missat: mejlet loggat (inte skickat)', /\[mejl loggat\] bosse@example\.com Alva försökte ringa dig i AdRaze/.test(srv.logg()), srv.logg().split('\n').filter((r) => r.includes('mejl')).slice(-3));
    // Samtalets signaler (svar, avslut, ringningen) räknas inte, det missade samtalet räknas som ett oläst och ger notis
    R.ok('olästa: missat samtal = 1 oläst (signalerna räknas inte)', await bOlast('(n) => n === 1'), await b.K(`chattUnread`));
    R.ok('olästa: notis om missat samtal', (await bNotiser()).some((t) => t === 'Missat samtal från Alva'), await bNotiser());
    const ovB = await srv.api(KB, 'GET', '/chatt/messages/overview');
    R.ok('olästa: inledande signalposter markerade som lästa på servern', ovB.j.unread[0] && ovB.j.unread[0].n === 1, ovB.j);
    await b.K(`openChatt(true); 1`); await H.sov(800);
    await b.C(`pollMessages(true); 1`);
    R.ok('missat: raden "Missat samtal" med Ring tillbaka', await b.vanta(`[...document.querySelectorAll('#chat-body .call-row.missat')].some((r) => r.querySelector('.sr-btn'))`, 10000),
      await b.J(`[...document.querySelectorAll('#chat-body .call-row')].map((r) => r.textContent)`));
    await bild(b, 'samtal-missat');
    // Bara ett mejl per halvtimme: ett andra missat samtal ger inget nytt mejl
    const fore = (srv.logg().match(/försökte ringa dig/g) || []).length;
    const rid = 'test_' + Date.now().toString(36) + 'abcdef';
    await srv.api(KA, 'POST', '/chatt/samtal/ring', { to_id: Number(await b.J(`state.id`)), call_id: rid });
    await H.sov(9000);
    await srv.api(KA, 'POST', '/chatt/samtal/avsluta', { call_id: rid });
    await H.sov(500);
    R.ok('missat: max ett mejl per halvtimme', (srv.logg().match(/försökte ringa dig/g) || []).length === fore, fore);

    // ===== Skärmdelning =====
    await a.K(`createTab(${JSON.stringify(sidaUrl)}); 1`); await H.sov(2500);
    await a.C(`valjFlik({ kind: active.kind, id: active.id }); 1`);
    R.ok('dela: flikväljaren visar sidan', await a.vanta(`[...document.querySelectorAll('#tab-list .tab-item')].some((t) => t.textContent.includes('Semesterplanering'))`, 6000),
      await a.J(`[...document.querySelectorAll('#tab-list .tab-item')].map((t) => t.textContent)`));
    await a.C(`[...document.querySelectorAll('#tab-list .tab-item')].find((t) => t.textContent.includes('Semesterplanering')).click(); 1`); await H.sov(300);
    await bild(a, 'dela-valj-flik');
    await a.C(`document.getElementById('tab-go').click(); 1`);
    R.ok('dela: Alva delar (röd remsa)', await a.vanta(`delning && !document.getElementById('share-bar').hidden`, 10000), await a.C(`document.getElementById('share-bar').hidden`));
    await b.C(`pollMessages(true); 1`);
    R.ok('dela: Bosse ser raden med Titta', await b.vanta(`document.querySelector('#chat-body .share-row.live .sr-btn:not(:disabled)')`, 12000));
    await bild(b, 'dela-rad');
    await b.C(`document.querySelector('#chat-body .share-row.live .sr-btn').click(); 1`);
    R.ok('dela: Bosse får bilden', await b.vanta(`window.__samtal.tittarVideo()`, 25000), await b.J(`window.__samtal.tittarVideo()`));
    await H.sov(1500);
    await bild(b, 'dela-tittare');
    await a.C(`ritaDelningBar(); 1`); await H.sov(300);
    R.ok('dela: Alva ser "1 tittar"', await a.vanta(`document.getElementById('share-bar-n').textContent.includes('1')`, 6000), await a.C(`document.getElementById('share-bar-n').textContent`));
    await bild(a, 'dela-sandare');
    await a.C(`stoppaDelning(); 1`);
    R.ok('dela: tittarvyn stängs när Alva slutar', await b.vanta(`document.getElementById('share-view').hidden`, 12000));

    // ===== Reaktioner räknas inte som olästa =====
    await b.K(`openChatt(false); 1`); await H.sov(1000);
    R.ok('olästa: inget oläst efter skärmdelningen', await bOlast('(n) => n === 0'), await b.K(`chattUnread`));
    await a.C(`rxToggle(${mid}, '🔥'); 1`); await H.sov(800);
    R.ok('olästa: reaktion på mitt meddelande ger notis', await (async () => { for (let i = 0; i < 20; i++) { await b.C(`refreshContacts().then(() => 1)`); if ((await bNotiser()).some((t) => /^Alva reagerade 🔥 på "Jag tar med kaffe"$/.test(t))) return true; await H.sov(600); } return false; })(), await bNotiser());
    R.ok('olästa: men räknas inte (0)', await b.K(`chattUnread`) === 0, await b.K(`chattUnread`));
    const ovR = await srv.api(KB, 'GET', '/chatt/messages/overview');
    R.ok('olästa: reaktionen markerad som läst på servern', !ovR.j.unread.length || ovR.j.unread[0].n === 0, ovR.j);
    await a.C(`chatInput.value = 'Hörs vi i helgen?'; sendMessage(); 1`);
    R.ok('olästa: ett vanligt meddelande räknas (1)', await bOlast('(n) => n === 1'), await b.K(`chattUnread`));
    R.ok('olästa: notis om meddelandet', (await bNotiser()).includes('msg:1'), await bNotiser());
    await b.K(`openChatt(true); 1`); await H.sov(1500);
    R.ok('olästa: öppna chatten nollställer', await bOlast('(n) => n === 0'), await b.K(`chattUnread`));

    R.ok('inga JS-fel i chatten (Alva)', !a.fel().length, a.fel());
    R.ok('inga JS-fel i chatten (Bosse)', !b.fel().length, b.fel());
  } catch (e) {
    R.ok('testet kraschade', false, String(e && e.stack || e));
  } finally {
    if (a) await a.stang(); if (b) await b.stang();
    xa.stoppa(); xb.stoppa(); srv.stang(); sida.close();
  }
  return R;
}

if (require.main === module) {
  const rot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
  kor(rot).then((R) => { console.log(R.text()); console.log(`\n${R.rader.length - R.fel.length} ok, ${R.fel.length} fel`); process.exit(R.fel.length ? 1 : 0); });
}
module.exports = { kor };
