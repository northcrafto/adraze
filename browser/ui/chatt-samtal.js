/* Röstsamtal och skärmdelning i chatten. Allt går direkt mellan datorerna (WebRTC, krypterat med DTLS-SRTP).
 *
 * Signalering: offer/answer skickas som krypterade kontrollposter i meddelandekanalen (se ctrlAv i chatt.js),
 * med alla ICE-kandidater inbakade (vi väntar på att insamlingen blir klar), så att det räcker med en post åt
 * varje håll. Servern ser bara chiffertext. Ringsignalen går däremot via en lätt serverhändelse (/chatt/samtal):
 * bara vem som ringer och ett slumpat samtals-id, så att den når mottagaren inom ett par sekunder.
 *
 *   ring  offer  {s, sdp}        den som ringer, syns som samtalsraden i konversationen
 *   ring  answer {s, sdp}        den som svarar
 *   ring  slut   {s, o, d}       hur det gick (missat/avbojt/klart/avbrutet) och hur länge, uppdaterar raden
 *   sk    start  {s, n}          "visar sin flik", syns som rad med Titta-knapp
 *   sk    offer  {s, till, sdp}  tittaren ber om bilden (recvonly)
 *   sk    answer {s, till, sdp}  den som delar svarar med fliken
 *   sk    slut   {s}             delningen är slut
 *
 * Bara STUN (ingen TURN-server): går inte en direkt förbindelse att öppna (vissa företags- och mobilnät med
 * symmetrisk NAT) så misslyckas samtalet/delningen med ett tydligt fel i stället för att gå via en relä.
 * Barnkonton (familjechatten): röstsamtal bara inom familjen (servern släpper bara igenom familjen), aldrig skärmdelning. */
