/* Reaktioner i chatten (som i Discord): hovra eller högerklicka ett meddelande → snabbreaktioner, eller
 * "+" för emoji-väljaren. En reaktion är ett vanligt krypterat meddelande (kontrollpost, se ctrlAv i chatt.js):
 *   {"sk":"txt","c":"Reagerade med 👍","r":<citat av meddelandet>,"ax":{"t":"rx","m":"<id>","e":"👍","on":true}}
 * Servern ser bara chiffertext. Varje person har EN post per meddelande och emoji: att ta bort eller lägga
 * tillbaka reaktionen redigerar posten (on:false/true), så det blir inga högar av poster. Äldre AdRaze visar
 * posten som en vanlig rad med citat ("Reagerade med 👍"), och efter borttagning "Tog bort reaktionen 👍".
 * Emoji-väljaren används också för att skriva emojier i textrutan. */
'use strict';

const RX_SNABB = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const rxStore = {};   // konversation → Map(postens id → { m, e, on, who, mine })
function rxMap(conv) { const k = ctrlNyckel(conv); return rxStore[k] || (rxStore[k] = new Map()); }

CTRL.rx = (conv, m, ax, fran) => {
  const map = rxMap(conv);
  if (!ax || m.deleted) map.delete(String(m.id));
  else map.set(String(m.id), { m: ax.m, e: ax.e, on: ax.on, who: fran.name || '?', mine: !!fran.mine });
  if (active && ctrlNyckel(active) === ctrlNyckel(conv) && ax) rxRita(ax.m);
  return null;
};

// Sammanfattning för ett meddelande: emoji → { n, vem[], mine }
function rxSumma(target) {
  if (!active) return [];
  const per = new Map();
  for (const r of rxMap(active).values()) {
    if (r.m !== String(target) || !r.on) continue;
    const o = per.get(r.e) || { e: r.e, vem: [], mine: false };
    if (!o.vem.includes(r.who)) o.vem.push(r.who);
    if (r.mine) o.mine = true;
    per.set(r.e, o);
  }
  return [...per.values()];
}
function rxRita(target) {
  const body = $('chat-body'); if (!body || !active) return;
  const b = body.querySelector('.bubble[data-id="' + Number(target) + '"]');
  let row = body.querySelector('.rx-row[data-for="' + Number(target) + '"]');
  const summa = b && !msgMeta[target]?.deleted ? rxSumma(target) : [];
  if (!summa.length) { if (row) row.remove(); return; }
  if (!row) { row = document.createElement('div'); row.className = 'rx-row'; row.dataset.for = Number(target); }
  row.classList.toggle('me', b.classList.contains('me'));
  row.classList.toggle('them', b.classList.contains('them'));
  row.innerHTML = '';
  for (const s of summa) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'rx-chip' + (s.mine ? ' mine' : '');
    const namn = s.vem.map((v) => (v === state.username ? T('Du') : v));
    c.title = namn.join(', ');
    c.setAttribute('aria-label', s.e + ' ' + s.vem.length + ': ' + namn.join(', ') + (s.mine ? ' (' + T('klicka för att ta bort din') + ')' : ''));
    c.innerHTML = '<span class="rx-e">' + esc(s.e) + '</span><span class="rx-n">' + s.vem.length + '</span>';
    c.addEventListener('click', (e) => { e.stopPropagation(); rxToggle(target, s.e); });
    row.appendChild(c);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'rx-chip rx-add'; add.title = T('Lägg till reaktion'); add.setAttribute('aria-label', T('Lägg till reaktion'));
  add.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="12" r="8"/><path d="M8 14s1.1 1.6 3 1.6 3-1.6 3-1.6M8.5 9.5h.01M13.5 9.5h.01"/><path d="M19 2v5M16.5 4.5h5"/></svg>';
  add.addEventListener('click', (e) => { e.stopPropagation(); openEmojiPick(add.getBoundingClientRect(), (em) => rxToggle(target, em, true)); });
  row.appendChild(add);
  const efter = b;
  if (efter.nextElementSibling !== row) efter.after(row);
}
// Efter regroup: varje rad direkt efter sin bubbla, inga föräldralösa rader, och alla kända reaktioner ritade
function rxPlacera() {
  const body = $('chat-body'); if (!body || !active) return;
  body.querySelectorAll(':scope > .rx-row').forEach((r) => { if (!body.querySelector('.bubble[data-id="' + r.dataset.for + '"]')) r.remove(); });
  const mal = new Set(); for (const r of rxMap(active).values()) mal.add(r.m);
  for (const t of mal) rxRita(t);
}