'use strict';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const SAMTAL_RING_MS = 30000;
const MAX_TITTARE = 4;
const nyttId = () => { const b = crypto.getRandomValues(new Uint8Array(18)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const nyPc = () => new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
function insamlad(pc, ms = 3000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((ok) => {
    const t = setTimeout(klar, ms);
    function klar() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', kolla); ok(); }
    function kolla() { if (pc.iceGatheringState === 'complete') klar(); }
    pc.addEventListener('icegatheringstatechange', kolla);
  });
}
const tid = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
const kortTid = (s) => { s = Math.round(s); return s < 60 ? tf('{n} s', { n: s }) : (s < 3600 ? tf('{m} min', { m: Math.round(s / 60) }) : tf('{h} h {m} min', { h: Math.floor(s / 3600), m: Math.round((s % 3600) / 60) })); };
const IKON = {
  lur: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  lagg: '<svg viewBox="0 0 24 24"><path d="M3.4 13.6c5-4.5 12.2-4.5 17.2 0 .6.5.7 1.4.2 2l-1.4 1.7c-.4.5-1.2.6-1.7.3l-2.4-1.4c-.4-.2-.6-.7-.6-1.1v-1.6a12 12 0 0 0-5.4 0v1.6c0 .4-.2.9-.6 1.1l-2.4 1.4c-.5.3-1.3.2-1.7-.3l-1.4-1.7c-.5-.6-.4-1.5.2-2z"/></svg>',
  mik: '<svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/></svg>',
  mikAv: '<svg viewBox="0 0 24 24"><path d="M15 9.3V5.5a3 3 0 0 0-5.9-.8M9 9v2.5a3 3 0 0 0 5.1 2.1M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11.2 5.6M12 18v3.5M3 3l18 18"/></svg>',
  volym: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  skarm: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9.5 10.5 12 8l2.5 2.5M12 8v5"/></svg>',
  upp: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  in: '<svg viewBox="0 0 24 24"><path d="M16 3 10 9M10 4v5h5"/></svg>',
  ut: '<svg viewBox="0 0 24 24"><path d="M10 9l6-6M11 3h5v5"/></svg>',
};

// ===== Ljud: syntetiserade, mjuka (inga ljudfiler) =====
let ljudCtx = null, ljudT = null;
function actx() { if (!ljudCtx) ljudCtx = new (window.AudioContext || window.webkitAudioContext)(); if (ljudCtx.state === 'suspended') ljudCtx.resume().catch(() => {}); return ljudCtx; }
function ton(ctx, f, t0, len, vol, typ = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + len + 0.05);
}
function marimba(ctx, f, t0, vol) { ton(ctx, f, t0, 1.1, vol); ton(ctx, f * 4, t0, 0.18, vol * 0.18); ton(ctx, f * 2, t0, 0.5, vol * 0.25, 'triangle'); }
// in = inkommande ringsignal (tre toner, två gånger), ut = signalen medan det ringer hos den andra, slut = lagt på
function spela(typ) {
  stoppaLjud();
  try {
    const ctx = actx();
    if (typ === 'in') {
      if (!chatPref('ring')) return;
      const fras = () => { const t = ctx.currentTime + 0.02; [[659.25, 0], [987.77, 0.17], [830.61, 0.34], [659.25, 0.95], [987.77, 1.12], [830.61, 1.29]].forEach(([f, d]) => marimba(ctx, f, t + d, 0.09)); };
      fras(); ljudT = setInterval(fras, 3400);
    } else if (typ === 'ut') {
      const signal = () => { const t = ctx.currentTime + 0.02; ton(ctx, 425, t, 1.1, 0.035); ton(ctx, 850, t, 0.6, 0.008); };
      signal(); ljudT = setInterval(signal, 4000);
    } else if (typ === 'slut') {
      const t = ctx.currentTime + 0.02; marimba(ctx, 783.99, t, 0.06); marimba(ctx, 523.25, t + 0.16, 0.06);
    }
  } catch {}
}
function stoppaLjud() { if (ljudT) { clearInterval(ljudT); ljudT = null; } }

// ===== Läge, knappar i konversationshuvudet =====
function samtalKnappar() {
  const dm = !!active && active.kind === 'contact';
  $('chat-call').hidden = !dm;
  $('chat-share').hidden = !active || BARN;
  $('chat-call').disabled = !!samtal;
  $('chat-share').classList.toggle('on', !!(delning && active && ctrlNyckel(delning.conv) === ctrlNyckel(active)));
}
$('chat-call').addEventListener('click', () => {
  if (!active || active.kind !== 'contact') return;
  const c = contactsCache.find((x) => x.id === active.id) || { id: active.id, username: active.name };
  ring(c);
});
// Panelen öppnas/stängs: samtalet flyttar mellan panelen och den lilla rutan över webbsidan
function samtalSynlig(v) {
  if (v) { setMini(null); if (samtal && (samtal.fas === 'ringer' && !samtal.ut || $('call-ov').hidden && $('call-strip').hidden)) $('call-ov').hidden = false; if (samtal) ritaSamtal(); }
  else if (samtal) setMini(samtal.fas === 'ringer' && !samtal.ut ? 'ring' : 'samtal');
}
// Strippen och delningsremsan hör till hela panelen (inte bara den öppna konversationen)
(function () { const app = $('app'), top = app.querySelector('.topbar'); top.after($('share-bar')); top.after($('call-strip')); })();

// ===== Samtal =====
let samtal = null;            // { id, conv, peerId, peerName, ut, fas, pc, mic, start, kopplad, muted, info }
const samtalSett = new Set(); // inkommande samtals-id vi redan har visat/avfärdat
const samtalOffers = {};      // samtals-id → { sdp, from }
const samtalRader = {};       // samtals-id → { msgId, conv, mine, ts, slut, svarat }

CTRL.ring = (conv, m, ax, fran) => {
  if (!ax) return null;
  if (ax.h === 'offer') {
    if (!fran.mine) samtalOffers[ax.s] = { sdp: ax.sdp, from: fran.id };
    const r = samtalRader[ax.s] || (samtalRader[ax.s] = { s: ax.s, msgId: m.id, conv: { kind: conv.kind, id: conv.id }, mine: fran.mine, ts: m.created_at, slut: null, namn: fran.name });
    r.msgId = m.id; if (m.created_at) r.ts = m.created_at;
    return samtalRad(r);
  }
  const r = samtalRader[ax.s];
  if (ax.h === 'answer') {
    if (r) r.svarat = true;
    if (samtal && samtal.id === ax.s && samtal.ut && !fran.mine && samtal.fas === 'ringer') tillAnswer(ax.sdp);
  } else if (ax.h === 'slut') {
    if (r) { if (!r.slut || ax.o === 'klart') r.slut = { o: ax.o, d: ax.d }; uppdateraSamtalRad(r); }
    if (samtal && samtal.id === ax.s && !fran.mine) avsluta('klart', true);
  }
  return null;
};
function samtalRadText(r) {
  const live = samtal && samtal.id === r.s;
  if (live) return { t: samtal.fas === 'pagar' ? T('Samtal pågår') : (r.mine ? T('Ringer…') : T('Ringer dig…')), cls: 'live' };
  const s = r.slut;
  if (s && s.o === 'klart' && s.d > 0) return { t: T('Röstsamtal') + ' · ' + kortTid(s.d), cls: '' };
  if (r.mine) {
    if (s && s.o === 'missat') return { t: T('Inget svar'), cls: '' };
    if (s && s.o === 'avbojt') return { t: T('Samtalet avböjdes'), cls: '' };
    if (s && s.o === 'avbrutet') return { t: T('Samtalet bröts'), cls: '' };
    return { t: T('Röstsamtal'), cls: '' };
  }
  if (s && s.o === 'missat') return { t: T('Missat samtal'), cls: 'missat', tillbaka: true };
  if (s && s.o === 'avbojt') return { t: T('Du avböjde samtalet'), cls: '', tillbaka: true };
  if (s && s.o === 'avbrutet') return { t: T('Samtalet bröts'), cls: '' };
  return { t: T('Röstsamtal'), cls: '' };
}
function samtalRad(r) {
  const el = document.createElement('div');
  el.className = 'sys-row call-row'; el.dataset.id = Number(r.msgId); el.dataset.ts = r.ts || Date.now(); el.dataset.s = r.s;
  fyllSamtalRad(el, r);
  return el;
}
function fyllSamtalRad(el, r) {
  const x = samtalRadText(r);
  el.classList.toggle('missat', x.cls === 'missat'); el.classList.toggle('live', x.cls === 'live');
  el.innerHTML = '<span class="sr-ico">' + (r.mine ? IKON.ut : IKON.in) + IKON.lur + '</span><span class="sr-txt"><b>' + esc(x.t) + '</b><span class="sr-time">' + esc(fmtTime(r.ts || Date.now())) + '</span></span>';
  if (x.tillbaka && r.conv.kind === 'contact' && !samtal) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sr-btn'; b.textContent = T('Ring tillbaka');
    b.addEventListener('click', () => { const c = contactsCache.find((k) => k.id === r.conv.id); if (c) ring(c); });
    el.appendChild(b);
  }
}
function uppdateraSamtalRad(r) {
  const el = document.querySelector('#chat-body .call-row[data-s="' + r.s + '"]');
  if (el) fyllSamtalRad(el, r);
}

async function ring(c) {
  if (samtal) { toast(T('Du är redan i ett samtal.')); return; }
  if (!c || !c.id) return;
  let conv;
  try { conv = await convFor('contact', c.id); } catch (e) { alertBox(e.message || T('Kunde inte ringa.')); return; }
  const id = nyttId();
  samtal = { id, conv, peerId: c.id, peerName: c.username, ut: true, fas: 'ringer', start: Date.now(), muted: false };
  visaSamtal(true);
  try {
    samtal.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch {
    samtal = null; gomSamtal();
    alertBox(T('AdRaze kommer inte åt mikrofonen. Kontrollera att en mikrofon är inkopplad och att den inte används av något annat program.'));
    return;
  }
  try {
    const pc = kopplaPc(samtal);
    samtal.mic.getTracks().forEach((t) => pc.addTrack(t, samtal.mic));
    await pc.setLocalDescription(await pc.createOffer());
    await insamlad(pc);
    if (!samtal || samtal.id !== id) return;
    samtal.offerId = await sendCtrl(conv, { t: 'ring', h: 'offer', s: id, sdp: pc.localDescription.sdp }, T('Ringde dig i AdRaze. Uppdatera AdRaze för att kunna svara på samtal.'));
    samtalRader[id] = { s: id, msgId: samtal.offerId, conv: { kind: 'contact', id: c.id }, mine: true, ts: Date.now() + serverSkew, slut: null };
    await POST('/samtal/ring', { to_id: c.id, call_id: id });
    if (!samtal || samtal.id !== id) return;
    spela('ut');
    samtal.ringT = setTimeout(() => { if (samtal && samtal.id === id && samtal.fas === 'ringer') avsluta('missat'); }, SAMTAL_RING_MS);
    signalLoop(id);
    if (active && active.kind === 'contact' && active.id === c.id) pollMessages(true);
  } catch (e) {
    if (samtal && samtal.id === id) avsluta('avbrutet');
    alertBox(e.message || T('Kunde inte ringa.'));
  }
}
function kopplaPc(sm) {
  const pc = nyPc(); sm.pc = pc;
  pc.ontrack = (e) => {
    const el = $('call-audio');
    el.srcObject = e.streams[0] || new MediaStream([e.track]);
    el.play().catch(() => {});
    sm.remote = el.srcObject;
    matNiva(sm);
  };
  pc.onconnectionstatechange = () => {
    if (samtal !== sm) return;
    const st = pc.connectionState;
    if (st === 'connected' && sm.fas !== 'pagar') { sm.fas = 'pagar'; sm.kopplad = Date.now(); stoppaLjud(); clearTimeout(sm.ringT); ritaSamtal(); }
    else if (st === 'failed') { toast(T('Samtalet bröts. Det gick inte att få en direkt förbindelse.')); avsluta(sm.kopplad ? 'klart' : 'avbrutet'); }
    else if (st === 'disconnected') { clearTimeout(sm.discT); sm.discT = setTimeout(() => { if (samtal === sm && pc.connectionState !== 'connected') avsluta('klart'); }, 6000); }
  };
  return pc;
}
// Ljudnivån hos motparten: ringen runt profilbilden andas med rösten (och testerna kan mäta att ljud kommer fram)
function matNiva(sm) {
  try {
    const ctx = actx(), src = ctx.createMediaStreamSource(sm.remote), an = ctx.createAnalyser();
    an.fftSize = 512; src.connect(an); sm.analys = an;
    const buf = new Float32Array(an.fftSize);
    const steg = () => {
      if (samtal !== sm) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      sm.niva = Math.sqrt(sum / buf.length);
      sm.maxNiva = Math.max(sm.maxNiva || 0, sm.niva);
      const av = $('co-av'); if (av) av.style.setProperty('--niva', Math.min(1, sm.niva * 8).toFixed(3));
      setTimeout(steg, 80);
    };
    steg();
  } catch {}
}
async function tillAnswer(sdp) {
  const sm = samtal; if (!sm || !sm.pc) return;
  try { sm.fas = 'ansluter'; stoppaLjud(); clearTimeout(sm.ringT); ritaSamtal(); await sm.pc.setRemoteDescription({ type: 'answer', sdp }); }
  catch { avsluta('avbrutet'); }
}
// Tät hämtning av kontrollposter medan ett samtal kopplas upp (svaret från den andra)
async function signalLoop(id) {
  while (samtal && samtal.id === id && (samtal.fas === 'ringer' || samtal.fas === 'ansluter')) {
    try { await sigPoll(samtal.conv); } catch {}
    await new Promise((ok) => setTimeout(ok, 900));
  }
}

// Inkommande
function inkommande(inc) {
  samtalSett.add(inc.call_id);
  const c = contactsCache.find((x) => x.id === String(inc.from_id)) || { id: String(inc.from_id), username: inc.from_username };
  rememberAvatar(c.username, c.avatar || avatarFor(c.username));
  samtal = { id: inc.call_id, conv: null, peerId: String(inc.from_id), peerName: c.username || inc.from_username, ut: false, fas: 'ringer', start: Date.now(), inc, muted: false };
  visaSamtal();
  if (!panelVisible) setMini('ring');
  spela('in');
  if (chatPref('notify') && 'Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
    try { const n = new Notification('AdRaze', { body: tf('{u} ringer dig', { u: samtal.peerName }), tag: 'adraze-samtal', silent: true }); n.onclick = () => { try { window.chatt.oppna(); } catch {} }; } catch {}
  }
  const id = inc.call_id;
  samtal.ringT = setTimeout(() => { if (samtal && samtal.id === id && samtal.fas === 'ringer') { stangUtanSvar(); } }, Math.max(5000, (inc.ring_ms || SAMTAL_RING_MS) - (Date.now() + serverSkew - inc.started_at)) + 1500);
}
function stangUtanSvar() { stoppaLjud(); const sm = samtal; samtal = null; if (sm) clearTimeout(sm.ringT); gomSamtal(); }
async function svara() {
  const sm = samtal; if (!sm || sm.ut || sm.fas !== 'ringer') return;
  stoppaLjud(); clearTimeout(sm.ringT);
  sm.fas = 'ansluter'; ritaSamtal();
  try {
    await POST('/samtal/svar', { call_id: sm.id, svar: 'svara' });
    sm.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .catch(() => { throw new Error(T('AdRaze kommer inte åt mikrofonen. Kontrollera att en mikrofon är inkopplad.')); });
    sm.conv = await convFor('contact', sm.peerId);
    for (let i = 0; i < 8 && !samtalOffers[sm.id] && samtal === sm; i++) {
      await sigPoll(sm.conv, (sm.inc.started_at || Date.now() + serverSkew) - 20000).catch(() => {});
      if (!samtalOffers[sm.id]) await new Promise((ok) => setTimeout(ok, 700));
    }
    const offer = samtalOffers[sm.id];
    if (!offer) throw new Error(T('Samtalet gick inte att koppla upp. Be den som ringde att försöka igen.'));
    if (samtal !== sm) return;
    const pc = kopplaPc(sm);
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    sm.mic.getTracks().forEach((t) => pc.addTrack(t, sm.mic));
    await pc.setLocalDescription(await pc.createAnswer());
    await insamlad(pc);
    if (samtal !== sm) return;
    await sendCtrl(sm.conv, { t: 'ring', h: 'answer', s: sm.id, sdp: pc.localDescription.sdp }, T('Svarade i samtalet.'));
    if (samtalRader[sm.id]) samtalRader[sm.id].svarat = true;
  } catch (e) {
    if (samtal === sm) avsluta('avbrutet');
    alertBox(e.message || T('Kunde inte svara.'));
  }
}
async function avboj() {
  const sm = samtal; if (!sm || sm.ut) return;
  stoppaLjud(); clearTimeout(sm.ringT);
  samtal = null; gomSamtal();
  POST('/samtal/svar', { call_id: sm.id, svar: 'avboj' }).catch(() => {});
}
// Lägg på / samtalet tog slut. fjarr = den andra lade på (vi har redan fått veta)
async function avsluta(orsak, fjarr) {
  const sm = samtal; if (!sm) return;
  samtal = null;
  stoppaLjud(); clearTimeout(sm.ringT); clearTimeout(sm.discT);
  const sek = sm.kopplad ? (Date.now() - sm.kopplad) / 1000 : 0;
  try { if (sm.pc) sm.pc.close(); } catch {}
  try { if (sm.mic) sm.mic.getTracks().forEach((t) => t.stop()); } catch {}
  try { $('call-audio').srcObject = null; } catch {}
  if (sm.fas !== 'ringer' || sm.ut) spela('slut');
  // Visa "Samtalet avslutat" en kort stund
  sm.fas = 'slut'; sm.slutText = orsak === 'missat' ? T('Inget svar') : orsak === 'avbojt' ? T('Upptaget') : (sek ? T('Samtalet avslutat') + ' · ' + tid(sek) : T('Samtalet avslutat'));
  sistaSamtal = sm; ritaSamtal(sm);
  setTimeout(() => { if (!samtal) gomSamtal(); }, 1600);
  if (!fjarr) POST('/samtal/avsluta', { call_id: sm.id }).catch(() => {});
  const o = sek > 0 ? 'klart' : orsak;
  const raden = samtalRader[sm.id];
  if (raden) { raden.slut = { o, d: Math.round(sek) }; uppdateraSamtalRad(raden); }
  if (sm.conv && (sm.ut || (sek > 0 && !fjarr))) {
    const text = o === 'klart' ? tf('Samtalet avslutades ({t}).', { t: tid(sek) }) : o === 'missat' ? T('Missat samtal.') : o === 'avbojt' ? T('Samtalet avböjdes.') : T('Samtalet bröts.');
    sendCtrl(sm.conv, { t: 'ring', h: 'slut', s: sm.id, o, d: Math.round(sek) }, text).catch(() => {});
  }
  samtalKnappar();
}
let sistaSamtal = null;

// Läget hos den som ringer, och inkommande ringningar
let samtalPollT = null;
async function samtalPoll() {
  clearTimeout(samtalPollT);
  try {
    if (state && myPriv) {
      const r = await GET('/samtal');
      if (r.server_time) serverSkew = r.server_time - Date.now();
      const sm = samtal;
      if (sm) {
        const mitt = (r.calls || []).find((c) => c.call_id === sm.id);
        if (sm.ut && sm.fas === 'ringer' && mitt && (mitt.state === 'avbojt' || mitt.state === 'missat')) avsluta(mitt.state);
        else if (!sm.ut && sm.fas === 'ringer' && !(r.incoming || []).some((i) => i.call_id === sm.id)) stangUtanSvar();   // den som ringde lade på
        else if ((sm.fas === 'pagar' || sm.fas === 'ansluter') && mitt && (mitt.state === 'avslutat' || mitt.state === 'avbojt')) avsluta('klart', true);
      }
      for (const inc of r.incoming || []) {
        if (samtalSett.has(inc.call_id)) continue;
        if (samtal) { samtalSett.add(inc.call_id); POST('/samtal/svar', { call_id: inc.call_id, svar: 'avboj' }).catch(() => {}); continue; }   // upptaget
        inkommande(inc);
      }
    }
  } catch {}
  samtalPollT = setTimeout(samtalPoll, samtal ? 1200 : 2500);
}

// ===== Samtalsskärmen =====
function visaSamtal(synlig) {
  if (synlig !== false) { $('call-ov').hidden = false; $('call-strip').hidden = true; }
  ritaSamtal();
  samtalKnappar();
}
function gomSamtal() {
  $('call-ov').hidden = true; $('call-strip').hidden = true;
  $('call-ov').classList.remove('vol-open');
  setMini(null);
  clearInterval(klockaT); klockaT = null;
  samtalKnappar();
}
let klockaT = null;
function samtalStatus(sm) {
  if (sm.fas === 'slut') return sm.slutText || T('Samtalet avslutat');
  if (sm.fas === 'ringer') return sm.ut ? T('Ringer…') : T('Ringer dig i AdRaze…');
  if (sm.fas === 'ansluter') return T('Ansluter…');
  return tid((Date.now() - sm.kopplad) / 1000);
}
function ritaSamtal(sm) {
  sm = sm || samtal; if (!sm) return;
  const ov = $('call-ov');
  ov.dataset.fas = sm.fas; ov.classList.toggle('in', !sm.ut);
  const av = avatarFor(sm.peerName);
  $('co-av').innerHTML = av ? '<img class="av-img" alt="" src="' + esc(av) + '">' : esc(initials(sm.peerName));
  $('co-bg').style.backgroundImage = av ? 'url("' + av + '")' : '';
  $('co-bg').classList.toggle('none', !av);
  $('co-name').textContent = sm.peerName;
  $('co-status').textContent = samtalStatus(sm);
  const akt = $('co-actions'); akt.innerHTML = '';
  const knapp = (cls, label, svg, run) => {
    const w = document.createElement('div'); w.className = 'co-btn-w';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'co-btn ' + cls; b.innerHTML = svg; b.setAttribute('aria-label', label); b.title = label;
    b.addEventListener('click', run);
    w.appendChild(b); const l = document.createElement('span'); l.textContent = label; w.appendChild(l); akt.appendChild(w);
    return b;
  };
  if (sm.fas === 'slut') {}
  else if (!sm.ut && sm.fas === 'ringer') {
    knapp('rod', T('Avböj'), IKON.lagg, avboj);
    knapp('gron', T('Svara'), IKON.lur, svara);
  } else {
    knapp('glas' + (sm.muted ? ' av' : ''), sm.muted ? T('Mikrofon av') : T('Mikrofon'), sm.muted ? IKON.mikAv : IKON.mik, () => tystaMik());
    knapp('glas', T('Volym'), IKON.volym, () => ov.classList.toggle('vol-open'));
    if (!BARN) knapp('glas' + (delning ? ' on' : ''), delning ? T('Sluta visa') : T('Visa flik'), IKON.skarm, () => { if (delning) stoppaDelning(); else valjFlik(sm.conv || { kind: 'contact', id: sm.peerId }); });
    knapp('rod', T('Lägg på'), IKON.lagg, () => avsluta(sm.ut && sm.fas === 'ringer' ? 'missat' : 'klart'));
  }
  let vol = ov.querySelector('.co-vol');
  if (!vol) {
    vol = document.createElement('label'); vol.className = 'co-vol';
    vol.innerHTML = IKON.volym + '<input type="range" min="0" max="100" step="1" aria-label="Volym">';
    const r = vol.querySelector('input'); r.value = String(Math.round($('call-audio').volume * 100));
    r.addEventListener('input', () => { $('call-audio').volume = Number(r.value) / 100; });
    ov.insertBefore(vol, $('co-actions'));
  }
  clearInterval(klockaT); klockaT = null;
  if (sm.fas === 'pagar') klockaT = setInterval(() => { if (samtal === sm) { $('co-status').textContent = samtalStatus(sm); ritaStrip(); ritaMini(); } }, 1000);
  ritaStrip(); ritaMini();
  if (!sm.conv || !active) {} else { const r = samtalRader[sm.id]; if (r) uppdateraSamtalRad(r); }
}
function tystaMik() {
  const sm = samtal; if (!sm || !sm.mic) return;
  sm.muted = !sm.muted;
  sm.mic.getAudioTracks().forEach((t) => { t.enabled = !sm.muted; });
  ritaSamtal();
}
$('co-min').addEventListener('click', () => { $('call-ov').hidden = true; ritaStrip(); });
$('call-strip-open').addEventListener('click', () => { if (samtal) { $('call-ov').hidden = false; ritaSamtal(); } });
function ritaStrip() {
  const sm = samtal, st = $('call-strip');
  if (!sm || !$('call-ov').hidden || sm.fas === 'slut') { st.hidden = true; return; }
  st.hidden = false;
  $('call-strip-txt').textContent = sm.peerName + ' · ' + samtalStatus(sm);
}

// ===== Liten ruta över webbsidan (chatten stängd) =====
let miniLage = null;
function setMini(lage) {
  miniLage = lage;
  document.documentElement.classList.toggle('mini', !!lage);
  $('mini').hidden = !lage;
  ritaMini();
  try { window.chatt.mini(lage, lage === 'ring' ? 96 : 64); } catch {}
}
function ritaMini() {
  const m = $('mini'), sm = samtal || (sistaSamtal && sistaSamtal.fas === 'slut' ? sistaSamtal : null);
  if (!miniLage || !sm) { if (miniLage && !sm) setMini(null); return; }
  const av = avatarFor(sm.peerName);
  const avHtml = '<span class="mi-av">' + (av ? '<img class="av-img" alt="" src="' + esc(av) + '">' : esc(initials(sm.peerName))) + '</span>';
  m.className = 'mini ' + (miniLage === 'ring' ? 'ring' : 'pill');
  if (miniLage === 'ring') {
    m.innerHTML = avHtml + '<span class="mi-txt"><b>' + esc(sm.peerName) + '</b><span>' + esc(samtalStatus(sm)) + '</span></span>' +
      '<button type="button" class="mi-btn rod" data-a="avboj" title="' + esc(T('Avböj')) + '">' + IKON.lagg + '</button>' +
      '<button type="button" class="mi-btn gron" data-a="svara" title="' + esc(T('Svara')) + '">' + IKON.lur + '</button>';
  } else {
    m.innerHTML = avHtml + '<span class="mi-txt"><b>' + esc(sm.peerName) + '</b><span class="mono">' + esc(samtalStatus(sm)) + '</span></span>' +
      (sm.fas === 'slut' ? '' : '<button type="button" class="mi-btn glas' + (sm.muted ? ' av' : '') + '" data-a="mik" title="' + esc(sm.muted ? T('Slå på mikrofonen') : T('Stäng av mikrofonen')) + '">' + (sm.muted ? IKON.mikAv : IKON.mik) + '</button>' +
      '<button type="button" class="mi-btn glas" data-a="oppna" title="' + esc(T('Visa samtalet')) + '">' + IKON.upp + '</button>' +
      '<button type="button" class="mi-btn rod" data-a="lagg" title="' + esc(T('Lägg på')) + '">' + IKON.lagg + '</button>');
  }
}
$('mini').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) { if (samtal) { try { window.chatt.oppna(); } catch {} } return; }
  const a = b.dataset.a;
  if (a === 'svara') { try { window.chatt.oppna(); } catch {} svara(); }
  else if (a === 'avboj') avboj();
  else if (a === 'mik') { tystaMik(); ritaMini(); }
  else if (a === 'oppna') { $('call-ov').hidden = false; try { window.chatt.oppna(); } catch {} }
  else if (a === 'lagg') avsluta('klart');
});