// Lägg till eller ta bort min reaktion. bara = true: lägg bara till (från väljaren; finns den redan händer inget)
const rxPagar = new Set();
async function rxToggle(target, emoji, bara) {
  if (!active || !state) return;
  const meta = msgMeta[target];
  if (!meta || meta.deleted || meta.unreadable) return;
  const conv = { kind: active.kind, id: active.id, key: active.key };
  const map = rxMap(conv);
  let egen = null;
  for (const [id, r] of map) if (r.mine && r.m === String(target) && r.e === emoji) { egen = [id, r]; break; }
  const on = egen ? (bara ? true : !egen[1].on) : true;
  if (egen && egen[1].on === on) return;
  const las = target + '|' + emoji; if (rxPagar.has(las)) return; rxPagar.add(las);
  sparaSenast(emoji);
  const author = meta.mine ? state.username : (meta.sender || (active.kind === 'contact' ? active.name : ''));
  const reply = { id: String(target), u: author, t: (meta.text || '').slice(0, 60), img: !!meta.img };
  const ax = { t: 'rx', m: String(target), e: emoji, on };
  const c = on ? tf('Reagerade med {e}', { e: emoji }) : tf('Tog bort reaktionen {e}', { e: emoji });
  // Visa direkt; servern får posten strax efter
  const fore = egen ? { ...egen[1] } : null;
  const tmpId = egen ? egen[0] : 'tmp' + Date.now();
  map.set(tmpId, { m: String(target), e: emoji, on, who: state.username, mine: true });
  rxRita(target);
  try {
    if (egen) await editCtrl(conv, egen[0], ax, c, reply);
    else { const id = await sendCtrl(conv, ax, c, reply); map.delete(tmpId); map.set(String(id), { m: String(target), e: emoji, on, who: state.username, mine: true }); }
  } catch (e) {
    if (fore) map.set(tmpId, fore); else map.delete(tmpId);
    rxRita(target);
    toast(e.message || T('Kunde inte reagera.'));
  } finally { rxPagar.delete(las); }
}

// ===== Verktygsrad vid hovring =====
const msgTools = $('msg-tools');
let mtBubble = null, mtHideT = null;
function mtVisa(b) {
  const id = b.dataset.id, meta = msgMeta[id];
  if (!meta || meta.deleted || meta.unreadable || !active) return;
  clearTimeout(mtHideT);
  if (mtBubble === b && msgTools.classList.contains('open')) return;
  mtBubble = b;
  msgTools.innerHTML = '';
  for (const e of RX_SNABB) {
    const k = document.createElement('button'); k.type = 'button'; k.className = 'mt-e'; k.textContent = e; k.title = tf('Reagera med {e}', { e });
    k.addEventListener('click', (ev) => { ev.stopPropagation(); rxToggle(id, e); mtGom(true); });
    msgTools.appendChild(k);
  }
  const knapp = (cls, title, svg, run) => {
    const k = document.createElement('button'); k.type = 'button'; k.className = 'mt-i ' + cls; k.title = T(title); k.setAttribute('aria-label', T(title)); k.innerHTML = svg;
    k.addEventListener('click', (ev) => { ev.stopPropagation(); run(k); });
    msgTools.appendChild(k);
  };
  msgTools.appendChild(Object.assign(document.createElement('span'), { className: 'mt-sep' }));
  knapp('mt-more-e', 'Fler reaktioner', '<svg viewBox="0 0 24 24"><circle cx="11" cy="12" r="8"/><path d="M8 14s1.1 1.6 3 1.6 3-1.6 3-1.6M8.5 9.5h.01M13.5 9.5h.01"/><path d="M19 2v5M16.5 4.5h5"/></svg>', (k) => { const r = k.getBoundingClientRect(); openEmojiPick(r, (em) => rxToggle(id, em, true)); });
  knapp('mt-reply', 'Svara', ICO.reply, () => { mtGom(true); setReply(id); });
  knapp('mt-ctx', 'Mer', '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>', (k) => { const r = k.getBoundingClientRect(); mtGom(true); openCtxMenu(b, r.left, r.bottom + 4); });
  msgTools.classList.add('open');
  const r = b.getBoundingClientRect(), w = msgTools.offsetWidth, h = msgTools.offsetHeight;
  let x = b.classList.contains('me') ? r.left - 8 - w + 40 : r.right - 40;
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  let y = r.top - h + 6;
  const chatTop = $('chat-body').getBoundingClientRect().top;
  if (y < chatTop + 2) y = Math.min(r.bottom - 6, innerHeight - h - 8);
  msgTools.style.left = x + 'px'; msgTools.style.top = y + 'px';
}
function mtGom(nu) {
  clearTimeout(mtHideT);
  const gor = () => { msgTools.classList.remove('open'); mtBubble = null; };
  if (nu) gor(); else mtHideT = setTimeout(gor, 220);
}
$('chat-body').addEventListener('mouseover', (e) => {
  if (e.target.closest('.rx-row')) return;
  const b = e.target.closest('.bubble'); if (!b || !b.dataset.id) return;
  if (ctxMenu.classList.contains('open') || emojiPick.classList.contains('open')) return;
  mtVisa(b);
});
$('chat-body').addEventListener('mouseleave', () => mtGom());
$('chat-body').addEventListener('mouseout', (e) => { const b = e.target.closest('.bubble'); if (b && !b.contains(e.relatedTarget) && !msgTools.contains(e.relatedTarget)) mtGom(); });
msgTools.addEventListener('mouseenter', () => clearTimeout(mtHideT));
msgTools.addEventListener('mouseleave', () => mtGom());
$('chat-body').addEventListener('scroll', () => mtGom(true), { passive: true });