// ===== Skärmdelning: visa en flik =====
let delning = null;   // { s, conv, stream, titel, tittare: Map(id → pc) }
let tittar = null;    // { s, conv, fran, pc, fullFore }
const skRader = {};   // s → { msgId, conv, fran, n, ts, slut }

CTRL.sk = (conv, m, ax, fran) => {
  if (!ax) return null;
  if (ax.h === 'start') {
    const r = skRader[ax.s] || (skRader[ax.s] = { s: ax.s, msgId: m.id, conv: { kind: conv.kind, id: conv.id }, fran, n: ax.n, ts: m.created_at, slut: false });
    r.msgId = m.id; if (m.created_at) r.ts = m.created_at;
    return delningRad(r);
  }
  const r = skRader[ax.s];
  if (ax.h === 'slut') {
    if (r) { r.slut = true; uppdateraDelningRad(r); }
    if (tittar && tittar.s === ax.s && !fran.mine) { const namn = fran.name; stangTittare(); toast(tf('{u} slutade visa sin flik.', { u: namn })); }
  } else if (ax.h === 'offer') {
    if (delning && delning.s === ax.s && !fran.mine && ax.till === state.id) svaraTittare(fran, ax.sdp);
  } else if (ax.h === 'answer') {
    if (tittar && tittar.s === ax.s && !fran.mine && ax.till === state.id && !tittar.besvarad) {
      tittar.besvarad = true;
      tittar.pc.setRemoteDescription({ type: 'answer', sdp: ax.sdp }).catch(() => { stangTittare(); toast(T('Kunde inte visa fliken.')); });
    }
  }
  return null;
};
function delningAktiv(r) { return !r.slut && Date.now() + serverSkew - (r.ts || 0) < 6 * 3600 * 1000 && !(r.fran.mine && !(delning && delning.s === r.s)); }
function delningRad(r) {
  const el = document.createElement('div');
  el.className = 'sys-row share-row'; el.dataset.id = Number(r.msgId); el.dataset.ts = r.ts || Date.now(); el.dataset.s = r.s;
  fyllDelningRad(el, r);
  return el;
}
function fyllDelningRad(el, r) {
  const live = delningAktiv(r);
  el.classList.toggle('live', live);
  const vem = r.fran.mine ? T('Du') : r.fran.name;
  const text = live ? (r.fran.mine ? T('Du visar din flik') : tf('{u} visar sin flik', { u: vem })) : (r.fran.mine ? T('Du visade din flik') : tf('{u} visade sin flik', { u: vem }));
  el.innerHTML = '<span class="sr-ico">' + IKON.skarm + '</span><span class="sr-txt"><b>' + esc(text) + '</b>' + (r.n ? '<span class="sr-sub">' + esc(r.n) + '</span>' : '') + '<span class="sr-time">' + esc(fmtTime(r.ts || Date.now())) + '</span></span>';
  if (live && !r.fran.mine) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sr-btn';
    if (BARN) { b.disabled = true; b.textContent = T('Inte i familjechatten'); }
    else { b.textContent = tittar && tittar.s === r.s ? T('Tittar') : T('Titta'); b.addEventListener('click', () => titta(r)); }
    el.appendChild(b);
  }
}
function uppdateraDelningRad(r) { const el = document.querySelector('#chat-body .share-row[data-s="' + r.s + '"]'); if (el) fyllDelningRad(el, r); }

// Välj flik (bara flikar i det här fönstret; det man väljer är det enda som syns)
let valdFlik = null, flikConv = null;
$('chat-share').addEventListener('click', () => {
  if (!active || BARN) return;
  if (delning) { stoppaDelning(); return; }
  valjFlik({ kind: active.kind, id: active.id });
});
async function valjFlik(convRef) {
  if (BARN) return;
  if (delning) { toast(T('Du visar redan en flik.')); return; }
  flikConv = convRef; valdFlik = null;
  const lista = $('tab-list'); lista.innerHTML = '<div class="empty-hint">' + esc(T('Hämtar…')) + '</div>';
  $('tab-go').disabled = true;
  $('modal-tab').classList.add('open');
  let flikar = [];
  try { flikar = await window.chatt.flikar(); } catch {}
  lista.innerHTML = '';
  if (!flikar.length) { lista.innerHTML = '<div class="empty-hint">' + esc(T('Inga flikar att visa. Öppna sidan du vill visa först.')) + '</div>'; return; }
  for (const f of flikar) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tab-item'; b.dataset.id = f.id;
    let host = ''; try { host = new URL(f.url).hostname; } catch {}
    b.innerHTML = '<span class="ti-ico">' + (f.ikon ? '<img alt="" src="' + esc(f.ikon) + '">' : IKON.skarm) + '</span><span class="ti-txt"><b>' + esc(f.titel || host || T('Ny flik')) + '</b><span>' + esc(host) + (f.aktiv ? ' · ' + esc(T('öppen nu')) : '') + '</span></span>';
    b.addEventListener('click', () => { lista.querySelectorAll('.tab-item').forEach((x) => x.classList.toggle('on', x === b)); valdFlik = f; $('tab-go').disabled = false; });
    b.addEventListener('dblclick', () => { valdFlik = f; $('tab-go').click(); });
    lista.appendChild(b);
    if (f.aktiv) b.click();
  }
}
$('tab-cancel').addEventListener('click', () => $('modal-tab').classList.remove('open'));
$('tab-go').addEventListener('click', async () => {
  const f = valdFlik, ref = flikConv; if (!f || !ref) return;
  $('modal-tab').classList.remove('open');
  try { await startaDelning(ref, f); } catch (e) { alertBox(e.message || T('Kunde inte visa fliken.')); }
});
async function startaDelning(ref, f) {
  const ok = await window.chatt.valjFlik(f.id);
  if (!ok) throw new Error(T('Fliken finns inte längre.'));
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false }); }
  catch { throw new Error(T('Fliken gick inte att visa.')); }
  const conv = await convFor(ref.kind, ref.id);
  const s = nyttId(), titel = cleanStr(f.titel || '', 100);
  delning = { s, conv, stream, titel, tittare: new Map() };
  stream.getVideoTracks().forEach((t) => { try { t.contentHint = 'detail'; } catch {} t.addEventListener('ended', () => { if (delning && delning.s === s) stoppaDelning(); }); });
  try {
    const id = await sendCtrl(conv, { t: 'sk', h: 'start', s, n: titel }, tf('Visar sin flik: {n}. Uppdatera AdRaze för att kunna titta.', { n: titel || T('flik') }));
    skRader[s] = { s, msgId: id, conv: { kind: conv.kind, id: conv.id }, fran: { id: state.id, name: state.username, mine: true }, n: titel, ts: Date.now() + serverSkew, slut: false };
  } catch (e) { stoppaDelning(true); throw e; }
  ritaDelningBar(); samtalKnappar();
  if (active && ctrlNyckel(active) === ctrlNyckel(conv)) pollMessages(true);
  (async () => { while (delning && delning.s === s) { try { await sigPoll(conv); } catch {} await new Promise((ok) => setTimeout(ok, 1200)); } })();
}
async function svaraTittare(fran, sdp) {
  const d = delning; if (!d) return;
  if (d.tittare.has(fran.id)) { try { d.tittare.get(fran.id).close(); } catch {} d.tittare.delete(fran.id); }
  if (d.tittare.size >= MAX_TITTARE) return;   // fullt: tittaren får "svarar inte" efter en stund
  const pc = nyPc(); d.tittare.set(fran.id, pc);
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && delning === d && d.tittare.get(fran.id) === pc) { d.tittare.delete(fran.id); ritaDelningBar(); } else ritaDelningBar(); };
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp });
    for (const t of d.stream.getVideoTracks()) {
      const snd = pc.addTrack(t, d.stream);
      try { const p = snd.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = 2_500_000; p.degradationPreference = 'maintain-resolution'; await snd.setParameters(p); } catch {}
    }
    await pc.setLocalDescription(await pc.createAnswer());
    await insamlad(pc);
    if (delning !== d) return;
    await sendCtrl(d.conv, { t: 'sk', h: 'answer', s: d.s, till: fran.id, sdp: pc.localDescription.sdp }, T('Ansluter till skärmdelningen.'));
    ritaDelningBar();
  } catch { try { pc.close(); } catch {} d.tittare.delete(fran.id); }
}
function ritaDelningBar() {
  const bar = $('share-bar');
  if (!delning) { bar.hidden = true; return; }
  bar.hidden = false;
  $('share-bar-title').textContent = delning.titel || T('flik');
  const n = [...delning.tittare.values()].filter((p) => p.connectionState === 'connected').length;
  $('share-bar-n').textContent = n ? (n === 1 ? T('1 tittar') : tf('{n} tittar', { n })) : T('ingen tittar än');
}
$('share-stop').addEventListener('click', () => stoppaDelning());
function stoppaDelning(tyst) {
  const d = delning; if (!d) return;
  delning = null;
  try { d.stream.getTracks().forEach((t) => t.stop()); } catch {}
  for (const pc of d.tittare.values()) { try { pc.close(); } catch {} }
  if (!tyst) sendCtrl(d.conv, { t: 'sk', h: 'slut', s: d.s }, T('Slutade visa sin flik.')).catch(() => {});
  const r = skRader[d.s]; if (r) { r.slut = true; uppdateraDelningRad(r); }
  ritaDelningBar(); samtalKnappar();
  if (samtal) ritaSamtal();
}