// Högerklicksmenyn får snabbreaktioner överst
const _openCtxMenu = openCtxMenu;
openCtxMenu = function (bubble, x, y) {
  _openCtxMenu(bubble, x, y);
  const id = bubble.dataset.id, meta = msgMeta[id];
  if (!ctxMenu.classList.contains('open') || !meta || meta.deleted || meta.unreadable) return;
  mtGom(true);
  const rad = document.createElement('div'); rad.className = 'ctx-rx';
  for (const e of RX_SNABB) {
    const k = document.createElement('button'); k.type = 'button'; k.textContent = e; k.title = tf('Reagera med {e}', { e });
    k.addEventListener('click', () => { closeCtxMenu(); rxToggle(id, e); });
    rad.appendChild(k);
  }
  const fler = document.createElement('button'); fler.type = 'button'; fler.className = 'ctx-rx-more'; fler.title = T('Fler reaktioner'); fler.textContent = '+';
  fler.addEventListener('click', () => { const r = fler.getBoundingClientRect(); closeCtxMenu(); openEmojiPick(r, (em) => rxToggle(id, em, true)); });
  rad.appendChild(fler);
  ctxMenu.prepend(rad);
  const mh = ctxMenu.offsetHeight, mw = ctxMenu.offsetWidth;
  ctxMenu.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + 'px';
  ctxMenu.style.top = Math.max(8, Math.min(y, innerHeight - mh - 8)) + 'px';
};