// Titta på någon annans flik
async function titta(r) {
  if (BARN) return;
  if (tittar) { if (tittar.s === r.s) { $('share-view').hidden = false; return; } stangTittare(); }
  let conv; try { conv = await convFor(r.conv.kind, r.conv.id); } catch (e) { alertBox(e.message); return; }
  const pc = nyPc();
  tittar = { s: r.s, conv, fran: r.fran, pc, fullFore: fullView, besvarad: false };
  const t = tittar;
  $('sv-title').textContent = tf('{u} visar: {n}', { u: r.fran.name, n: r.n || T('flik') });
  $('sv-wait-txt').textContent = T('Ansluter…'); $('sv-wait').hidden = false;
  $('share-view').hidden = false;
  if (!fullView) setFull(true);
  uppdateraDelningRad(r);
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.ontrack = (e) => { const v = $('sv-video'); v.srcObject = e.streams[0] || new MediaStream([e.track]); v.play().catch(() => {}); };
  pc.onconnectionstatechange = () => {
    if (tittar !== t) return;
    if (pc.connectionState === 'connected') $('sv-wait').hidden = true;
    if (pc.connectionState === 'failed') { $('sv-wait').hidden = false; $('sv-wait-txt').textContent = T('Det gick inte att få en direkt förbindelse.'); }
  };
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await insamlad(pc);
    if (tittar !== t) return;
    await sendCtrl(conv, { t: 'sk', h: 'offer', s: r.s, till: r.fran.id, sdp: pc.localDescription.sdp }, T('Tittar på skärmdelningen.'));
  } catch (e) { stangTittare(); alertBox(e.message || T('Kunde inte titta.')); return; }
  const slut = Date.now() + 20000;
  while (tittar === t && !t.besvarad && Date.now() < slut) { try { await sigPoll(conv); } catch {} await new Promise((ok) => setTimeout(ok, 900)); }
  if (tittar === t && !t.besvarad) { $('sv-wait-txt').textContent = T('Sändningen svarar inte. Den kan ha slutat, eller så tittar redan fyra.'); }
  // Fortsätt lyssna efter "slut" medan vi tittar
  while (tittar === t) { try { await sigPoll(conv); } catch {} await new Promise((ok) => setTimeout(ok, 2500)); }
}
function stangTittare() {
  const t = tittar; if (!t) return;
  tittar = null;
  try { t.pc.close(); } catch {}
  $('sv-video').srcObject = null;
  $('share-view').hidden = true;
  if (!t.fullFore && fullView) setFull(false);
  const r = skRader[t.s]; if (r) uppdateraDelningRad(r);
}
$('sv-close').addEventListener('click', stangTittare);
$('sv-full').addEventListener('click', () => { const v = $('share-view'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else v.requestFullscreen().catch(() => {}); });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('modal-tab').classList.contains('open')) return;   // modalen stängs av chatt.js
  if (!$('share-view').hidden && !document.fullscreenElement) { e.stopImmediatePropagation(); stangTittare(); return; }
  if (samtal && !$('call-ov').hidden && samtal.fas !== 'ringer') { e.stopImmediatePropagation(); $('call-ov').hidden = true; ritaStrip(); }
}, true);
window.addEventListener('beforeunload', () => {
  if (samtal) { try { avsluta('klart'); } catch {} }
  if (delning) { try { stoppaDelning(); } catch {} }
});

// Testkrokar (används av tools/test/chatt.js): ljudnivån som tagits emot i samtalet
window.__samtal = { niva: () => (samtal ? { fas: samtal.fas, niva: samtal.niva || 0, max: samtal.maxNiva || 0 } : null), tittarVideo: () => { const v = $('sv-video'); return v && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null; } };

samtalPoll();
start();