// ===== Emoji-väljaren =====
const emojiPick = $('emoji-pick');
const SENAST_KEY = 'adraze-chatt-emoji-senast';
function senast() { try { const a = JSON.parse(localStorage.getItem(SENAST_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length <= 32).slice(0, 24) : []; } catch { return []; } }
function sparaSenast(e) { const a = senast().filter((x) => x !== e); a.unshift(e); try { localStorage.setItem(SENAST_KEY, JSON.stringify(a.slice(0, 24))); } catch {} }
const EMOJI_NAMN = new Map(); for (const k of EMOJI_KAT) for (const [e, kw] of k.e) EMOJI_NAMN.set(e, kw);
const KAT_IKON = { senast: '🕘', smileys: '😀', gester: '👋', hjartan: '❤️', natur: '🌿', mat: '🍕', aktivitet: '⚽', resor: '🚗', saker: '💡', flaggor: '🏳️' };
let epOnPick = null, epKat = 'smileys';
function epFlikar() {
  const tabs = $('ep-tabs'); tabs.innerHTML = '';
  const lista = [{ id: 'senast', namn: 'Senast använda' }, ...EMOJI_KAT.map((k) => ({ id: k.id, namn: k.namn }))];
  for (const k of lista) {
    if (k.id === 'senast' && !senast().length) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ep-tab' + (epKat === k.id ? ' on' : ''); b.textContent = KAT_IKON[k.id] || '•'; b.title = T(k.namn);
    b.addEventListener('click', () => { if ($('ep-search').value) { $('ep-search').value = ''; epRita(); } epKat = k.id; epMarkera(); const h = $('ep-grid').querySelector('.ep-cat[data-k="' + k.id + '"]'); if (h) $('ep-grid').scrollTop = h.offsetTop - 4; });
    b.dataset.k = k.id;
    tabs.appendChild(b);
  }
}
function epMarkera() { $('ep-tabs').querySelectorAll('.ep-tab').forEach((t) => t.classList.toggle('on', t.dataset.k === epKat)); }
function epKnapp(grid, e) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ep-e'; b.textContent = e;
  const namn = (EMOJI_NAMN.get(e) || '').split(' ').slice(0, 3).join(' ');
  b.setAttribute('aria-label', namn || e);
  b.addEventListener('mouseenter', () => { $('ep-prev').textContent = e; $('ep-name').textContent = namn; });
  b.addEventListener('click', () => { const f = epOnPick; closeEmojiPick(); sparaSenast(e); if (f) f(e); });
  grid.appendChild(b);
}
// Utan sökning: alla kategorier efter varandra (Senast använda först); flikarna hoppar till sin kategori
function epRita() {
  const grid = $('ep-grid'); grid.innerHTML = '';
  const sok = $('ep-search').value.trim().toLowerCase();
  const rubrik = (id, text) => { const h = document.createElement('div'); h.className = 'ep-cat'; h.dataset.k = id; h.textContent = text; grid.appendChild(h); };
  if (sok) {
    rubrik('sok', T('Sökresultat'));
    const lista = [];
    for (const k of EMOJI_KAT) for (const [e, kw] of k.e) if (e === sok || kw.split(' ').some((w) => w.startsWith(sok)) || kw.includes(sok)) lista.push(e);
    if (!lista.length) { const t = document.createElement('div'); t.className = 'ep-empty'; t.textContent = T('Inga emojier hittades.'); grid.appendChild(t); }
    for (const e of lista) epKnapp(grid, e);
    grid.scrollTop = 0;
    return;
  }
  const s = senast();
  if (s.length) { rubrik('senast', T('Senast använda')); for (const e of s) epKnapp(grid, e); }
  for (const k of EMOJI_KAT) { rubrik(k.id, T(k.namn)); for (const [e] of k.e) epKnapp(grid, e); }
  grid.scrollTop = 0;
}
function openEmojiPick(rect, onPick) {
  epOnPick = onPick;
  if (!$('ep-search').value) epKat = senast().length ? 'senast' : 'smileys';
  $('ep-search').value = ''; $('ep-prev').textContent = ''; $('ep-name').textContent = '';
  epFlikar(); epRita();
  emojiPick.classList.add('open');
  const w = emojiPick.offsetWidth, h = emojiPick.offsetHeight;
  let x = rect.right - w, y = rect.top - h - 8;
  if (y < 8) y = Math.min(rect.bottom + 8, innerHeight - h - 8);
  emojiPick.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  emojiPick.style.top = Math.max(8, y) + 'px';
  setTimeout(() => $('ep-search').focus(), 20);
}
function closeEmojiPick() { emojiPick.classList.remove('open'); epOnPick = null; }
$('ep-search').addEventListener('input', epRita);
$('ep-grid').addEventListener('scroll', () => {
  if ($('ep-search').value) return;
  const g = $('ep-grid'); let k = null;
  for (const h of g.querySelectorAll('.ep-cat')) { if (h.offsetTop - 8 <= g.scrollTop) k = h.dataset.k; else break; }
  if (k && k !== epKat) { epKat = k; epMarkera(); }
}, { passive: true });
$('ep-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); const f = $('ep-grid').querySelector('.ep-e'); if (f) f.click(); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEmojiPick(); }
});
document.addEventListener('mousedown', (e) => {
  if (emojiPick.classList.contains('open') && !emojiPick.contains(e.target) && !e.target.closest('.mt-more-e, .rx-add, #chat-emoji, .ctx-rx-more')) closeEmojiPick();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && emojiPick.classList.contains('open')) { e.stopImmediatePropagation(); closeEmojiPick(); } }, true);

// Emoji i textrutan
$('chat-emoji').addEventListener('click', (e) => {
  if (emojiPick.classList.contains('open')) { closeEmojiPick(); return; }
  const r = $('chat-emoji').getBoundingClientRect();
  openEmojiPick(r, (em) => {
    const inp = chatInput, s0 = inp.selectionStart ?? inp.value.length, s1 = inp.selectionEnd ?? s0;
    inp.value = inp.value.slice(0, s0) + em + inp.value.slice(s1);
    inp.focus(); inp.selectionStart = inp.selectionEnd = s0 + em.length;
    inp.dispatchEvent(new Event('input'));
  });
});
