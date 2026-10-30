/* AdRaze-chatten: vänner, DM och grupper med änd-till-änd-kryptering.
 * Portad från Säkerkoll-communityn (samma krypto och samma format på meddelandena).
 * Sidan pratar aldrig direkt med nätet: allt går via window.chatt.api (huvudprocessen lägger på
 * AdRaze-kontots token). Privata nyckeln ligger i IndexedDB per chattprofil och lämnar aldrig datorn. */
'use strict';

const $ = (id) => document.getElementById(id);
const T = (s) => (window.t ? window.t(s) : s);
function tf(s, v) { let o = T(s); for (const k in v) o = o.split('{' + k + '}').join(String(v[k])); return o; }

// ===== Val per dator =====
const PREF_KEY = 'adraze-chatt-prefs';
const CHAT_DEFAULTS = { enter: true, sound: false, notify: true, blur: false, compact: false };
function chatPrefs() { let o = {}; try { o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch {} return Object.assign({}, CHAT_DEFAULTS, o); }
function chatPref(k) { return chatPrefs()[k]; }
function setChatPref(k, v) { const p = chatPrefs(); p[k] = v; try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} applyChatPrefs(); }
function applyChatPrefs() { const p = chatPrefs(), h = document.documentElement; h.classList.toggle('c-blur', !!p.blur); h.classList.toggle('c-compact', !!p.compact); }
applyChatPrefs();

// ===== Tema + panel =====
function setTheme(th) { document.documentElement.dataset.theme = th === 'dark' ? 'dark' : 'light'; }
try { setTheme(window.chatt.boot().theme); } catch {}
window.chatt.onTheme(setTheme);
let panelVisible = true;
let fullView = false;
$('btn-close').addEventListener('click', () => window.chatt.close());
$('btn-expand').addEventListener('click', () => setFull(!fullView));
function setFull(on) {
  fullView = !!on;
  document.documentElement.classList.toggle('full', fullView);
  $('btn-expand').title = fullView ? T('Lämna helskärm') : T('Helskärm');
  window.chatt.expand(fullView);
  const body = $('chat-body'); if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 60);
}
window.chatt.onVisible((v) => {
  panelVisible = v;
  if (!state) return;
  if (v) { if (active) { pollMessages(false); startPolling(); } refreshContacts(); refreshGroups(); }
  else { stopPolling(); closeCtxMenu(); }
});

// ===== Krypto (samma som Säkerkoll, så formatet är kompatibelt) =====
const PBKDF2_ITERS = 300000;
const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function fromB64(str) { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function sha256(str) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(str))); }
// Chatten låses upp av AdRaze-kontot: servern lämnar ut kontots hemlighet (bara till den inloggade),
// ur den härleds nyckeln som låser den privata nyckeln och beviset (login_hash). Ingen kod att spara.
async function kontoNyckel() {
  const r = await GET('/nyckel');
  const wrapKey = await crypto.subtle.importKey('raw', await sha256('adraze-chatt-wrap-v1:' + r.secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { loginHash: b64(await sha256('adraze-chatt-auto-v1:' + r.secret)), wrapKey };
}
async function genKeypair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  return { publicKeyB64: b64(pubRaw), pkcs8 };
}
async function wrapPrivate(pkcs8, wrapKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, pkcs8));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv, 0); blob.set(ct, 12); return b64(blob);
}
async function unwrapPrivate(encPrivB64, wrapKey) {
  const blob = fromB64(encPrivB64);
  const pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, wrapKey, blob.slice(12)));
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
}
async function deriveSharedKey(priv, theirPubB64) {
  const theirPub = await crypto.subtle.importKey('raw', fromB64(theirPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: theirPub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptMsg(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv, 0); blob.set(ct, 12); return b64(blob);
}
async function decryptMsg(key, ctB64) {
  const blob = fromB64(ctB64);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, key, blob.slice(12)));
}
async function aesEncryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv, 0); blob.set(ct, 12); return b64(blob);
}
async function aesDecryptBytes(key, ctB64) {
  const blob = fromB64(ctB64);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, key, blob.slice(12)));
}
async function genGroupKey() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { key, raw: new Uint8Array(await crypto.subtle.exportKey('raw', key)) };
}
async function wrapGroupKey(rawGK, theirPubB64) { return aesEncryptBytes(await deriveSharedKey(myPriv, theirPubB64), rawGK); }
async function unwrapGroupKey(envB64, wrapperPubB64) {
  const raw = await aesDecryptBytes(await deriveSharedKey(myPriv, wrapperPubB64), envB64);
  // extractable så medlemmar kan paketera om gruppnyckeln när de lägger till fler
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}
// ===== IndexedDB: privata nyckeln per chattprofil ('priv:<id>'), olika konton delar aldrig nyckel =====
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('adraze-chatt-e2e', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const t = db.transaction('keys', 'readonly'); const q = t.objectStore('keys').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbDel(k) { const db = await idbOpen(); return new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function storeKey(priv) { await idbSet('priv:' + state.id, { key: priv, pub: state.public_key }); }

// ===== State =====
let state = null;           // { id, username, public_key, avatar, bubble }
let myPriv = null;
let active = null;          // { kind:'contact'|'group', id, name, key, avatar? }
const sharedCache = {}, groupKeyCache = {}, lastTs = {}, lastSync = {}, prevUnread = {}, pubKeyCache = {};
let pollTimer = null, bgTimer = null;
let contactsCache = [], blockedCache = [], groupsCache = [];
let unreadContacts = 0, unreadGroups = 0;

// ===== API =====
const ERR = {
  not_contacts: 'Ni är inte vänner längre.', user_not_found: 'Hittade ingen med det användarnamnet.', cant_add_self: 'Det är ju du själv.',
  blocked: 'Det går inte att lägga till den personen.', requests_closed: 'Personen tar inte emot vänförfrågningar just nu.',
  wrong_code: 'Fel kod.', invalid_recovery: 'Fel lösenord.', not_member: 'Du är inte med i gruppen.', not_admin: 'Bara gruppens admins kan göra det.',
  cant_kick_owner: 'Gruppens ägare kan inte tas bort.', group_full: 'Gruppen är full.', too_many: 'Du har för många stickers. Ta bort några först.',
  invalid_avatar: 'Bilden är för stor eller i fel format.', no_pending_request: 'Förfrågan finns inte längre.', already_deleted: 'Meddelandet är redan borttaget.',
  not_sender: 'Du kan bara ändra dina egna meddelanden.', cant_demote_owner: 'Gruppens ägare är alltid admin.', cant_block_self: 'Du kan inte blockera dig själv.',
  cant_report_self: 'Du kan inte rapportera dig själv.', no_relation: 'Du kan bara rapportera någon du har kontakt med.', details_required: 'Beskriv kort vad det gäller.',
  invalid_username: 'Användarnamn: 3–20 tecken, bara bokstäver, siffror och _.', username_taken: 'Användarnamnet är upptaget. Välj ett annat.',
  same_username: 'Det är redan ditt användarnamn.', invalid_login: 'Fel kod.', bad_attachment: 'Bilden kunde inte bifogas. Försök igen.',
  not_found: 'Finns inte längre.', forbidden: 'Du har inte tillgång till det här.', invalid_input: 'Något i förfrågan var fel.', invalid_url: 'Ogiltig länk.',
};
class ApiError extends Error { constructor(msg, data, status) { super(msg); this.data = data || {}; this.status = status || 0; } }
async function api(method, path, opts = {}) {
  let r;
  try { r = await window.chatt.api({ method, path, query: opts.query, body: opts.body }); }
  catch { throw new ApiError(T('Kunde inte nå servern. Kontrollera din uppkoppling.'), { error: 'network' }, 0); }
  const j = (r && r.json) || {};
  const status = r ? r.status : 0;
  if (status === 0) throw new ApiError(T('Kunde inte nå servern. Kontrollera din uppkoppling.'), { error: 'network' }, 0);
  if (status >= 200 && status < 300 && j.ok !== false) return j;
  if (status === 403 && j.error === 'suspended') { showSuspended(j.message); throw new ApiError(j.message || T('Chatten är avstängd för ditt konto.'), j, status); }
  if (status === 403 && j.error === 'no_profile' && state) { resetAll(); showView('create'); }
  let msg = j.message || (ERR[j.error] ? T(ERR[j.error]) : '');
  if (!msg && typeof j.error === 'string' && /\s/.test(j.error)) msg = T(j.error);   // AdRaze-routerns fel är meningar
  if (!msg) msg = status === 401 ? T('Logga in igen för att chatta.') : T('Något gick fel. Försök igen.');
  throw new ApiError(msg, j, status);
}
const GET = (path, query) => api('GET', path, { query });
const POST = (path, body) => api('POST', path, { body: body || {} });

// ===== Hjälp =====
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function initials(name) { return (name || '?').slice(0, 2).toUpperCase(); }
const validUsername = (u) => /^[A-Za-z0-9_]{3,20}$/.test(u);
const safeImg = (u) => typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : null;
const avatarMap = {};
function rememberAvatar(username, avatar) { if (username) avatarMap[username.toLowerCase()] = safeImg(avatar); }
function avatarFor(username) { return avatarMap[(username || '').toLowerCase()] || null; }
function avatarInner(name) { const a = avatarFor(name); return a ? '<img class="av-img" alt="" src="' + esc(a) + '">' : esc(initials(name)); }
function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return t;
  return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + t;
}
function durationSince(ts) {
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  if (days < 1) return T('sedan idag');
  if (days === 1) return T('1 dag');
  if (days < 30) return tf('{n} dagar', { n: days });
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? T('1 månad') : tf('{n} månader', { n: months });
  return tf('{n} år', { n: Math.floor(days / 365) });
}
async function busy(btn, label, fn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = T(label);
  try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}
let toastT = null;
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }

// ===== Egna dialogrutor (alert/confirm/prompt) =====
let dlgResolve = null;
function dialog(text, o = {}) {
  return new Promise((res) => {
    if (dlgResolve) dlgResolve(null);
    dlgResolve = res;
    $('dlg-text').textContent = text;
    const inp = $('dlg-input');
    inp.hidden = !o.prompt; inp.value = o.value || '';
    $('dlg-cancel').hidden = !!o.alert;
    const ok = $('dlg-ok'); ok.textContent = o.okLabel || 'OK'; ok.classList.toggle('danger', !!o.danger);
    $('modal-dialog').classList.add('open');
    setTimeout(() => (o.prompt ? inp : ok).focus(), 30);
    if (o.prompt) inp.select();
  });
}
function dlgDone(v) { $('modal-dialog').classList.remove('open'); const r = dlgResolve; dlgResolve = null; if (r) r(v); }
$('dlg-ok').addEventListener('click', () => dlgDone($('dlg-input').hidden ? true : $('dlg-input').value));
$('dlg-cancel').addEventListener('click', () => dlgDone(null));
$('dlg-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('dlg-ok').click(); } });
const alertBox = (text) => dialog(text, { alert: true });
const confirmBox = (text, okLabel, danger) => dialog(text, { okLabel: okLabel || 'OK', danger });
const promptBox = (text, value) => dialog(text, { prompt: true, value });

// ===== Vyer =====
const VIEWS = ['loading', 'error', 'suspended', 'create', 'app'];
function showView(name) {
  for (const v of VIEWS) $('view-' + v).hidden = v !== name;
  const inApp = name === 'app';
  $('btn-profile').hidden = !inApp; $('btn-settings').hidden = !inApp;
}
function showSuspended(message) {
  resetAll();
  $('suspended-text').textContent = message || T('Ditt chattkonto är avstängt.');
  showView('suspended');
}

// ===== Start =====
async function start() {
  showView('loading');
  let r;
  try { r = await GET('/jag'); }
  catch (e) {
    if (e.data && e.data.error === 'suspended') return;
    $('error-text').textContent = e.message || T('Kontrollera din uppkoppling och försök igen.');
    showView('error'); return;
  }
  if (!r.profil) { resetCreate(r.forslag); showView('create'); setTimeout(() => { $('create-username').focus(); $('create-username').select(); }, 50); return; }
  state = { id: String(r.id), username: r.username, public_key: r.public_key, avatar: safeImg(r.avatar), bubble: r.bubble || null };
  if (r.auto) {
    let stored = null; try { stored = await idbGet('priv:' + state.id); } catch {}
    if (stored && stored.key && stored.pub === state.public_key) { myPriv = stored.key; enterApp(); return; }
    if (stored) { try { await idbDel('priv:' + state.id); } catch {} }   // gammal nyckel (profilen raderad och skapad igen)
  }
  try { await unlockWithAccount(!r.auto); }
  catch (e) { $('error-text').textContent = e.message || T('Kunde inte öppna chatten.'); showView('error'); }
}
$('btn-retry').addEventListener('click', start);

// Lås upp med AdRaze-kontot. Profiler från tiden med hemlig kod får nya nycklar kopplade till kontot.
async function unlockWithAccount(fromCode) {
  const k = await kontoNyckel();
  let priv;
  if (fromCode) {
    const { publicKeyB64, pkcs8 } = await genKeypair();
    const encPriv = await wrapPrivate(pkcs8, k.wrapKey);
    await POST('/users/ny-nyckel', { public_key: publicKeyB64, enc_priv: encPriv, login_hash: k.loginHash });
    priv = await unwrapPrivate(encPriv, k.wrapKey);
    state.public_key = publicKeyB64;
  } else {
    const r = await POST('/users/login', { login_hash: k.loginHash });
    priv = await unwrapPrivate(r.enc_priv, k.wrapKey);
    state.public_key = r.public_key || state.public_key;
    if (r.avatar !== undefined) state.avatar = safeImg(r.avatar);
  }
  await storeKey(priv);
  myPriv = priv;
  enterApp();
}

// ===== Välj användarnamn (första gången) =====
function resetCreate(forslag) {
  $('create-username').value = forslag || ''; $('create-error').textContent = '';
}
$('create-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });
$('btn-create').addEventListener('click', () => busy($('btn-create'), 'Startar…', async () => {
  const err = $('create-error'); err.textContent = '';
  const username = $('create-username').value.trim();
  if (!validUsername(username)) { err.textContent = T('Användarnamn: 3–20 tecken, bara bokstäver, siffror och _.'); return; }
  try {
    const k = await kontoNyckel();
    const { publicKeyB64, pkcs8 } = await genKeypair();
    const encPriv = await wrapPrivate(pkcs8, k.wrapKey);
    const r = await POST('/registrera', { username, login_hash: k.loginHash, public_key: publicKeyB64, enc_priv: encPriv });
    const priv = await unwrapPrivate(encPriv, k.wrapKey);
    state = { id: String(r.id), username: r.username, public_key: publicKeyB64, avatar: null, bubble: null };
    await storeKey(priv);
    myPriv = priv;
    enterApp();
  } catch (e) { err.textContent = e.message || T('Kunde inte skapa chattprofilen.'); }
}));

// ===== Gå in i chatten =====
function enterApp() {
  showView('app');
  rememberAvatar(state.username, state.avatar);
  $('my-avatar').innerHTML = avatarInner(state.username);
  rememberBubble(state.username, state.bubble);
  myBubble = state.bubble || null;
  GET('/users/me').then((r) => {
    myBubble = r.bubble || null; state.bubble = myBubble;
    state.avatar = safeImg(r.avatar); rememberAvatar(state.username, state.avatar); $('my-avatar').innerHTML = avatarInner(state.username);
  }).catch(() => {});
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch {}
  closeChat();
  refreshContacts();
  refreshGroups();
  startBgPolling();
}
// Allt i minnet bort (vid avstängning/radering). Utloggning och kontobyte river hela panelen i huvudprocessen.
function resetAll() {
  closeChat();
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  state = null; myPriv = null; active = null; myBubble = null;
  contactsCache = []; blockedCache = []; groupsCache = [];
  for (const k in bubbleMap) delete bubbleMap[k];
  for (const c of [sharedCache, groupKeyCache, lastTs, lastSync, prevUnread, pubKeyCache, msgMeta, groupNames, groupAvatars]) for (const k in c) delete c[k];
  for (const k in attachmentUrls) { try { URL.revokeObjectURL(attachmentUrls[k]); } catch {} delete attachmentUrls[k]; }
  for (const k in attachmentBytes) delete attachmentBytes[k];
  resetStickers();
  $('contacts-list').innerHTML = ''; $('groups-list').innerHTML = ''; $('incoming-list').innerHTML = ''; $('outgoing-list').innerHTML = '';
  document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
  closeProfile();
  unreadContacts = 0; unreadGroups = 0; pushUnread();
}

// ===== Publika nycklar =====
async function getPubKey(userId) {
  userId = String(userId);
  if (userId === state.id) return state.public_key;
  if (pubKeyCache[userId]) return pubKeyCache[userId];
  const k = await GET('/users/key', { id: userId });
  pubKeyCache[userId] = k.public_key;
  return k.public_key;
}

// ===== Kontakter =====
$('btn-add').addEventListener('click', addContact);
$('add-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') addContact(); });
async function addContact() {
  const input = $('add-username'), msg = $('add-msg');
  msg.textContent = ''; msg.className = 'msg-error';
  const username = input.value.trim();
  if (!validUsername(username)) { msg.textContent = T('Skriv ett giltigt användarnamn.'); return; }
  if (username.toLowerCase() === state.username.toLowerCase()) { msg.textContent = T('Det är ju du själv.'); return; }
  try {
    const r = await POST('/contacts/request', { username });
    msg.className = 'msg-ok';
    msg.textContent = r.status === 'accepted' ? T('Ni är nu vänner!') : T('Förfrågan skickad.');
    input.value = '';
    refreshContacts();
  } catch (e) { msg.textContent = e.message; }
}
function reqRow(c, buttons, note) {
  const div = document.createElement('div'); div.className = 'req-item';
  div.innerHTML = '<span class="avatar sm">' + avatarInner(c.username) + '</span><span class="cname">' + esc(c.username) + '</span>';
  if (note) { const n = document.createElement('span'); n.className = 'mono note'; n.setAttribute('translate', 'yes'); n.textContent = T(note); div.appendChild(n); }
  for (const b of buttons) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = b.cls; btn.textContent = T(b.label); btn.setAttribute('translate', 'yes');
    btn.addEventListener('click', async () => { btn.disabled = true; try { await b.run(); } catch (e) { alertBox(e.message); } finally { btn.disabled = false; refreshContacts(); } });
    div.appendChild(btn);
  }
  return div;
}
let refreshingContacts = false;
async function refreshContacts() {
  if (!state || refreshingContacts) return;
  refreshingContacts = true;
  try {
    let r; try { r = await GET('/contacts'); } catch { return; }
    if (!state) return;
    contactsCache = r.contacts || []; blockedCache = r.blocked || [];
    [...contactsCache, ...(r.incoming || []), ...(r.outgoing || [])].forEach((c) => rememberAvatar(c.username, c.avatar));
    contactsCache.forEach((c) => rememberBubble(c.username, c.bubble));
    const unread = {}; try { const o = await GET('/messages/overview'); for (const u of o.unread || []) unread[String(u.id)] = u.n; } catch {}
    checkNotify('c:', contactsCache.map((c) => ({ id: c.id, unread: unread[c.id] || 0 })));
    unreadContacts = 0;
    const cl = $('contacts-list'); cl.innerHTML = '';
    if (!contactsCache.length) cl.innerHTML = '<div class="empty-hint" translate="yes">' + esc(T('Inga vänner än. Lägg till någon med användarnamnet ovan.')) + '</div>';
    for (const c of contactsCache) {
      const isOpen = active && active.kind === 'contact' && active.id === c.id;
      const div = document.createElement('div'); div.className = 'contact' + (isOpen ? ' active' : '');
      div.innerHTML = '<span class="avatar">' + avatarInner(c.username) + '</span><span class="cname">' + esc(c.username) + '</span>';
      const n = unread[c.id] || 0;
      if (n && !(isOpen && panelVisible)) { unreadContacts += n; const b = document.createElement('span'); b.className = 'badge'; b.textContent = n; div.appendChild(b); }
      div.addEventListener('click', () => openContact(c));
      cl.appendChild(div);
    }
    const inc = $('incoming-list'); inc.innerHTML = ''; $('incoming-sec').hidden = !(r.incoming || []).length;
    for (const c of r.incoming || []) {
      inc.appendChild(reqRow(c, [
        { label: 'Acceptera', cls: 'btn small', run: () => POST('/contacts/accept', { username: c.username }) },
        { label: 'Neka', cls: 'btn secondary small', run: () => POST('/contacts/remove', { username: c.username }) },
      ]));
    }
    const out = $('outgoing-list'); out.innerHTML = ''; $('outgoing-sec').hidden = !(r.outgoing || []).length;
    for (const c of r.outgoing || []) out.appendChild(reqRow(c, [{ label: 'Avbryt', cls: 'link-btn', run: () => POST('/contacts/remove', { username: c.username }) }], 'väntar…'));
    // Vännen borttagen/blockerad medan chatten är öppen → stäng
    if (active && active.kind === 'contact' && !contactsCache.some((c) => c.id === active.id)) closeChat();
    pushUnread();
  } finally { refreshingContacts = false; }
}
function pushUnread() { try { window.chatt.unread(unreadContacts + unreadGroups); } catch {} }

// ===== Profil =====
let profileSelfBio = null, profileOther = null, profileOtherId = null;
const profileModal = $('profile-modal');
function openProfile(id) {
  if (!id) return;
  profileModal.classList.add('open');
  profileModal.firstElementChild.scrollTop = 0;
  $('profile-bio-edit').hidden = true; $('profile-bio').hidden = false; $('profile-bio-editbtn').hidden = true;
  $('bubble-sec').hidden = true; $('account-sec').hidden = true; $('profile-others').hidden = true; $('cam-badge').hidden = true;
  $('profile-username').textContent = '…'; $('profile-avatar').textContent = '';
  GET('/users/profile', { id }).then((r) => {
    const av = safeImg(r.avatar);
    $('profile-avatar').innerHTML = av ? '<img class="av-img" alt="" src="' + esc(av) + '">' : esc(initials(r.username));
    $('profile-username').textContent = r.username;
    $('profile-since').textContent = durationSince(r.created_at);
    $('profile-friends').textContent = r.friends;
    const bioEl = $('profile-bio');
    bioEl.textContent = r.bio || (r.is_self ? T('Du har inte skrivit någon beskrivning än.') : T('Ingen beskrivning än.'));
    bioEl.setAttribute('translate', r.bio ? 'no' : 'yes');
    bioEl.classList.toggle('italic', !r.bio);
    $('profile-bio-editbtn').hidden = !r.is_self;
    $('cam-badge').hidden = !r.is_self;
    profileSelfBio = r.is_self ? (r.bio || '') : null;
    $('bs-status').textContent = '';
    if (r.is_self) { renderAccountSec(); renderBubblePicker(); }
    $('profile-others').hidden = !!r.is_self;
    profileOther = r.is_self ? null : r.username;
    profileOtherId = r.is_self ? null : String(r.id);
  }).catch((e) => { closeProfile(); alertBox(e.message || T('Kunde inte hämta profilen.')); });
}
function closeProfile() { profileModal.classList.remove('open'); }
$('profile-close').addEventListener('click', closeProfile);
profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfile(); });
$('btn-profile').addEventListener('click', () => { if (state) openProfile(state.id); });
['peer-name', 'peer-avatar'].forEach((id) => $(id).addEventListener('click', () => {
  if (!active) return;
  if (active.kind === 'contact') openProfile(active.id); else openMembers();
}));
$('profile-report').addEventListener('click', () => { if (!profileOther) return; const u = profileOther; closeProfile(); openReport({ username: u }); });
$('profile-block').addEventListener('click', async () => {
  if (!profileOther) return; const u = profileOther;
  if (!(await confirmBox(tf('Blockera {u}? Personen tas bort som vän och kan inte kontakta dig. Du kan häva det i chattinställningarna.', { u }), T('Blockera'), true))) return;
  try { await POST('/contacts/block', { username: u }); closeProfile(); if (active && active.kind === 'contact' && active.name === u) closeChat(); refreshContacts(); }
  catch (e) { alertBox(e.message || T('Kunde inte blockera.')); }
});
$('profile-remove').addEventListener('click', async () => {
  if (!profileOther) return; const u = profileOther;
  if (!(await confirmBox(tf('Ta bort {u} som vän? Ni kan inte skriva till varandra förrän någon skickar en ny förfrågan.', { u }), T('Ta bort'), true))) return;
  try { await POST('/contacts/remove', { username: u }); closeProfile(); if (active && active.kind === 'contact' && active.name === u) closeChat(); refreshContacts(); }
  catch (e) { alertBox(e.message || T('Kunde inte ta bort.')); }
});
// Egen beskrivning
const bioInput = $('profile-bio-input');
$('profile-bio-editbtn').addEventListener('click', () => {
  $('profile-bio').hidden = true; $('profile-bio-editbtn').hidden = true; $('profile-bio-edit').hidden = false;
  bioInput.value = profileSelfBio || ''; $('profile-bio-count').textContent = bioInput.value.length + '/300'; bioInput.focus();
});
bioInput.addEventListener('input', () => { $('profile-bio-count').textContent = bioInput.value.length + '/300'; });
$('profile-bio-cancel').addEventListener('click', () => { $('profile-bio-edit').hidden = true; $('profile-bio').hidden = false; $('profile-bio-editbtn').hidden = false; });
$('profile-bio-save').addEventListener('click', () => busy($('profile-bio-save'), 'Sparar…', async () => {
  try {
    const r = await POST('/users/bio', { bio: bioInput.value.trim() || null });
    profileSelfBio = r.bio || '';
    const bioEl = $('profile-bio');
    bioEl.textContent = r.bio || T('Du har inte skrivit någon beskrivning än.');
    bioEl.setAttribute('translate', r.bio ? 'no' : 'yes'); bioEl.classList.toggle('italic', !r.bio);
    $('profile-bio-edit').hidden = true; bioEl.hidden = false; $('profile-bio-editbtn').hidden = false;
  } catch (e) { alertBox(e.message || T('Kunde inte spara.')); }
}));
// Egen profilbild (samma bild som AdRaze-kontot): 256×256 JPEG
$('cam-badge').addEventListener('click', () => $('avatar-input').click());
$('profile-avatar').addEventListener('click', () => { if (!$('cam-badge').hidden) $('avatar-input').click(); });
function loadImageFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error(T('Kunde inte läsa bilden.'))); };
    im.src = url;
  });
}
function squareJpeg(im, size, maxLen) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
  const s = Math.min(im.width, im.height);
  x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size);
  let q = 0.86, url = c.toDataURL('image/jpeg', q);
  while (url.length > maxLen && q > 0.3) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
  return url.length > maxLen ? null : url;
}
$('avatar-input').addEventListener('change', async () => {
  const input = $('avatar-input'), file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { alertBox(T('Välj en bildfil.')); return; }
  try {
    const url = squareJpeg(await loadImageFile(file), 256, 115000);
    if (!url) throw new Error(T('Bilden gick inte att komprimera tillräckligt. Prova en annan.'));
    const r = await POST('/users/avatar', { avatar: url });
    state.avatar = safeImg(r.avatar); rememberAvatar(state.username, state.avatar);
    $('my-avatar').innerHTML = avatarInner(state.username);
    $('profile-avatar').innerHTML = avatarInner(state.username);
    document.querySelectorAll('#chat-body .bubble.me > .bub-av').forEach((el) => { el.innerHTML = avatarInner(state.username); });
    toast(T('Profilbilden är sparad.'));
  } catch (e) { alertBox(e.message || T('Kunde inte spara profilbilden.')); }
});

// ===== Pratbubbla (färg + djur-skin, samma som Säkerkoll) =====
const BUBBLE_COLORS = [null, '#ff4b1f', '#c76a4a', '#4e7a5e', '#2c5ea8', '#6b4fbb', '#c2508a', '#2a8f8a', '#b8862a', '#333333'];
function skSvg(vb, inner) { return '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>'; }
const SK_EYES_ROUND = '<circle fill="#fff" cx="37" cy="53" r="8.5"/><circle fill="#fff" cx="63" cy="53" r="8.5"/>' +
  '<circle fill="#1a1a1a" cx="35" cy="56" r="4.2"/><circle fill="#1a1a1a" cx="61" cy="56" r="4.2"/>' +
  '<circle fill="#fff" cx="36.5" cy="54" r="1.5"/><circle fill="#fff" cx="62.5" cy="54" r="1.5"/>';
const SK_EYES_SLIT = '<circle fill="#fff" cx="37" cy="53" r="8.5"/><circle fill="#fff" cx="63" cy="53" r="8.5"/>' +
  '<ellipse fill="#1a1a1a" cx="35" cy="55.5" rx="3.2" ry="5.8"/><ellipse fill="#1a1a1a" cx="61" cy="55.5" rx="3.2" ry="5.8"/>' +
  '<circle fill="#fff" cx="36.5" cy="53" r="1.5"/><circle fill="#fff" cx="62.5" cy="53" r="1.5"/>';
const SK_PAWS = skSvg('0 0 64 26',
  '<ellipse class="f-light" cx="15" cy="14" rx="13" ry="9"/><ellipse class="f-light" cx="49" cy="14" rx="13" ry="9"/>' +
  '<path class="s-dark" d="M9 9v5M15 7v6M21 9v5M43 9v5M49 7v6M55 9v5" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".45"/>');
const BUBBLE_SKINS = {
  katt: { name: 'Katt', color: '#d9603a',
    head: skSvg('0 0 100 100',
      '<path class="f-body" d="M24 42 L14 6 L46 28 Z"/><path class="f-pink" d="M27 35 L21 15 L39 28 Z"/>' +
      '<path class="f-body" d="M76 42 L86 6 L54 28 Z"/><path class="f-pink" d="M73 35 L79 15 L61 28 Z"/>' +
      '<circle class="f-body" cx="50" cy="57" r="34"/>' +
      '<path class="s-dark" d="M40 28q2 7 0 13M50 25q2 8 0 15M60 28q-2 7 0 13" stroke-width="4" stroke-linecap="round" fill="none" opacity=".7"/>' +
      SK_EYES_SLIT +
      '<ellipse class="f-light" cx="50" cy="73" rx="15" ry="10"/>' +
      '<path class="f-pink" d="M46 68 L54 68 L50 73 Z"/>' +
      '<path d="M50 73v4M50 77q-4 4-8 0M50 77q4 4 8 0" stroke="#3a2a1a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M32 70L12 66M32 75L12 80M68 70L88 66M68 75L88 80" stroke="#3a2a1a" stroke-width="1.5" stroke-linecap="round" opacity=".6"/>'),
    feet: SK_PAWS,
    marks: { pos: 'tr', svg: skSvg('0 0 80 50', '<path class="s-dark" d="M44 -2q-5 9 0 18M60 -2q-7 15-1 32M74 -2q-8 18-2 38" stroke-width="7" stroke-linecap="round" fill="none" opacity=".45"/>') } },
  bjorn: { name: 'Björn', color: '#8a5a3c',
    head: skSvg('0 0 100 100',
      '<circle class="f-body" cx="24" cy="29" r="13"/><circle class="f-light" cx="24" cy="29" r="6.5"/>' +
      '<circle class="f-body" cx="76" cy="29" r="13"/><circle class="f-light" cx="76" cy="29" r="6.5"/>' +
      '<circle class="f-body" cx="50" cy="57" r="34"/>' + SK_EYES_ROUND +
      '<ellipse class="f-light" cx="50" cy="74" rx="17" ry="12"/>' +
      '<ellipse fill="#2a1a12" cx="50" cy="69" rx="6" ry="4.2"/>' +
      '<path d="M50 73v4M50 77q-4 4-7 0M50 77q4 4 7 0" stroke="#2a1a12" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
    feet: SK_PAWS,
    marks: { pos: 'bottom', svg: skSvg('0 0 100 30', '<path class="f-light" d="M0 30L100 30L100 22Q50 4 0 22Z" opacity=".35"/>') } },
  groda: { name: 'Groda', color: '#5aa84f',
    head: skSvg('0 0 100 100',
      '<circle class="f-body" cx="30" cy="34" r="15"/><circle class="f-body" cx="70" cy="34" r="15"/>' +
      '<ellipse class="f-body" cx="50" cy="63" rx="40" ry="29"/>' +
      '<circle fill="#fff" cx="30" cy="34" r="10.5"/><circle fill="#fff" cx="70" cy="34" r="10.5"/>' +
      '<circle fill="#1a1a1a" cx="28" cy="37" r="5"/><circle fill="#1a1a1a" cx="68" cy="37" r="5"/>' +
      '<circle fill="#fff" cx="30" cy="35" r="1.8"/><circle fill="#fff" cx="70" cy="35" r="1.8"/>' +
      '<circle class="f-dark" cx="45" cy="58" r="1.8"/><circle class="f-dark" cx="55" cy="58" r="1.8"/>' +
      '<path d="M26 70q24 18 48 0" stroke="#2a4a1a" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<ellipse class="f-pink" cx="20" cy="70" rx="6" ry="3.5" opacity=".7"/><ellipse class="f-pink" cx="80" cy="70" rx="6" ry="3.5" opacity=".7"/>'),
    feet: skSvg('0 0 64 26', '<path class="f-light" d="M2 22L10 4L16 17L22 4L30 22Z"/><path class="f-light" d="M34 22L42 4L48 17L54 4L62 22Z"/>'),
    marks: { pos: 'tr', svg: skSvg('0 0 80 50', '<circle class="f-dark" cx="60" cy="14" r="7" opacity=".35"/><circle class="f-dark" cx="42" cy="30" r="5" opacity=".35"/><circle class="f-dark" cx="70" cy="36" r="4" opacity=".35"/>') } },
  haj: { name: 'Haj', color: '#5f7f96',
    head: skSvg('0 0 100 100',
      '<path class="f-body" d="M45 22L52 3L63 22Z"/>' +
      '<path class="f-body" d="M50 18C80 18 90 45 88 66C86 84 70 92 50 92C30 92 14 84 12 66C10 45 20 18 50 18Z"/>' +
      '<path class="f-light" d="M18 66C26 88 74 88 82 66C70 78 30 78 18 66Z"/>' +
      '<path class="s-dark" d="M20 50v10M26 48v14" stroke-width="2" stroke-linecap="round" fill="none" opacity=".6"/>' +
      '<circle fill="#1a1a1a" cx="36" cy="50" r="4.5"/><circle fill="#1a1a1a" cx="64" cy="50" r="4.5"/>' +
      '<circle fill="#fff" cx="37.5" cy="48.5" r="1.5"/><circle fill="#fff" cx="65.5" cy="48.5" r="1.5"/>' +
      '<path d="M34 70q16 10 32 0" stroke="#4a1f2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path fill="#fff" d="M38 71l3 5 3-5zM46 73l3 5 3-5zM54 73l3 5 3-5z"/>'),
    feet: skSvg('0 0 64 26', '<path class="f-body" d="M6 24L20 4L28 24Z"/>'),
    marks: { pos: 'bottom', svg: skSvg('0 0 100 30', '<path class="f-light" d="M0 30L100 30L100 20Q50 0 0 20Z" opacity=".45"/>') } },
  alg: { name: 'Älg', color: '#7b5636',
    head: skSvg('0 0 100 100',
      '<path class="f-light" d="M32 36C20 32 8 20 10 6C18 8 24 16 28 24C26 12 30 4 40 2C42 12 38 24 36 36Z"/>' +
      '<path class="f-light" d="M68 36C80 32 92 20 90 6C82 8 76 16 72 24C74 12 70 4 60 2C58 12 62 24 64 36Z"/>' +
      '<ellipse class="f-body" cx="20" cy="46" rx="10" ry="5.5" transform="rotate(-25 20 46)"/><ellipse class="f-body" cx="80" cy="46" rx="10" ry="5.5" transform="rotate(25 80 46)"/>' +
      '<circle class="f-body" cx="50" cy="54" r="29"/>' +
      '<circle fill="#fff" cx="38" cy="50" r="7.5"/><circle fill="#fff" cx="62" cy="50" r="7.5"/>' +
      '<circle fill="#1a1a1a" cx="36.5" cy="52.5" r="3.8"/><circle fill="#1a1a1a" cx="60.5" cy="52.5" r="3.8"/>' +
      '<circle fill="#fff" cx="37.5" cy="51" r="1.3"/><circle fill="#fff" cx="61.5" cy="51" r="1.3"/>' +
      '<ellipse class="f-light" cx="50" cy="78" rx="21" ry="15"/>' +
      '<ellipse fill="#2a1a12" cx="42" cy="80" rx="3.5" ry="2.5"/><ellipse fill="#2a1a12" cx="58" cy="80" rx="3.5" ry="2.5"/>'),
    feet: SK_PAWS, marks: null },
  drake: { name: 'Drake', color: '#3e8f6f',
    head: skSvg('0 0 100 100',
      '<path class="f-light" d="M32 32C26 22 22 12 26 2C34 8 38 18 42 32Z"/><path class="f-light" d="M68 32C74 22 78 12 74 2C66 8 62 18 58 32Z"/>' +
      '<path class="f-dark" d="M20 50L4 44L14 58ZM20 62L2 64L16 70Z"/><path class="f-dark" d="M80 50L96 44L86 58ZM80 62L98 64L84 70Z"/>' +
      '<circle class="f-body" cx="50" cy="57" r="33"/>' +
      '<circle fill="#f2c94c" cx="37" cy="53" r="8.5"/><circle fill="#f2c94c" cx="63" cy="53" r="8.5"/>' +
      '<ellipse fill="#1a1a1a" cx="35.5" cy="55" rx="2.6" ry="6"/><ellipse fill="#1a1a1a" cx="61.5" cy="55" rx="2.6" ry="6"/>' +
      '<circle fill="#fff" cx="37" cy="52" r="1.4"/><circle fill="#fff" cx="63" cy="52" r="1.4"/>' +
      '<ellipse class="f-light" cx="50" cy="75" rx="17" ry="11"/>' +
      '<circle fill="#1f3a2e" cx="44" cy="73" r="2"/><circle fill="#1f3a2e" cx="56" cy="73" r="2"/>' +
      '<path d="M35 80q15 8 30 0" stroke="#1f3a2e" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path fill="#fff" d="M40 81l3 5 3-5zM54 81l3 5 3-5z"/>'),
    feet: SK_PAWS,
    marks: { pos: 'tr', svg: skSvg('0 0 80 50', '<path class="f-dark" d="M62 6l6 8-6 8-6-8zM48 22l5 7-5 7-5-7zM70 28l5 7-5 7-5-7z" opacity=".35"/>') } },
};
const bubbleMap = {};
let myBubble = null;
function cleanBubble(b) {
  if (!b || typeof b !== 'object') return null;
  const color = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : null;
  const frame = typeof b.frame === 'string' && Object.prototype.hasOwnProperty.call(BUBBLE_SKINS, b.frame) ? b.frame : null;
  return color || frame ? { color, frame } : null;
}
function rememberBubble(username, b) { if (username) bubbleMap[username.toLowerCase()] = cleanBubble(b); }
function bubbleFor(username) { return bubbleMap[(username || '').toLowerCase()] || null; }
function isLightColor(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return false;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.62;
}
function applyBubbleStyle(div, style, mine) {
  style = cleanBubble(style);
  if (!style) return;
  const skin = style.frame ? BUBBLE_SKINS[style.frame] : null;
  const body = style.color || (skin ? skin.color : null);
  if (body) { div.style.background = body; div.classList.add('colored'); div.classList.toggle('lightbg', isLightColor(body)); }
  if (skin) {
    div.style.setProperty('--sk-body', body);
    div.classList.add('skin', 'skin-' + style.frame, mine ? 'sk-me' : 'sk-them');
    let html = '<span class="sk-head">' + skin.head + '</span><span class="sk-feet">' + skin.feet + '</span>';
    if (skin.marks) html += '<span class="sk-marks sk-' + skin.marks.pos + '">' + (skin.marks.pos === 'bottom' ? skin.marks.svg.replace('<svg ', '<svg preserveAspectRatio="none" ') : skin.marks.svg) + '</span>';
    div.insertAdjacentHTML('beforeend', html);
  }
}
function clearBubbleStyle(div) {
  div.style.background = ''; div.style.removeProperty('--sk-body');
  div.classList.remove('colored', 'lightbg', 'skin', 'sk-me', 'sk-them');
  Array.from(div.classList).filter((c) => c.startsWith('skin-')).forEach((c) => div.classList.remove(c));
  div.querySelectorAll(':scope > .sk-head, :scope > .sk-feet, :scope > .sk-marks').forEach((el) => el.remove());
}
function makeSampleBubble(style, text) {
  const b = document.createElement('div'); b.className = 'bubble me';
  b.innerHTML = esc(text) + '<span class="time">' + fmtTime(Date.now()) + '</span>';
  applyBubbleStyle(b, style, true); return b;
}
function renderBubblePicker() {
  const cur = myBubble || { color: null, frame: null };
  const pv = $('bs-preview'); pv.innerHTML = '';
  pv.appendChild(makeSampleBubble(cur, T('Så här ser dina meddelanden ut')));
  const fr = $('bs-frames'); fr.innerHTML = '';
  const mk = (frame, label) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bs-frame' + ((cur.frame || null) === frame ? ' on' : '');
    btn.innerHTML = '<span class="bs-thumb" translate="no"></span><span>' + esc(T(label)) + '</span>';
    btn.querySelector('.bs-thumb').appendChild(makeSampleBubble({ color: cur.color, frame }, T('Hej!')));
    btn.addEventListener('click', () => saveBubble({ color: cur.color, frame }));
    fr.appendChild(btn);
  };
  mk(null, 'Ingen');
  for (const k of Object.keys(BUBBLE_SKINS)) mk(k, BUBBLE_SKINS[k].name);
  const sw = $('bs-swatches'); sw.innerHTML = '';
  for (const c of BUBBLE_COLORS) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bs-swatch' + ((cur.color || null) === c ? ' on' : '');
    btn.style.background = c || (cur.frame ? BUBBLE_SKINS[cur.frame].color : 'var(--accent)'); btn.title = c ? c : T('Standard');
    btn.addEventListener('click', () => saveBubble({ color: c, frame: cur.frame }));
    sw.appendChild(btn);
  }
  const custom = document.createElement('label'); custom.className = 'bs-custom'; custom.title = T('Egen färg');
  custom.innerHTML = '<input type="color" value="' + esc(cur.color || (cur.frame ? BUBBLE_SKINS[cur.frame].color : '#ff4b1f')) + '">';
  custom.querySelector('input').addEventListener('change', (e) => saveBubble({ color: e.target.value, frame: cur.frame }));
  sw.appendChild(custom);
  $('bubble-sec').hidden = false;
}
async function saveBubble(style) {
  const st = $('bs-status'); st.textContent = T('Sparar…');
  try {
    const r = await POST('/users/bubble', { color: style.color || null, frame: style.frame || null });
    myBubble = cleanBubble(r.bubble); state.bubble = myBubble;
    rememberBubble(state.username, myBubble);
    renderBubblePicker();
    st.textContent = T('Sparat. Dina vänner ser den nya stilen.');
    document.querySelectorAll('#chat-body .bubble.me').forEach((div) => {
      if (div.classList.contains('unreadable') || div.classList.contains('sticker')) return;
      clearBubbleStyle(div); applyBubbleStyle(div, myBubble, true);
    });
  } catch (e) { st.textContent = e.message || T('Kunde inte spara.'); }
}

// ===== Konto: lösenord för koden + byte av användarnamn =====
const REC_ITERS = 600000;
function accMsg(id, text, ok) { const el = $(id); el.textContent = text || ''; el.classList.toggle('ok', !!ok); }
function accToggle(formId, on) { $(formId).classList.toggle('on', on); }
function renderAccountSec() {
  $('acc-name-cur').textContent = state.username;
  accToggle('acc-name-form', false); $('acc-name-new').value = ''; accMsg('acc-name-msg', '');
  $('account-sec').hidden = false;
}
$('acc-name-btn').addEventListener('click', () => { accToggle('acc-name-form', true); $('acc-name-new').focus(); });
$('acc-name-cancel').addEventListener('click', () => accToggle('acc-name-form', false));
$('acc-name-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('acc-name-save').click(); });
$('acc-name-save').addEventListener('click', () => busy($('acc-name-save'), 'Byter…', async () => {
  accMsg('acc-name-msg', '');
  const nu = $('acc-name-new').value.trim();
  try {
    if (!validUsername(nu)) throw new Error(T('Användarnamn: 3–20 tecken, bara bokstäver, siffror och _.'));
    if (nu === state.username) throw new Error(T('Det är redan ditt användarnamn.'));
    // Nyckeln hänger på kontot, inte på namnet – samma låsta nyckel följer med
    const k = await kontoNyckel();
    const cur = await POST('/users/login', { login_hash: k.loginHash });
    const r = await POST('/users/rename', { new_username: nu, old_login_hash: k.loginHash, new_login_hash: k.loginHash, enc_priv: cur.enc_priv });
    state.username = r.username;
    rememberAvatar(state.username, state.avatar); rememberBubble(state.username, myBubble);
    $('my-avatar').innerHTML = avatarInner(state.username);
    $('profile-username').textContent = state.username;
    renderAccountSec();
    accMsg('acc-name-msg', tf('Klart! Du heter nu {u}.', { u: r.username }), true);
  } catch (e) { accMsg('acc-name-msg', e.message || T('Kunde inte byta namn.')); }
}));

// ===== Chatten (vän + grupp) =====
const chatEl = $('chat');
function showChatUI(name, isGroup, count, avatar) {
  $('layout').classList.add('chatting');
  $('chat-empty').hidden = true;
  $('chat-active').hidden = false;
  $('peer-name').textContent = name;
  const av = $('peer-avatar');
  av.classList.toggle('grp-avatar', !!isGroup);
  if (isGroup) av.innerHTML = avatar ? '<img class="av-img" alt="" src="' + esc(avatar) + '">' : '#';
  else av.innerHTML = avatarInner(name);
  $('chat-info').hidden = !isGroup;
  if (isGroup) $('grp-count').textContent = count || '';
  clearPendingImage();
  closeStickerPanel();
  setTyping([]);
  $('chat-body').innerHTML = '<div class="empty-hint center" translate="yes">' + esc(T('Hämtar…')) + '</div>';
}
function closeChat() {
  active = null;
  stopPolling();
  clearPendingImage();
  clearReply();
  closeCtxMenu();
  closeStickerPanel();
  $('chat-body').innerHTML = '';
  $('layout').classList.remove('chatting');
  $('chat-active').hidden = true;
  $('chat-empty').hidden = false;
}
async function openContact(contact) {
  try {
    if (!contact.public_key) contact.public_key = await getPubKey(contact.id);
    if (!sharedCache[contact.id]) sharedCache[contact.id] = await deriveSharedKey(myPriv, contact.public_key);
    active = { kind: 'contact', id: contact.id, name: contact.username, key: sharedCache[contact.id] };
    lastTs[contact.id] = 0; lastSync[contact.id] = 0;
    showChatUI(contact.username, false);
    $('chat-body').innerHTML = '';
    await pollMessages(true);
    refreshContacts();
    startPolling();
    if (!fullView) $('chat-input').focus();
  } catch (e) {
    showChatUI(contact.username, false);
    $('chat-body').innerHTML = '<div class="empty-hint center">' + esc(T('Kunde inte öppna chatten:') + ' ' + e.message) + '</div>';
  }
}
async function ensureGroupKey(g) {
  if (groupKeyCache[g.id]) return groupKeyCache[g.id];
  const k = await unwrapGroupKey(g.key_envelope, await getPubKey(g.wrapped_by));
  groupKeyCache[g.id] = k;
  return k;
}
async function openGroup(g) {
  try {
    const key = await ensureGroupKey(g);
    const name = groupNames[g.id] || (await decryptMsg(key, g.name_enc).catch(() => T('Grupp')));
    active = { kind: 'group', id: g.id, name, key, avatar: groupAvatars[g.id] || null };
    lastTs[g.id] = 0; lastSync[g.id] = 0;
    showChatUI(name, true, g.member_count, active.avatar);
    $('chat-body').innerHTML = '';
    await pollMessages(true);
    refreshGroups();
    startPolling();
    if (!fullView) $('chat-input').focus();
  } catch (e) {
    showChatUI(T('Grupp'), true);
    $('chat-body').innerHTML = '<div class="empty-hint center">' + esc(T('Kunde inte öppna gruppen:') + ' ' + e.message) + '</div>';
  }
}
$('chat-back').addEventListener('click', () => { closeChat(); refreshContacts(); refreshGroups(); });

let polling = false;
async function pollMessages(scroll) {
  if (!active || polling) return;
  polling = true;
  const id = active.id, kind = active.kind, key = active.key;
  try {
    let r;
    try {
      const q = { since: lastTs[id] || 0, changed_since: lastSync[id] || 0 };
      r = kind === 'contact' ? await GET('/messages', Object.assign({ with: id }, q)) : await GET('/groups/messages', Object.assign({ id }, q));
    } catch (e) {
      if (active && active.id === id) {
        if (kind === 'group' && e.data && e.data.error === 'not_member') {
          const name = active.name; delete groupKeyCache[id]; closeChat(); refreshGroups();
          alertBox(tf('Du är inte längre med i gruppen "{g}".', { g: name }));
        } else if (kind === 'contact' && e.data && e.data.error === 'not_contacts') { closeChat(); refreshContacts(); }
      }
      return;
    }
    if (!active || active.id !== id) return;   // bytte konversation under hämtningen
    lastSync[id] = r.server_time || Date.now();
    const body = $('chat-body');
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 150;
    const typingRow = $('typing-row'); if (typingRow) typingRow.remove();
    for (const m of r.messages || []) {
      if (m.created_at > (lastTs[id] || 0)) lastTs[id] = m.created_at;
      if (body.querySelector('.bubble[data-id="' + Number(m.id) + '"]')) continue;
      const div = await renderBubble(m, kind, key);
      if (!active || active.id !== id) return;
      body.appendChild(div);
    }
    for (const c of r.changes || []) {
      const old = body.querySelector('.bubble[data-id="' + Number(c.id) + '"]');
      if (!old) continue;
      const meta = msgMeta[c.id] || {};
      const who = meta.mine ? state.username : (meta.sender || active.name);
      if (c.deleted) { const nu = await renderBubble({ id: c.id, mine: meta.mine, deleted: true, created_at: meta.ts, sender_username: meta.sender, sender_bubble: meta.bubble }, kind, key); syncBubbleAvatar(old, nu, who); old.replaceWith(nu); }
      else if (c.edited && !old.classList.contains('unreadable')) { const nu = await renderBubble({ id: c.id, mine: meta.mine, ciphertext: c.ciphertext, edited: true, created_at: meta.ts, sender_username: meta.sender, sender_bubble: meta.bubble }, kind, key); syncBubbleAvatar(old, nu, who); old.replaceWith(nu); }
    }
    if (typingRow) body.appendChild(typingRow);
    if (!body.querySelector('.bubble') && !body.querySelector('.empty-hint')) body.innerHTML = '<div class="empty-hint center" translate="yes">' + esc(T('Inga meddelanden än. Säg hej!')) + '</div>';
    else if (body.querySelector('.bubble')) { const h = body.querySelector(':scope > .empty-hint'); if (h) h.remove(); }
    updateSeen(kind, r);
    setTyping(kind === 'contact' ? (r.typing ? [active.name] : []) : (Array.isArray(r.typing) ? r.typing : []));
    if (scroll || nearBottom) body.scrollTop = body.scrollHeight;
  } finally { polling = false; }
}

// Ritar en bubbla. msgMeta sparar dekrypterad text m.m. per meddelande-id.
const msgMeta = {};
async function renderBubble(m, kind, key) {
  let text, unreadable = false;
  if (m.deleted) { text = T('meddelandet togs bort'); unreadable = true; }
  else { try { text = await decryptMsg(key, m.ciphertext); } catch { text = T('kan inte läsas'); unreadable = true; } }
  const payload = unreadable ? { text, img: null, reply: null } : parsePayload(text);
  const img = payload.img, reply = payload.reply;
  if (!unreadable) text = payload.text;
  const div = document.createElement('div');
  div.className = 'bubble ' + (m.mine ? 'me' : 'them') + (unreadable ? ' unreadable' : '') + (img ? ' img' : '') + (img && img.st ? ' sticker' : '');
  div.dataset.id = Number(m.id);
  if (m.mine) div.dataset.ts = m.created_at;
  let inner = '';
  if (kind === 'group' && !m.mine && m.sender_username) inner += '<span class="bub-sender">' + esc(m.sender_username) + '</span>';
  if (reply) inner += '<span class="quote" data-ref="' + esc(reply.id) + '" title="' + esc(T('Gå till meddelandet')) + '"><span class="q-who">' + esc(reply.u === state.username ? T('Du') : reply.u) + '</span><span class="q-text">' + esc(reply.t || (reply.img ? '📷 ' + T('Bild') : '')) + '</span></span>';
  if (img) {
    const ratio = (img.w > 0 && img.h > 0) ? (img.w + ' / ' + img.h) : '4 / 3';
    inner += '<span class="img-wrap loading" style="aspect-ratio:' + ratio + '"><img alt="" draggable="false"></span>';
    if (img.c) inner += '<span class="caption">' + linkifyHtml(img.c) + '</span>';
  } else {
    inner += unreadable ? '<em>[' + esc(text) + ']</em>' : linkifyHtml(text);
    if (!unreadable && payload.lp) inner += previewCardHtml(payload.lp);
  }
  inner += '<span class="time">' + fmtTime(m.created_at) + (m.edited && !unreadable ? ' <span class="edited">· ' + esc(T('redigerad')) + '</span>' : '') + '</span>';
  div.innerHTML = inner;
  if (!unreadable && !(img && img.st)) applyBubbleStyle(div, m.mine ? myBubble : (kind === 'contact' ? bubbleFor(active.name) : m.sender_bubble), m.mine);
  const senderKey = m.mine ? 'me' : (m.sender_username || active.name || '?');
  div.dataset.sender = senderKey;
  const bubbles = document.querySelectorAll('#chat-body .bubble');
  const prev = bubbles[bubbles.length - 1];
  if (!prev || prev.dataset.sender !== senderKey) addBubbleAvatar(div, m.mine ? state.username : (m.sender_username || active.name));
  msgMeta[m.id] = { mine: !!m.mine, ts: m.created_at, text: unreadable ? '' : (img ? (img.c || '') : text), img, reply, lp: payload.lp || null, deleted: !!m.deleted, unreadable, sender: m.sender_username, bubble: m.sender_bubble };
  if (img) loadAttachment(img, key, div.querySelector('.img-wrap'), div);
  const q = div.querySelector('.quote');
  if (q) q.addEventListener('click', (e) => { e.stopPropagation(); jumpToMessage(q.dataset.ref); });
  return div;
}
function addBubbleAvatar(div, username) {
  if (div.querySelector(':scope > .bub-av')) return;
  const av = document.createElement('span'); av.className = 'bub-av'; av.setAttribute('aria-hidden', 'true');
  av.innerHTML = avatarInner(username);
  div.classList.add('has-av'); div.appendChild(av);
}
function syncBubbleAvatar(oldDiv, newDiv, username) {
  const had = !!oldDiv.querySelector(':scope > .bub-av'), has = !!newDiv.querySelector(':scope > .bub-av');
  if (had && !has) addBubbleAvatar(newDiv, username);
  if (!had && has) { newDiv.querySelector(':scope > .bub-av').remove(); newDiv.classList.remove('has-av'); }
}
// Klartext-format: vanlig text, {"sk":"img",...} (bild/sticker) eller {"sk":"txt","c":text,"r":citat,"lp":förhandsvisning}
function parsePayload(text) {
  const out = { text, img: null, reply: null };
  if (typeof text !== 'string' || text[0] !== '{') return out;
  const img = parseImagePayload(text);
  let o = null;
  if (img) { out.img = img; out.text = img.c || ''; try { o = JSON.parse(text); } catch {} }
  else if (text.startsWith('{"sk":"txt"')) { try { o = JSON.parse(text); if (o && o.sk === 'txt') out.text = typeof o.c === 'string' ? o.c : ''; else o = null; } catch {} }
  if (o && o.lp && typeof o.lp === 'object') out.lp = cleanPreview(o.lp, out.text);
  if (o && o.r && typeof o.r === 'object' && o.r.id != null) out.reply = { id: String(o.r.id).replace(/[^0-9]/g, ''), u: String(o.r.u || '').slice(0, 20), t: String(o.r.t || '').slice(0, 140), img: !!o.r.img };
  return out;
}
function jumpToMessage(id) {
  const b = document.querySelector('#chat-body .bubble[data-id="' + Number(id) + '"]');
  if (!b) return;
  b.scrollIntoView({ behavior: 'smooth', block: 'center' });
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
}

// ===== Svara =====
let pendingReply = null;
function setReply(id) {
  const meta = msgMeta[id]; if (!meta || meta.deleted || meta.unreadable) return;
  const who = meta.mine ? state.username : (meta.sender || (active && active.kind === 'contact' ? active.name : ''));
  pendingReply = { id: String(id), u: who, t: (meta.text || '').slice(0, 140), img: !!meta.img };
  $('reply-who').textContent = meta.mine ? T('Svarar dig själv') : tf('Svarar {u}', { u: who });
  $('reply-text').textContent = pendingReply.t || (pendingReply.img ? '📷 ' + T('Bild') : '');
  $('reply-bar').classList.add('show');
  chatInput.focus();
}
function clearReply() { pendingReply = null; $('reply-bar').classList.remove('show'); }
$('reply-cancel').addEventListener('click', clearReply);

// ===== Högerklicksmeny / långtryck =====
const ctxMenu = $('ctx-menu');
const ICO = {
  flag: '<svg viewBox="0 0 24 24"><path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/></svg>',
  sticker: '<svg viewBox="0 0 24 24"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/><path d="M8 13h.01M16 13h.01"/><path d="M10 16.5s.8 1 2 1 2-1 2-1"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};
let ctxTarget = null, ctxOpenedAt = 0;
function openCtxMenu(bubble, x, y) {
  const id = bubble.dataset.id, meta = msgMeta[id];
  if (!id || !meta || !active) return;
  closeCtxMenu();
  ctxTarget = bubble; bubble.classList.add('selected');
  const items = [];
  if (!meta.deleted && !meta.unreadable) items.push({ label: 'Svara', ico: ICO.reply, run: () => setReply(id) });
  if (meta.img && !meta.deleted && meta.img.st) items.push({ label: 'Spara sticker', ico: ICO.sticker, run: () => saveStickerFromMessage(meta.img) });
  if (meta.img && !meta.deleted && !meta.img.st) items.push({ label: 'Gör sticker', ico: ICO.sticker, run: () => openStickerFromMessage(meta.img) });
  if (meta.img && !meta.deleted) items.push({ label: meta.img.st ? 'Ladda ner sticker' : 'Ladda ner bild', ico: ICO.dl, run: () => downloadImage(meta.img) });
  if (meta.text) items.push({ label: meta.img ? 'Kopiera bildtext' : 'Kopiera text', ico: ICO.copy, run: () => navigator.clipboard.writeText(meta.text).then(() => toast(T('Kopierat.'))).catch(() => {}) });
  if (meta.mine && !meta.deleted && !meta.unreadable && !meta.img) items.push({ label: 'Redigera', ico: ICO.edit, run: () => editMessage(id) });
  if (items.length) items.push({ sep: true });
  if (!meta.mine && !meta.deleted) items.push({ label: 'Rapportera', ico: ICO.flag, danger: true, run: () => openReport({ username: meta.sender || active.name, messageId: id, meta }) });
  items.push({ label: 'Radera för mig', ico: ICO.hide, danger: true, run: () => hideMessage(id) });
  if (meta.mine && !meta.deleted) items.push({ label: 'Radera för alla', ico: ICO.trash, danger: true, run: () => deleteMessage(id) });
  ctxMenu.innerHTML = '';
  for (const it of items) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'sep'; ctxMenu.appendChild(s); continue; }
    const b = document.createElement('button'); b.type = 'button'; b.className = it.danger ? 'danger' : ''; b.innerHTML = it.ico + '<span>' + esc(T(it.label)) + '</span>';
    b.addEventListener('click', () => { closeCtxMenu(); it.run(); });
    ctxMenu.appendChild(b);
  }
  ctxMenu.classList.add('open'); ctxOpenedAt = Date.now();
  const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + 'px';
  ctxMenu.style.top = Math.max(8, Math.min(y, innerHeight - mh - 8)) + 'px';
}
function closeCtxMenu() { ctxMenu.classList.remove('open'); if (ctxTarget) { ctxTarget.classList.remove('selected'); ctxTarget = null; } }
$('chat-body').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.bubble'); if (!b || !b.dataset.id) return;
  e.preventDefault(); openCtxMenu(b, e.clientX, e.clientY);
});
(function () {
  let timer = null, sx = 0, sy = 0;
  const body = $('chat-body');
  body.addEventListener('touchstart', (e) => {
    const b = e.target.closest('.bubble'); if (!b || !b.dataset.id) return;
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    timer = setTimeout(() => { timer = null; openCtxMenu(b, sx, sy); }, 500);
  }, { passive: true });
  body.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (timer && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)) { clearTimeout(timer); timer = null; } }, { passive: true });
  body.addEventListener('touchend', () => { if (timer) { clearTimeout(timer); timer = null; } }, { passive: true });
})();
document.addEventListener('click', (e) => { if (ctxMenu.classList.contains('open') && !ctxMenu.contains(e.target)) closeCtxMenu(); });
$('chat-body').addEventListener('scroll', () => { if (Date.now() - ctxOpenedAt > 300) closeCtxMenu(); }, { passive: true });

function msgCall(id, action, extra) {
  return active.kind === 'contact'
    ? POST('/messages/' + action, Object.assign({ id: Number(id) }, extra || {}))
    : POST('/groups/messages/' + action, Object.assign({ gid: active.id, id: Number(id) }, extra || {}));
}
async function hideMessage(id) {
  try {
    await msgCall(id, 'hide');
    const b = document.querySelector('#chat-body .bubble[data-id="' + Number(id) + '"]'); if (b) b.remove();
    delete msgMeta[id];
    updateSeen(active.kind, {});
  } catch (e) { alertBox(e.message || T('Kunde inte ta bort.')); }
}
async function deleteMessage(id) {
  if (!(await confirmBox(T('Radera meddelandet för alla? Det försvinner hos mottagaren också.'), T('Radera'), true))) return;
  try {
    await msgCall(id, 'delete');
    const b = document.querySelector('#chat-body .bubble[data-id="' + Number(id) + '"]');
    const meta = msgMeta[id] || {};
    if (meta.img && attachmentUrls[meta.img.a]) { try { URL.revokeObjectURL(attachmentUrls[meta.img.a]); } catch {} delete attachmentUrls[meta.img.a]; delete attachmentBytes[meta.img.a]; }
    if (b && active) { const nu = await renderBubble({ id: Number(id), mine: true, deleted: true, created_at: meta.ts }, active.kind, active.key); syncBubbleAvatar(b, nu, state.username); b.replaceWith(nu); }
  } catch (e) { alertBox(e.message || T('Kunde inte radera.')); }
}
async function editMessage(id) {
  const meta = msgMeta[id]; if (!meta) return;
  const val = await promptBox(T('Redigera meddelandet:'), meta.text);
  if (val == null || !active) return;
  const text = String(val).trim(); if (!text || text === meta.text) return;
  try {
    const keepLp = meta.lp && cleanPreview(meta.lp, text);
    const payload = (meta.reply || keepLp) ? JSON.stringify({ sk: 'txt', c: text, r: meta.reply || undefined, lp: keepLp || undefined }) : text;
    const ciphertext = await encryptMsg(active.key, payload);
    await msgCall(id, 'edit', { ciphertext });
    const b = document.querySelector('#chat-body .bubble[data-id="' + Number(id) + '"]');
    if (b) { const nu = await renderBubble({ id: Number(id), mine: true, ciphertext, edited: true, created_at: meta.ts }, active.kind, active.key); syncBubbleAvatar(b, nu, state.username); b.replaceWith(nu); }
  } catch (e) { alertBox(e.message || T('Kunde inte redigera.')); }
}
function downloadImage(img) {
  const url = attachmentUrls[img.a]; if (!url) { alertBox(T('Bilden är inte hämtad än.')); return; }
  const ext = (img.m || 'image/jpeg').split('/')[1].replace('jpeg', 'jpg');
  const a = document.createElement('a'); a.href = url; a.download = 'adraze-chatt-' + img.a.slice(0, 8) + '.' + ext;
  document.body.appendChild(a); a.click(); a.remove();
}

// ===== Bilder (E2E: krypteras med samma nyckel som meddelandet, laddas upp som egen blob) =====
function parseImagePayload(text) {
  if (typeof text !== 'string' || !text.startsWith('{"sk":"img"')) return null;
  try {
    const o = JSON.parse(text);
    if (o && o.sk === 'img' && /^[a-f0-9]{32}$/.test(o.a || '')) return { a: o.a, m: /^image\/(jpeg|png|webp|gif)$/.test(o.m || '') ? o.m : 'image/jpeg', w: +o.w || 0, h: +o.h || 0, c: typeof o.c === 'string' ? o.c : '', st: o.st === 1 };
  } catch {}
  return null;
}
const attachmentUrls = {}, attachmentBytes = {};
async function loadAttachment(img, key, wrap, bubble) {
  const el = wrap.querySelector('img');
  try {
    let url = attachmentUrls[img.a];
    if (!url) {
      const r = await GET('/messages/attachment', { id: img.a });
      const bytes = await aesDecryptBytes(key, r.ciphertext);
      url = URL.createObjectURL(new Blob([bytes], { type: img.m }));
      attachmentUrls[img.a] = url; attachmentBytes[img.a] = bytes;
    }
    el.addEventListener('load', () => wrap.classList.remove('loading'), { once: true });
    el.src = url;
    el.addEventListener('click', (ev) => {
      if (document.documentElement.classList.contains('c-blur') && !wrap.classList.contains('shown')) { wrap.classList.add('shown'); return; }
      if (bubble && bubble.classList.contains('sticker')) { ev.stopPropagation(); openCtxMenu(bubble, ev.clientX, ev.clientY); return; }
      openLightbox(url);
    });
    if (bubble && !bubble.querySelector('.dl-btn')) {
      const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'dl-btn'; dl.title = T('Ladda ner bild'); dl.setAttribute('aria-label', T('Ladda ner bild'));
      dl.innerHTML = ICO.dl;
      dl.addEventListener('click', (e) => { e.stopPropagation(); downloadImage(img); });
      bubble.appendChild(dl);
    }
  } catch { wrap.classList.remove('loading'); wrap.classList.add('failed'); }
}
const lightbox = $('lightbox');
function openLightbox(url) { $('lightbox-img').src = url; lightbox.classList.add('open'); }
function closeLightbox() { lightbox.classList.remove('open'); $('lightbox-img').removeAttribute('src'); }
lightbox.addEventListener('click', closeLightbox);

// Skala ner + komprimera till JPEG tills den ryms (~1,1 MB rå → ~1,5 MB krypterad base64, under serverns 2,2 MB).
const IMG_MAX_BYTES = 1100000;
function canvasBlob(c, q) { return new Promise((res) => c.toBlob(res, 'image/jpeg', q)); }
async function compressImage(file) {
  const im = await loadImageFile(file);
  let maxSide = 1600;
  for (let round = 0; round < 4; round++) {
    const s = Math.min(1, maxSide / Math.max(im.width, im.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    for (let q = 0.85; q >= 0.45; q -= 0.1) {
      const blob = await canvasBlob(c, q);
      if (blob && blob.size <= IMG_MAX_BYTES) return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, mime: 'image/jpeg', size: blob.size };
    }
    maxSide = Math.round(maxSide * 0.7);
  }
  throw new Error(T('Bilden gick inte att komprimera tillräckligt. Prova en mindre bild.'));
}
let pendingImage = null;
const attachBtn = $('chat-attach'), fileInput = $('chat-file');
attachBtn.addEventListener('click', () => { if (active) fileInput.click(); });
async function pickImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { alertBox(T('Välj en bildfil.')); return; }
  attachBtn.disabled = true;
  try {
    const img = await compressImage(file);
    clearPendingImage();
    img.preview = URL.createObjectURL(new Blob([img.bytes], { type: img.mime }));
    pendingImage = img;
    $('attach-thumb').src = img.preview;
    $('attach-meta').textContent = img.w + '×' + img.h + ' · ' + Math.round(img.size / 1024) + ' kB · ' + T('krypteras innan den skickas');
    $('attach-preview').classList.add('show');
    chatInput.focus();
  } catch (e) { alertBox(e.message || T('Kunde inte läsa bilden.')); }
  finally { attachBtn.disabled = false; }
}
fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ''; pickImage(f); });
function clearPendingImage() {
  if (pendingImage && pendingImage.preview) URL.revokeObjectURL(pendingImage.preview);
  pendingImage = null;
  $('attach-preview').classList.remove('show'); $('attach-thumb').removeAttribute('src');
}
$('attach-remove').addEventListener('click', clearPendingImage);
// Ctrl+V med en skärmdump i textrutan
$('chat-input').addEventListener('paste', (e) => {
  const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find((i) => i.type.startsWith('image/'));
  if (!item || !active) return;
  e.preventDefault();
  pickImage(item.getAsFile());
});
// Dra och släpp en bild på chatten
chatEl.addEventListener('dragover', (e) => { if (active && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
chatEl.addEventListener('drop', (e) => {
  if (!active) return;
  const f = e.dataTransfer && Array.from(e.dataTransfer.files || []).find((x) => /^image\//.test(x.type));
  if (f) { e.preventDefault(); pickImage(f); }
});

// ===== Läskvitto ("Öppnat") =====
function updateSeen(kind, r) {
  const body = $('chat-body');
  let label = $('seen-label');
  const mine = Array.from(body.querySelectorAll('.bubble.me[data-ts]'));
  let target = null, text = '';
  if (kind === 'contact') {
    const until = r.peer_read_until || 0;
    for (let i = mine.length - 1; i >= 0; i--) if (+mine[i].dataset.ts <= until) { target = mine[i]; break; }
    if (target) text = T('Öppnat') + (r.peer_read_at ? ' · ' + fmtTime(r.peer_read_at) : '');
  } else if (Array.isArray(r.reads) && r.reads.length) {
    for (let i = mine.length - 1; i >= 0 && !target; i--) {
      const ts = +mine[i].dataset.ts;
      const who = r.reads.filter((x) => (x.read_at || 0) >= ts).map((x) => x.username);
      if (who.length) { target = mine[i]; text = who.length === r.reads.length ? T('Öppnat av alla') : T('Öppnat av') + ' ' + who.join(', '); }
    }
  } else if (kind === 'group' && label && !r.reads) return;   // lokal ändring (radera för mig): behåll
  if (!target) { if (label) label.remove(); return; }
  if (!label) { label = document.createElement('div'); label.id = 'seen-label'; label.className = 'seen'; }
  label.textContent = text;
  if (target.nextSibling !== label) target.after(label);
}

// ===== Skriver… =====
function setTyping(names) {
  const body = $('chat-body');
  let row = $('typing-row');
  if (!names || !names.length) { if (row) row.remove(); return; }
  const isGroup = active && active.kind === 'group';
  const who = isGroup ? names.join(', ') + ' ' + T('skriver…') : '';
  const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 150;
  if (!row) {
    row = document.createElement('div'); row.id = 'typing-row'; row.className = 'typing-row';
    row.innerHTML = '<span class="typing"><span></span><span></span><span></span></span><span class="typing-who"></span>';
    body.appendChild(row);
  } else if (row !== body.lastElementChild) body.appendChild(row);
  row.querySelector('.typing-who').textContent = who;
  if (stick) body.scrollTop = body.scrollHeight;
}
let lastTypingPing = 0;
function pingTyping() {
  if (!active) return;
  const now = Date.now();
  if (now - lastTypingPing < 2500) return;
  lastTypingPing = now;
  POST('/messages/typing', active.kind === 'contact' ? { to_id: active.id } : { group_id: active.id }).catch(() => {});
}

// ===== Skicka =====
const chatInput = $('chat-input');
chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px'; if (chatInput.value.trim()) pingTyping(); });
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pendingReply) { e.stopPropagation(); clearReply(); return; }
  if (e.key !== 'Enter' || e.isComposing) return;
  const send = chatPref('enter') ? !e.shiftKey : (e.ctrlKey || e.metaKey);
  if (send) { e.preventDefault(); sendMessage(); }
});
const sendBtn = $('chat-send');
sendBtn.addEventListener('click', sendMessage);
let sending = false;
async function sendMessage() {
  if (!active || sending) return;
  const text = chatInput.value.trim();
  const img = pendingImage;
  if (!text && !img) return;
  const conv = active;
  sending = true; sendBtn.disabled = true;
  if (img) sendBtn.textContent = T('Skickar…');
  chatInput.value = ''; chatInput.style.height = 'auto';
  lastTypingPing = 0;
  const reply = pendingReply;
  try {
    let payload = text, attachment_id;
    if (img) {
      const blobCt = await aesEncryptBytes(conv.key, img.bytes);
      const up = await POST('/messages/attachment', conv.kind === 'contact' ? { to_id: conv.id, ciphertext: blobCt } : { group_id: conv.id, ciphertext: blobCt });
      attachment_id = up.id;
      payload = JSON.stringify({ sk: 'img', a: up.id, m: img.mime, w: img.w, h: img.h, c: text || undefined, r: reply || undefined });
      attachmentUrls[up.id] = URL.createObjectURL(new Blob([img.bytes], { type: img.mime })); attachmentBytes[up.id] = img.bytes;
    } else {
      const lp = /\b(?:https?:\/\/|www\.)/i.test(text) ? await fetchLinkPreview(text) : null;
      if (lp || reply) {
        payload = JSON.stringify({ sk: 'txt', c: text, r: reply || undefined, lp: lp || undefined });
        // Under serverns 16 kB-tak (krypterat + base64 ≈ ×1,4): släpp ikonen, sen hela kortet.
        if (lp && enc.encode(payload).length > 10500) { delete lp.i; payload = JSON.stringify({ sk: 'txt', c: text, r: reply || undefined, lp }); }
        if (lp && enc.encode(payload).length > 10500) payload = reply ? JSON.stringify({ sk: 'txt', c: text, r: reply }) : text;
      }
    }
    const ciphertext = await encryptMsg(conv.key, payload);
    const sendBody = attachment_id ? { ciphertext, attachment_id } : { ciphertext };
    if (conv.kind === 'contact') await POST('/messages/send', Object.assign({ to_id: conv.id }, sendBody));
    else await POST('/groups/messages', Object.assign({ id: conv.id }, sendBody));
    if (img) clearPendingImage();
    clearReply();
    if (active === conv) await pollMessages(true);
  } catch (e) {
    if (active === conv && !chatInput.value) chatInput.value = text;
    alertBox(e.message || T('Kunde inte skicka.'));
  } finally { sending = false; sendBtn.disabled = false; sendBtn.textContent = T('Skicka'); }
}

// ===== Stickers (egen samling krypterad med ECDH(min privata, min publika), följer med till alla datorer) =====
const STICKER_SIDE = 512;
const STICKER_MAX_BYTES = 600000;
let stickerLib = null, stickerLibLoading = null, stickerKey = null;
async function getStickerKey() { if (!stickerKey) stickerKey = await deriveSharedKey(myPriv, state.public_key); return stickerKey; }
function resetStickers() {
  if (stickerLib) for (const s of stickerLib) { try { URL.revokeObjectURL(s.url); } catch {} }
  stickerLib = null; stickerLibLoading = null; stickerKey = null;
  $('st-panel').classList.remove('open', 'del');
}
function sniffMime(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  return 'image/png';
}
async function sha256Hex(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function loadStickerLib() {
  if (stickerLib) return stickerLib;
  if (stickerLibLoading) return stickerLibLoading;
  stickerLibLoading = (async () => {
    const r = await GET('/stickers');
    const key = await getStickerKey();
    const out = await Promise.all((r.stickers || []).map(async (row) => {
      try {
        const c = await GET('/stickers', { id: row.id });
        const bytes = await aesDecryptBytes(key, c.ciphertext);
        const mime = sniffMime(bytes);
        return { id: row.id, bytes, mime, hash: await sha256Hex(bytes), url: URL.createObjectURL(new Blob([bytes], { type: mime })) };
      } catch { return null; }
    }));
    stickerLib = out.filter(Boolean);
    return stickerLib;
  })();
  try { return await stickerLibLoading; } finally { stickerLibLoading = null; }
}
async function addToStickerLib(bytes) {
  const lib = await loadStickerLib();
  const hash = await sha256Hex(bytes);
  if (lib.some((s) => s.hash === hash)) return { dup: true };
  const r = await POST('/stickers', { ciphertext: await aesEncryptBytes(await getStickerKey(), bytes) });
  const mime = sniffMime(bytes);
  lib.unshift({ id: r.id, bytes, mime, hash, url: URL.createObjectURL(new Blob([bytes], { type: mime })) });
  renderStickerGrid();
  return { id: r.id };
}
async function sendSticker(st) {
  if (!active || sending) return;
  const conv = active;
  sending = true;
  try {
    const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 1, h: 1 }); im.src = st.url; });
    const blobCt = await aesEncryptBytes(conv.key, st.bytes);
    const up = await POST('/messages/attachment', conv.kind === 'contact' ? { to_id: conv.id, ciphertext: blobCt } : { group_id: conv.id, ciphertext: blobCt });
    const reply = pendingReply;
    const payload = JSON.stringify({ sk: 'img', st: 1, a: up.id, m: st.mime, w: dims.w, h: dims.h, r: reply || undefined });
    attachmentUrls[up.id] = URL.createObjectURL(new Blob([st.bytes], { type: st.mime })); attachmentBytes[up.id] = st.bytes;
    const ciphertext = await encryptMsg(conv.key, payload);
    if (conv.kind === 'contact') await POST('/messages/send', { to_id: conv.id, ciphertext, attachment_id: up.id });
    else await POST('/groups/messages', { id: conv.id, ciphertext, attachment_id: up.id });
    clearReply();
    if (active === conv) await pollMessages(true);
  } catch (e) { alertBox(e.message || T('Kunde inte skicka stickern.')); }
  finally { sending = false; }
}
const stPanel = $('st-panel'), stGrid = $('st-grid');
function renderStickerGrid() {
  if (!stPanel.classList.contains('open')) return;
  stGrid.innerHTML = '';
  const add = document.createElement('button'); add.type = 'button'; add.className = 'st-cell add';
  add.innerHTML = '<span><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' + esc(T('Ny av bild')) + '</span>';
  add.addEventListener('click', () => $('sticker-file').click());
  stGrid.appendChild(add);
  if (!stickerLib) { for (let i = 0; i < 3; i++) { const c = document.createElement('div'); c.className = 'st-cell loading'; stGrid.appendChild(c); } return; }
  if (!stickerLib.length) { const h = document.createElement('div'); h.className = 'st-empty-hint'; h.textContent = T('Inga stickers än. Gör en av en bild, eller tryck på någon annans sticker och välj "Spara sticker".'); stGrid.appendChild(h); }
  for (const st of stickerLib) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'st-cell'; b.title = T('Skicka');
    const im = document.createElement('img'); im.alt = ''; im.src = st.url; im.draggable = false; b.appendChild(im);
    b.addEventListener('click', async () => {
      if (stPanel.classList.contains('del')) {
        if (!(await confirmBox(T('Ta bort stickern från din samling?'), T('Ta bort'), true))) return;
        try { await POST('/stickers/delete', { id: st.id }); } catch (e) { alertBox(e.message); return; }
        stickerLib = stickerLib.filter((x) => x !== st); try { URL.revokeObjectURL(st.url); } catch {}
        renderStickerGrid(); return;
      }
      closeStickerPanel(); sendSticker(st);
    });
    stGrid.appendChild(b);
  }
}
function closeStickerPanel() { stPanel.classList.remove('open', 'del'); $('st-del-toggle').classList.remove('on'); $('st-del-toggle').textContent = T('Ta bort'); }
$('chat-sticker').addEventListener('click', async () => {
  if (!active) return;
  if (stPanel.classList.contains('open')) { closeStickerPanel(); return; }
  stPanel.classList.add('open'); renderStickerGrid();
  try { await loadStickerLib(); } catch { stGrid.innerHTML = '<div class="st-empty-hint">' + esc(T('Kunde inte hämta dina stickers.')) + '</div>'; return; }
  renderStickerGrid();
});
$('st-close').addEventListener('click', closeStickerPanel);
$('st-del-toggle').addEventListener('click', (e) => {
  const on = stPanel.classList.toggle('del'); e.currentTarget.classList.toggle('on', on); e.currentTarget.textContent = on ? T('Klar') : T('Ta bort');
});
$('sticker-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f || !/^image\//.test(f.type)) return;
  const url = URL.createObjectURL(f);
  openStickerEditor(url, () => URL.revokeObjectURL(url));
});
async function saveStickerFromMessage(img) {
  try {
    const bytes = attachmentBytes[img.a];
    if (!bytes) throw new Error(T('Bilden är inte hämtad än. Vänta en sekund och försök igen.'));
    const r = await addToStickerLib(bytes);
    toast(r.dup ? T('Den finns redan bland dina stickers') : T('Sparad bland dina stickers'));
  } catch (e) { alertBox(e.message || T('Kunde inte spara stickern.')); }
}
function openStickerFromMessage(img) {
  const url = attachmentUrls[img.a]; if (!url) { alertBox(T('Bilden är inte hämtad än.')); return; }
  openStickerEditor(url);
}
// Saxen: rita runt motivet → utklippt sticker med vit kant
const stx = { ov: $('stx-ov'), cv: $('stx-canvas'), stage: $('stx-stage'), img: null, path: [], drawing: false, result: null, onClose: null };
function stxFit() { const s = Math.min(1, 1400 / Math.max(stx.img.naturalWidth, stx.img.naturalHeight)); stx.cv.width = Math.round(stx.img.naturalWidth * s); stx.cv.height = Math.round(stx.img.naturalHeight * s); }
function openStickerEditor(url, onClose) {
  closeStickerPanel();
  const im = new Image();
  im.onload = () => { stx.img = im; stx.onClose = onClose || null; stxFit(); stxReset(); stx.ov.classList.add('open'); };
  im.onerror = () => alertBox(T('Kunde inte läsa bilden.'));
  im.src = url;
}
function closeStickerEditor() {
  stx.ov.classList.remove('open'); stx.img = null; stx.result = null; stx.path = [];
  if (stx.onClose) { try { stx.onClose(); } catch {} stx.onClose = null; }
}
function stxSetDone(done) {
  ['stx-redo', 'stx-save', 'stx-send'].forEach((id) => { $(id).disabled = !done; });
  $('stx-send').disabled = !done || !active;
  $('stx-title').textContent = done ? T('Din sticker') : T('Rita runt det du vill ha');
  $('stx-sub').textContent = done ? T('Spara den i din samling, eller skicka direkt.') : T('Dra med musen runt motivet. Släpp för att klippa ut.');
  stx.stage.classList.toggle('checker', done);
}
function stxReset() {
  stx.path = []; stx.result = null; stx.drawing = false;
  const c = stx.cv, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(stx.img, 0, 0, c.width, c.height);
  stxSetDone(false);
}
function stxPoint(e) { const r = stx.cv.getBoundingClientRect(); return [(e.clientX - r.left) * stx.cv.width / r.width, (e.clientY - r.top) * stx.cv.height / r.height]; }
function stxDrawTrace() {
  const c = stx.cv, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(stx.img, 0, 0, c.width, c.height);
  if (stx.path.length < 2) return;
  const lw = Math.max(3, c.width / 180);
  ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(stx.path[0][0], stx.path[0][1]);
  for (const p of stx.path) ctx.lineTo(p[0], p[1]);
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = lw + 3; ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.setLineDash([lw * 2.2, lw * 1.6]); ctx.stroke();
  ctx.restore();
}
stx.cv.addEventListener('pointerdown', (e) => {
  if (stx.result || !stx.img) return;
  e.preventDefault(); stx.cv.setPointerCapture(e.pointerId);
  stx.drawing = true; stx.path = [stxPoint(e)]; stxDrawTrace();
});
stx.cv.addEventListener('pointermove', (e) => {
  if (!stx.drawing) return;
  const p = stxPoint(e), q = stx.path[stx.path.length - 1];
  if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2) return;
  stx.path.push(p); stxDrawTrace();
});
function stxEnd() {
  if (!stx.drawing) return;
  stx.drawing = false;
  const xs = stx.path.map((p) => p[0]), ys = stx.path.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (stx.path.length < 8 || w < 20 || h < 20) { stxReset(); return; }
  stxCut(stx.path);
}
stx.cv.addEventListener('pointerup', stxEnd);
stx.cv.addEventListener('pointercancel', stxEnd);
async function stxCut(path) {
  const src = stx.cv, W = src.width, H = src.height;
  let pts = path;
  if (!pts) {
    const r = Math.min(W, H) * 0.08, k = 12; pts = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= k; i++) { const a = a0 + (Math.PI / 2) * (i / k); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
    corner(W - r, r, -Math.PI / 2); corner(W - r, H - r, 0); corner(r, H - r, Math.PI / 2); corner(r, r, Math.PI);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.min(W, Math.max(...xs)), y1 = Math.min(H, Math.max(...ys));
  const bw = x1 - x0, bh = y1 - y0;
  const scale = Math.min(1, (STICKER_SIDE * 0.9) / Math.max(bw, bh));
  const border = Math.round(Math.max(bw, bh) * scale * 0.035) + 3;
  const pad = border + 4;
  const out = document.createElement('canvas');
  out.width = Math.round(bw * scale) + pad * 2; out.height = Math.round(bh * scale) + pad * 2;
  const o = out.getContext('2d');
  const tr = (p) => [(p[0] - x0) * scale + pad, (p[1] - y0) * scale + pad];
  const trace = () => { o.beginPath(); const a = tr(pts[0]); o.moveTo(a[0], a[1]); for (const p of pts) { const b = tr(p); o.lineTo(b[0], b[1]); } o.closePath(); };
  o.save(); o.lineJoin = o.lineCap = 'round';
  o.shadowColor = 'rgba(0,0,0,.28)'; o.shadowBlur = border * 0.9; o.shadowOffsetY = border * 0.25;
  trace(); o.fillStyle = '#fff'; o.fill(); o.lineWidth = border * 2; o.strokeStyle = '#fff'; o.stroke();
  o.restore();
  o.save(); trace(); o.clip();
  o.drawImage(stx.img, 0, 0, stx.img.naturalWidth, stx.img.naturalHeight, (0 - x0) * scale + pad, (0 - y0) * scale + pad, W * scale, H * scale);
  o.restore();
  let blob = await new Promise((res) => out.toBlob(res, 'image/webp', 0.9));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  if (blob.size > STICKER_MAX_BYTES) blob = (await new Promise((res) => out.toBlob(res, 'image/webp', 0.7))) || blob;
  if (blob.size > STICKER_MAX_BYTES) { alertBox(T('Stickern blev för stor. Rita runt en mindre del.')); stxReset(); return; }
  stx.result = new Uint8Array(await blob.arrayBuffer());
  const c = stx.cv; c.width = out.width; c.height = out.height;
  c.getContext('2d').drawImage(out, 0, 0);
  stxSetDone(true);
}
async function stxSave(andSend) {
  if (!stx.result) return;
  const btns = ['stx-save', 'stx-send'].map((id) => $(id)); btns.forEach((b) => { b.disabled = true; });
  try {
    const bytes = stx.result;
    const r = await addToStickerLib(bytes);
    closeStickerEditor();
    toast(r.dup ? T('Den finns redan bland dina stickers') : T('Sparad bland dina stickers'));
    if (andSend) { const hash = await sha256Hex(bytes); const pick = stickerLib.find((x) => x.hash === hash); if (pick) sendSticker(pick); }
  } catch (e) { alertBox(e.message || T('Kunde inte spara stickern.')); btns.forEach((b) => { b.disabled = false; }); }
}
$('stx-redo').addEventListener('click', () => { if (!stx.img) return; stxFit(); stxReset(); });
$('stx-whole').addEventListener('click', () => { if (!stx.img) return; stxFit(); stxReset(); stxCut(null); });
$('stx-save').addEventListener('click', () => stxSave(false));
$('stx-send').addEventListener('click', () => stxSave(true));
$('stx-x').addEventListener('click', closeStickerEditor);

// ===== Rapportera (bara det rapporterade meddelandet skickas med, inget annat ur chatten) =====
const REPORT_REASONS = [
  ['spam', 'Spam eller reklam'], ['scam', 'Bedrägeri eller bluff'], ['harassment', 'Trakasserier eller mobbning'],
  ['threat', 'Hot eller våld'], ['hate', 'Hatiskt innehåll'], ['sexual', 'Sexuellt innehåll'],
  ['impersonation', 'Utger sig för att vara någon annan'], ['doxxing', 'Sprider privata uppgifter'],
  ['child', 'Ett barn kan vara i fara'], ['other', 'Annat'],
];
let reportCtx = null;
const rpModal = $('modal-report');
function openReport(ctx) {
  reportCtx = ctx;
  $('rp-form').hidden = false; $('rp-done').hidden = true;
  $('rp-title').textContent = ctx.messageId ? T('Rapportera meddelande') : tf('Rapportera {u}', { u: ctx.username });
  const box = $('rp-reasons'); box.innerHTML = '';
  for (const [k, label] of REPORT_REASONS) {
    const l = document.createElement('label');
    l.innerHTML = '<input type="radio" name="rp-reason" value="' + k + '"><span>' + esc(T(label)) + '</span>';
    l.querySelector('input').addEventListener('change', () => { $('rp-msg').textContent = ''; });
    box.appendChild(l);
  }
  const q = $('rp-quote'); q.innerHTML = ''; q.hidden = true;
  if (ctx.meta) {
    if (ctx.meta.img && attachmentUrls[ctx.meta.img.a]) { const im = document.createElement('img'); im.src = attachmentUrls[ctx.meta.img.a]; q.appendChild(im); }
    if (ctx.meta.text) { const t = document.createElement('div'); t.textContent = ctx.meta.text; q.appendChild(t); }
    q.hidden = !q.childNodes.length;
  }
  $('rp-note').textContent = ctx.messageId
    ? tf('Meddelandet ovan skickas till AdRazes granskare så vi kan bedöma det. Inget annat från chatten delas. {u} får inte veta att du rapporterat.', { u: ctx.username })
    : tf('Vi kan inte läsa era meddelanden (de är krypterade). Rapportera gärna ett specifikt meddelande via menyn på det. {u} får inte veta att du rapporterat.', { u: ctx.username });
  $('rp-details').value = '';
  $('rp-block').checked = false;
  $('rp-block-label').textContent = tf('Blockera också {u}', { u: ctx.username });
  $('rp-msg').textContent = '';
  rpModal.classList.add('open');
}
function closeReport() { rpModal.classList.remove('open'); reportCtx = null; }
$('rp-cancel').addEventListener('click', closeReport);
$('rp-ok').addEventListener('click', closeReport);
async function evidenceDataUrl(img) {
  const url = attachmentUrls[img.a]; if (!url) return null;
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  let side = 900;
  for (let k = 0; k < 4; k++) {
    const sc = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.72); if (d.length < 650000) return d; side = Math.round(side * 0.7);
  }
  return null;
}
$('rp-send').addEventListener('click', async () => {
  const ctx = reportCtx; if (!ctx) return;
  const msg = $('rp-msg'); msg.textContent = '';
  const sel = document.querySelector('input[name="rp-reason"]:checked');
  if (!sel) { msg.textContent = T('Välj en anledning.'); return; }
  const details = $('rp-details').value.trim();
  if (sel.value === 'other' && details.length < 3) { msg.textContent = T('Beskriv kort vad det gäller.'); $('rp-details').focus(); return; }
  await busy($('rp-send'), 'Skickar…', async () => {
    try {
      const body = { username: ctx.username, reason: sel.value, details };
      if (ctx.messageId && ctx.meta) {
        body.message_id = String(ctx.messageId);
        body.message_kind = active && active.kind === 'group' ? 'group' : 'dm';
        if (body.message_kind === 'group') body.group_id = active.id;
        body.excerpt = (ctx.meta.img ? (ctx.meta.img.st ? '[sticker] ' : '[bild] ') : '') + (ctx.meta.text || '');
        if (ctx.meta.img) { try { body.evidence_img = await evidenceDataUrl(ctx.meta.img); } catch {} }
      }
      await POST('/reports', body);
      let blocked = false;
      if ($('rp-block').checked) { try { await POST('/contacts/block', { username: ctx.username }); blocked = true; } catch {} }
      $('rp-done-sub').textContent = tf('Vi granskar rapporten. {u} får inte veta vem som rapporterade.', { u: ctx.username }) + (blocked ? ' ' + tf('Du har också blockerat {u}.', { u: ctx.username }) : '');
      $('rp-form').hidden = true; $('rp-done').hidden = false;
      if (blocked) { if (active && active.kind === 'contact' && active.name === ctx.username) closeChat(); refreshContacts(); }
    } catch (e) { msg.textContent = e.message || T('Kunde inte skicka rapporten.'); }
  });
});

// ===== Länkar: bara http(s) blir klickbart, alltid via säkerhetsrutan, öppnas som ny flik i AdRaze =====
const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
function cleanLinkTail(u) {
  let tail = '';
  while (/[.,!?;:)\]}'"»]$/.test(u)) {
    if (u.endsWith(')') && (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length) break;
    tail = u.slice(-1) + tail; u = u.slice(0, -1);
  }
  return [u, tail];
}
function safeHref(raw) {
  const withProto = /^www\./i.test(raw) ? 'https://' + raw : raw;
  try { const u = new URL(withProto); return /^https?:$/.test(u.protocol) && u.hostname ? u.href : null; } catch { return null; }
}
function linkifyHtml(text) {
  let out = '', last = 0;
  String(text).replace(LINK_RE, (m, off) => {
    const [u, tail] = cleanLinkTail(m);
    const href = safeHref(u);
    out += esc(text.slice(last, off));
    if (href) {
      const shown = u.length > 70 ? u.slice(0, 67) + '…' : u;
      out += '<a class="c-link" href="#" data-href="' + esc(href) + '">' + esc(shown) + '</a>' + esc(tail);
    } else out += esc(m);
    last = off + m.length; return m;
  });
  return out + esc(String(text).slice(last));
}
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'ow.ly', 'shorturl.at', 'tiny.cc', 's.id', 'buff.ly', 'rebrand.ly', 'bl.ink', 't.ly', 'v.gd', 'lnkd.in', 'tr.ee', 'shorte.st', 'adf.ly', 'qr.ae', 'surl.li', 'u.to', 'clck.ru']);
const RISKY_EXT = /\.(exe|msi|scr|bat|cmd|com|pif|vbs|vbe|js|jse|wsf|jar|apk|xapk|dmg|pkg|ps1|lnk|iso|img|hta|reg|cpl|docm|xlsm|pptm|zip|rar|7z|tar|gz)$/i;
const BRANDS = {
  bankid: ['bankid.com'], swedbank: ['swedbank.se', 'swedbank.com'], handelsbanken: ['handelsbanken.se', 'handelsbanken.com'],
  nordea: ['nordea.se', 'nordea.com'], seb: ['seb.se', 'sebgroup.com'], klarna: ['klarna.com', 'klarna.se'], swish: ['swish.nu'],
  paypal: ['paypal.com', 'paypal.me'], apple: ['apple.com', 'icloud.com'], microsoft: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com'],
  google: ['google.com', 'google.se', 'youtube.com', 'goo.gl'], postnord: ['postnord.se', 'postnord.com'], skatteverket: ['skatteverket.se'],
  instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com', 'fb.me'], netflix: ['netflix.com'], spotify: ['spotify.com'],
  steam: ['steampowered.com', 'steamcommunity.com'], discord: ['discord.com', 'discord.gg'], tiktok: ['tiktok.com'], amazon: ['amazon.com', 'amazon.se'],
  dhl: ['dhl.com', 'dhl.se'], blocket: ['blocket.se'], tradera: ['tradera.com'], adraze: ['adraze.app', 'adraze.com'],
};
function localLinkSigns(u) {
  const out = [], host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') out.push({ lvl: 'warn', t: T('Sidan är inte krypterad (http). Skriv inte in något känsligt.') });
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) out.push({ lvl: 'warn', t: T('Länken går till en IP-adress i stället för ett namn. Seriösa sajter gör sällan så.') });
  if (host.split('.').some((p) => p.startsWith('xn--'))) out.push({ lvl: 'warn', t: T('Domänen innehåller specialtecken som kan få den att likna en annan sajt.') });
  if (u.username || u.password) out.push({ lvl: 'danger', t: T('Länken innehåller ett "@"-trick som döljer vart den egentligen går.') });
  if (SHORTENERS.has(host)) out.push({ lvl: 'warn', t: T('Förkortad länk: du ser inte vart den till slut går. Kolla den grundligt först.') });
  if (u.port && !['80', '443'].includes(u.port)) out.push({ lvl: 'warn', t: tf('Länken använder en ovanlig port ({p}).', { p: u.port }) });
  if (RISKY_EXT.test(u.pathname)) out.push({ lvl: 'danger', t: tf('Länken laddar ner en fil ({e}) som kan vara ett program. Öppna aldrig filer du inte väntat dig.', { e: u.pathname.split('.').pop().toLowerCase() }) });
  const flat = host.replace(/[-.0-9]/g, '');
  for (const [brand, real] of Object.entries(BRANDS)) {
    if (!flat.includes(brand)) continue;
    if (!real.some((d) => host === d || host.endsWith('.' + d))) { out.push({ lvl: 'danger', t: tf('Domänen innehåller "{b}" men är inte deras riktiga sajt ({d}). Vanligt knep vid bedrägerier.', { b: brand, d: real[0] }) }); break; }
  }
  if (host.split('.').length > 5) out.push({ lvl: 'warn', t: T('Ovanligt lång domän med många delar.') });
  return out;
}
const lkModal = $('modal-link');
let lkCurrent = null, lkDanger = false;
function lkStatus(cls, ico, title, items) {
  const el = $('lk-status'); el.className = 'lk-status ' + cls;
  el.innerHTML = '<span class="ico">' + ico + '</span><div>' + (title ? '<b>' + esc(title) + '</b> ' : '') + '</div>';
  const div = el.lastElementChild;
  if (items && items.length) { const ul = document.createElement('ul'); ul.className = 'lk-list'; for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); } div.appendChild(ul); }
}
async function openLinkCheck(href) {
  let u; try { u = new URL(href); } catch { return; }
  if (!/^https?:$/.test(u.protocol)) return;
  lkCurrent = href; lkDanger = false;
  $('lk-host').textContent = u.hostname;
  $('lk-url').textContent = href;
  const openBtn = $('lk-open');
  openBtn.textContent = T('Öppna'); openBtn.className = 'btn'; openBtn.disabled = true;
  lkStatus('', '⏳', '', null); $('lk-status').lastElementChild.textContent = T('Kollar länken mot listor över farliga sajter…');
  lkModal.classList.add('open');
  const signs = localLinkSigns(u);
  let srv = null;
  try { srv = await POST('/links/check', { url: href }); } catch {}
  if (lkCurrent !== href) return;
  const hits = (srv && srv.hits) || [];
  const danger = (srv && srv.verdict === 'danger') || signs.some((s) => s.lvl === 'danger');
  const warn = danger || (srv && srv.verdict === 'warn') || signs.length > 0;
  const items = hits.map((h) => String(h.why || '') + (h.list ? ' (' + h.list + ')' : '')).concat(signs.map((s) => s.t));
  if (danger) {
    lkStatus('danger', '⛔', T('Farlig länk. Öppna den inte.'), items);
    openBtn.textContent = T('Öppna ändå'); openBtn.className = 'btn danger'; lkDanger = true;
  } else if (warn) lkStatus('warn', '⚠️', T('Var försiktig.'), items);
  else if (srv && srv.lists_ready) lkStatus('clean', '✓', '', [T('Inga träffar i listorna över kända farliga sajter. Det betyder inte att sajten garanterat är säker, men inga varningstecken hittades.')]);
  else lkStatus('warn', '⚠️', T('Kunde inte kolla listorna just nu. Öppna bara om du litar på avsändaren.'), items);
  openBtn.disabled = false;
}
function closeLinkCheck() { lkModal.classList.remove('open'); lkCurrent = null; }
$('lk-cancel').addEventListener('click', closeLinkCheck);
$('lk-open').addEventListener('click', async () => {
  const href = lkCurrent; if (!href) return;
  if (lkDanger && !(await confirmBox(T('Länken är flaggad som farlig. Är du helt säker på att du vill öppna den?'), T('Öppna ändå'), true))) return;
  window.open(href, '_blank', 'noopener,noreferrer');   // huvudprocessen öppnar den som ny flik
  closeLinkCheck();
});
// "Kolla grundligt": AdRazes länkkoll i en ny flik (djupskanning finns inte i chattens API än)
$('lk-deep').addEventListener('click', () => {
  const href = lkCurrent; if (!href) return;
  window.open('https://adraze.app/kolla?url=' + encodeURIComponent(href), '_blank', 'noopener,noreferrer');
  closeLinkCheck();
});
$('chat-body').addEventListener('click', (e) => {
  const a = e.target.closest('a.c-link, .lp-card'); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  openLinkCheck(a.dataset.href);
});
// Förhandsvisning: hämtas av VÅR server åt avsändaren och bäddas in krypterad i meddelandet.
function cleanPreview(lp, text) {
  const href = safeHref(String(lp.u || '')); if (!href) return null;
  const inText = (String(text).match(LINK_RE) || []).map((m) => safeHref(cleanLinkTail(m)[0])).includes(href);
  if (!inText) return null;
  const t = (v, n) => String(v || '').replace(/[\u0000-\u001f‪-‮⁦-⁩]/g, ' ').trim().slice(0, n);
  const icon = typeof lp.i === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]{20,6000}$/.test(lp.i) ? lp.i : null;
  const out = { u: href, t: t(lp.t, 120), d: t(lp.d, 240), s: t(lp.s, 60), i: icon };
  return (out.t || out.d) ? out : null;
}
function previewCardHtml(lp) {
  let host = ''; try { host = new URL(lp.u).hostname; } catch {}
  const ico = lp.i ? '<img class="lp-ico" alt="" src="' + esc(lp.i) + '">' : '<span class="lp-ico none">🌐</span>';
  return '<span class="lp-card" data-href="' + esc(lp.u) + '" role="link" tabindex="0">' + ico + '<span class="lp-body"><span class="lp-host">' + esc(host) + (lp.s && lp.s.toLowerCase() !== host.toLowerCase() ? ' · ' + esc(lp.s) : '') + '</span>' +
    (lp.t ? '<span class="lp-title">' + esc(lp.t) + '</span>' : '') + (lp.d ? '<span class="lp-desc">' + esc(lp.d) + '</span>' : '') + '</span></span>';
}
function shrinkIcon(dataUrl) {
  return new Promise((res) => {
    if (!safeImg(dataUrl) && !/^data:image\/(png|gif|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,/.test(String(dataUrl))) { res(null); return; }
    const im = new Image();
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, 32, 32); const d = c.toDataURL('image/png'); res(d.length < 6000 ? d : null); } catch { res(null); } };
    im.onerror = () => res(null); im.src = dataUrl;
  });
}
async function fetchLinkPreview(text) {
  const m = String(text).match(LINK_RE); if (!m) return null;
  const href = safeHref(cleanLinkTail(m[0])[0]); if (!href) return null;
  try {
    const r = await Promise.race([POST('/links/preview', { url: href }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))]);
    if (!r || r.blocked || (!r.title && !r.desc)) return null;
    const i = r.icon ? await shrinkIcon(r.icon) : null;
    return { u: href, t: r.title || '', d: r.desc || '', s: r.site || '', i: i || undefined };
  } catch { return null; }
}

// ===== Grupper =====
const groupNames = {}, groupAvatars = {};
async function groupAvatar(g, key) {
  if (!g.avatar_enc) return null;
  try { return safeImg(await decryptMsg(key, g.avatar_enc)); } catch { return null; }
}
let refreshingGroups = false;
async function refreshGroups() {
  if (!state || refreshingGroups) return;
  refreshingGroups = true;
  try {
    let r; try { r = await GET('/groups'); } catch { return; }
    if (!state) return;
    groupsCache = r.groups || [];
    const rows = [];
    unreadGroups = 0;
    for (const g of groupsCache) {
      let name = T('Grupp'), av = null;
      try { const key = await ensureGroupKey(g); name = await decryptMsg(key, g.name_enc); av = await groupAvatar(g, key); } catch {}
      groupNames[g.id] = name; groupAvatars[g.id] = av;
      const isOpen = active && active.kind === 'group' && active.id === g.id;
      const div = document.createElement('div'); div.className = 'contact' + (isOpen ? ' active' : '');
      div.innerHTML = '<span class="avatar grp-avatar">' + (av ? '<img class="av-img" alt="" src="' + esc(av) + '">' : '#') + '</span><span class="cname">' + esc(name) + '</span>';
      if (g.unread && !(isOpen && panelVisible)) { unreadGroups += g.unread; const b = document.createElement('span'); b.className = 'badge'; b.textContent = g.unread; div.appendChild(b); }
      div.addEventListener('click', () => openGroup(g));
      rows.push(div);
      if (isOpen) {
        active.name = name; $('peer-name').textContent = name; $('grp-count').textContent = g.member_count || '';
        if (av !== active.avatar) { active.avatar = av; $('peer-avatar').innerHTML = av ? '<img class="av-img" alt="" src="' + esc(av) + '">' : '#'; }
      }
    }
    const gl = $('groups-list'); gl.innerHTML = '';
    if (!rows.length) gl.innerHTML = '<div class="empty-hint" translate="yes">' + esc(T('Inga grupper än. Skapa en med "+ Ny grupp".')) + '</div>';
    rows.forEach((d) => gl.appendChild(d));
    if (active && active.kind === 'group' && !groupsCache.some((g) => g.id === active.id)) {
      const name = active.name; delete groupKeyCache[active.id]; closeChat();
      alertBox(tf('Du är inte längre med i gruppen "{g}".', { g: name }));
    }
    checkNotify('g:', groupsCache.map((g) => ({ id: g.id, unread: g.unread })));
    pushUnread();
  } finally { refreshingGroups = false; }
}
function pickRows(container, list) {
  container.innerHTML = '';
  for (const c of list) {
    const row = document.createElement('label'); row.className = 'pick-row';
    row.innerHTML = '<input type="checkbox" value="' + esc(c.id) + '"><span class="avatar sm">' + avatarInner(c.username) + '</span><span class="cname">' + esc(c.username) + '</span>';
    container.appendChild(row);
  }
}
const modalCreate = $('modal-create-group');
$('btn-new-group').addEventListener('click', () => {
  $('group-name').value = ''; $('group-create-msg').textContent = '';
  const pick = $('group-pick');
  if (!contactsCache.length) pick.innerHTML = '<div class="empty-hint pad" translate="yes">' + esc(T('Du har inga vänner än. Lägg till vänner först.')) + '</div>';
  else pickRows(pick, contactsCache);
  modalCreate.classList.add('open');
  setTimeout(() => $('group-name').focus(), 30);
});
$('group-cancel').addEventListener('click', () => modalCreate.classList.remove('open'));
$('group-create-go').addEventListener('click', () => busy($('group-create-go'), 'Skapar…', async () => {
  const msg = $('group-create-msg'); msg.textContent = '';
  const name = $('group-name').value.trim();
  if (!name) { msg.textContent = T('Ge gruppen ett namn.'); return; }
  const checked = Array.from(document.querySelectorAll('#group-pick input:checked')).map((i) => i.value);
  if (!checked.length) { msg.textContent = T('Välj minst en vän.'); return; }
  try {
    const { key, raw } = await genGroupKey();
    const nameEnc = await encryptMsg(key, name);
    const members = [];
    for (const uid of [state.id, ...checked]) members.push({ user_id: uid, key_envelope: await wrapGroupKey(raw, await getPubKey(uid)) });
    const r = await POST('/groups/create', { name_enc: nameEnc, members });
    groupKeyCache[r.id] = key;
    modalCreate.classList.remove('open');
    await refreshGroups();
    const g = groupsCache.find((x) => x.id === r.id); if (g) openGroup(g);
  } catch (e) { msg.textContent = e.message || T('Kunde inte skapa gruppen.'); }
}));

// Medlemmar och inställningar
const modalMembers = $('modal-members');
let mmMembers = [], mmAmAdmin = false;
$('chat-info').addEventListener('click', openMembers);
async function openMembers() {
  if (!active || active.kind !== 'group') return;
  const gid = active.id;
  const msg = $('mm-msg'); msg.textContent = '';
  $('mm-title').textContent = active.name;
  const mmAv = $('mm-avatar'); mmAv.innerHTML = active.avatar ? '<img class="av-img" alt="" src="' + esc(active.avatar) + '">' : '#';
  const list = $('mm-list'); list.innerHTML = '<div class="empty-hint" translate="yes">' + esc(T('Hämtar…')) + '</div>';
  modalMembers.classList.add('open');
  try {
    const r = await GET('/groups/members', { id: gid });
    if (!active || active.id !== gid) return;
    mmMembers = (r.members || []).map((m) => Object.assign({}, m, { id: String(m.id) }));
    const owner = String(r.owner_id);
    const meRow = mmMembers.find((m) => m.id === state.id);
    mmAmAdmin = owner === state.id || !!(meRow && meRow.is_admin);
    $('mm-sub').textContent = tf('{n} medlemmar · krypterad grupp', { n: mmMembers.length });
    $('mm-rename').hidden = !mmAmAdmin; $('mm-avatar-rm').hidden = !mmAmAdmin || !active.avatar;
    mmAv.disabled = !mmAmAdmin; mmAv.title = mmAmAdmin ? T('Byt gruppbild') : '';
    list.innerHTML = '';
    for (const m of mmMembers) {
      rememberAvatar(m.username, m.avatar);
      const row = document.createElement('div'); row.className = 'member-row';
      const isOwner = m.id === owner, isAdm = isOwner || !!m.is_admin;
      let tags = '';
      if (isOwner) tags += '<span class="tag" translate="yes">' + esc(T('ägare')) + '</span>';
      else if (isAdm) tags += '<span class="tag" translate="yes">' + esc(T('admin')) + '</span>';
      if (m.id === state.id) tags += '<span class="tag" translate="yes">' + esc(T('du')) + '</span>';
      row.innerHTML = '<span class="avatar sm">' + avatarInner(m.username) + '</span><span class="cname">' + esc(m.username) + '</span>' + tags;
      const btn = (label, run, danger) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mm-act' + (danger ? ' danger' : ''); b.textContent = T(label); b.setAttribute('translate', 'yes');
        b.addEventListener('click', async () => { b.disabled = true; try { await run(); } catch (e) { b.disabled = false; msg.textContent = e.message; } });
        row.appendChild(b);
      };
      if (mmAmAdmin && !isOwner && m.id !== state.id) {
        if (m.is_admin) btn('Ta bort admin', async () => { await POST('/groups/demote', { id: gid, user_id: m.id }); openMembers(); });
        else btn('Gör till admin', async () => { await POST('/groups/promote', { id: gid, user_id: m.id }); openMembers(); });
      }
      // Alla får ta bort andra medlemmar, men aldrig ägaren (och inte sig själv: lämna i stället)
      if (!isOwner && m.id !== state.id) btn('Ta bort', async () => {
        if (!(await confirmBox(tf('Ta bort {u} ur gruppen "{g}"?', { u: m.username, g: active.name }), T('Ta bort'), true))) throw new Error('');
        await POST('/groups/kick', { id: gid, user_id: m.id }); openMembers(); refreshGroups();
      }, true);
      list.appendChild(row);
    }
  } catch (e) { list.innerHTML = '<div class="empty-hint">' + esc(e.message) + '</div>'; }
}
$('mm-close').addEventListener('click', () => modalMembers.classList.remove('open'));
$('mm-rename').addEventListener('click', async () => {
  if (!active || active.kind !== 'group') return;
  const name = await promptBox(T('Nytt gruppnamn:'), active.name);
  if (!name || !String(name).trim() || !active) return;
  try {
    const nm = String(name).trim().slice(0, 60);
    await POST('/groups/rename', { id: active.id, name_enc: await encryptMsg(active.key, nm) });
    active.name = nm; groupNames[active.id] = nm;
    $('peer-name').textContent = nm; $('mm-title').textContent = nm;
    refreshGroups();
  } catch (e) { $('mm-msg').textContent = e.message; }
});
$('mm-avatar').addEventListener('click', () => { if (mmAmAdmin) $('mm-avatar-file').click(); });
$('mm-avatar-file').addEventListener('change', async () => {
  const input = $('mm-avatar-file'), file = input.files && input.files[0]; input.value = '';
  if (!file || !active || active.kind !== 'group') return;
  try {
    const url = squareJpeg(await loadImageFile(file), 256, 140000);
    if (!url) throw new Error(T('Bilden gick inte att komprimera tillräckligt. Prova en annan.'));
    await POST('/groups/avatar', { id: active.id, avatar_enc: await encryptMsg(active.key, url) });
    active.avatar = url; groupAvatars[active.id] = url;
    $('peer-avatar').innerHTML = '<img class="av-img" alt="" src="' + esc(url) + '">';
    $('mm-avatar').innerHTML = '<img class="av-img" alt="" src="' + esc(url) + '">'; $('mm-avatar-rm').hidden = false;
    refreshGroups();
  } catch (e) { $('mm-msg').textContent = e.message || T('Kunde inte spara gruppbilden.'); }
});
$('mm-avatar-rm').addEventListener('click', async () => {
  if (!active || active.kind !== 'group') return;
  try {
    await POST('/groups/avatar', { id: active.id, avatar_enc: null });
    active.avatar = null; groupAvatars[active.id] = null;
    $('peer-avatar').textContent = '#'; $('mm-avatar').textContent = '#'; $('mm-avatar-rm').hidden = true;
    refreshGroups();
  } catch (e) { $('mm-msg').textContent = e.message; }
});
$('mm-leave').addEventListener('click', async () => {
  if (!active || active.kind !== 'group') return;
  if (!(await confirmBox(tf('Lämna gruppen "{g}"? Du kommer bara tillbaka om någon lägger till dig igen.', { g: active.name }), T('Lämna'), true))) return;
  try {
    await POST('/groups/leave', { id: active.id });
    delete groupKeyCache[active.id];
    modalMembers.classList.remove('open');
    closeChat();
    refreshGroups();
  } catch (e) { $('mm-msg').textContent = e.message; }
});
const modalAdd = $('modal-add-member');
$('mm-add').addEventListener('click', () => {
  if (!active || active.kind !== 'group') return;
  $('addmem-msg').textContent = '';
  const inGroup = new Set(mmMembers.map((m) => m.id));
  const avail = contactsCache.filter((c) => !inGroup.has(c.id));
  const pick = $('addmem-pick');
  if (!avail.length) pick.innerHTML = '<div class="empty-hint pad" translate="yes">' + esc(T('Alla dina vänner är redan med.')) + '</div>';
  else pickRows(pick, avail);
  modalAdd.classList.add('open');
});
$('addmem-cancel').addEventListener('click', () => modalAdd.classList.remove('open'));
$('addmem-go').addEventListener('click', () => busy($('addmem-go'), 'Lägger till…', async () => {
  if (!active || active.kind !== 'group') return;
  const msg = $('addmem-msg'); msg.textContent = '';
  const checked = Array.from(document.querySelectorAll('#addmem-pick input:checked')).map((i) => i.value);
  if (!checked.length) { msg.textContent = T('Välj minst en vän.'); return; }
  try {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', active.key));
    for (const uid of checked) await POST('/groups/members', { id: active.id, user_id: uid, key_envelope: await wrapGroupKey(raw, await getPubKey(uid)) });
    modalAdd.classList.remove('open');
    await openMembers();
    refreshGroups();
  } catch (e) { msg.textContent = e.message; }
}));

// ===== Chattinställningar =====
const modalSettings = $('modal-settings');
$('btn-settings').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', () => modalSettings.classList.remove('open'));
async function openSettings() {
  $('priv-msg').textContent = ''; $('block-msg').textContent = ''; $('block-name').value = '';
  accToggle('del-form', false); $('del-name').value = ''; accMsg('del-msg', '');
  const p = chatPrefs();
  document.querySelectorAll('[data-chat]').forEach((el) => { el.checked = !!p[el.dataset.chat]; });
  document.querySelectorAll('[data-priv], #priv-requests').forEach((el) => { el.disabled = true; });
  renderBlocked();
  modalSettings.classList.add('open');
  try {
    const r = await GET('/users/privacy');
    const pv = r.privacy || {};
    document.querySelectorAll('[data-priv]').forEach((el) => { el.checked = !!pv[el.dataset.priv]; el.disabled = false; });
    $('priv-requests').checked = pv.requests !== 'none'; $('priv-requests').disabled = false;
  } catch (e) { $('priv-msg').textContent = e.message; }
}
document.querySelectorAll('[data-chat]').forEach((el) => el.addEventListener('change', async () => {
  const k = el.dataset.chat;
  if (k === 'notify' && el.checked && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  setChatPref(k, el.checked);
}));
async function savePrivacy(body, el) {
  $('priv-msg').textContent = ''; el.disabled = true;
  try { await POST('/users/privacy', body); } catch (e) { el.checked = !el.checked; $('priv-msg').textContent = e.message; }
  finally { el.disabled = false; }
}
document.querySelectorAll('[data-priv]').forEach((el) => el.addEventListener('change', () => savePrivacy({ [el.dataset.priv]: el.checked }, el)));
$('priv-requests').addEventListener('change', (e) => savePrivacy({ requests: e.target.checked ? 'all' : 'none' }, e.target));
function renderBlocked() {
  const ul = $('block-list'); ul.innerHTML = '';
  if (!blockedCache.length) { const li = document.createElement('li'); li.className = 'empty-hint'; li.setAttribute('translate', 'yes'); li.textContent = T('Du har inte blockerat någon.'); ul.appendChild(li); return; }
  for (const b of blockedCache) {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.className = 'cname'; n.textContent = b.username; li.appendChild(n);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'link-btn'; btn.setAttribute('translate', 'yes'); btn.textContent = T('Häv blockering');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await POST('/contacts/unblock', { username: b.username }); blockedCache = blockedCache.filter((x) => x !== b); renderBlocked(); refreshContacts(); }
      catch (e) { btn.disabled = false; $('block-msg').textContent = e.message; }
    });
    li.appendChild(btn); ul.appendChild(li);
  }
}
$('block-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('block-go').click(); });
$('block-go').addEventListener('click', async () => {
  const msg = $('block-msg'); msg.textContent = '';
  const u = $('block-name').value.trim();
  if (!validUsername(u)) { msg.textContent = T('Skriv ett giltigt användarnamn.'); return; }
  if (!(await confirmBox(tf('Blockera {u}? Personen tas bort som vän och kan inte kontakta dig.', { u }), T('Blockera'), true))) return;
  try {
    await POST('/contacts/block', { username: u });
    $('block-name').value = '';
    if (active && active.kind === 'contact' && active.name.toLowerCase() === u.toLowerCase()) closeChat();
    await refreshContacts(); renderBlocked();
  } catch (e) { msg.textContent = e.message; }
});
$('del-open').addEventListener('click', () => { accToggle('del-form', true); $('del-name').focus(); });
$('del-cancel').addEventListener('click', () => accToggle('del-form', false));
$('del-go').addEventListener('click', () => busy($('del-go'), 'Raderar…', async () => {
  accMsg('del-msg', '');
  try {
    if ($('del-name').value.trim().toLowerCase() !== state.username.toLowerCase()) throw new Error(T('Skriv ditt användarnamn exakt för att bekräfta.'));
    const k = await kontoNyckel();
    await POST('/users/delete', { login_hash: k.loginHash });
    try { await idbDel('priv:' + state.id); } catch {}
    resetAll();
    resetCreate();
    showView('create');
    toast(T('Chattprofilen är raderad.'));
  } catch (e) { accMsg('del-msg', e.message || T('Kunde inte radera.')); }
}));

// ===== Notiser =====
let audioCtx = null;
function playPling() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.4);
  } catch {}
}
let notifyPrimed = false;   // första kollen efter start ska inte plinga för gammalt oläst
function maybeNotify(n) {
  if (n <= 0) return;
  if (chatPref('sound')) playPling();
  if (panelVisible || !chatPref('notify') || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification('AdRaze', { body: n === 1 ? T('Du har ett nytt meddelande i chatten') : tf('Du har {n} nya meddelanden i chatten', { n }), tag: 'adraze-chatt', silent: true }); } catch {}
}
function checkNotify(prefix, items) {
  let fresh = 0;
  for (const it of items) {
    const key = prefix + it.id, had = key in prevUnread, prev = prevUnread[key] || 0;
    if (had && (it.unread || 0) > prev) fresh += it.unread - prev;
    prevUnread[key] = it.unread || 0;
  }
  if (notifyPrimed) maybeNotify(fresh);
}

// ===== Polling =====
function startPolling() { stopPolling(); if (panelVisible) pollTimer = setInterval(() => pollMessages(false), 3500); }
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
function startBgPolling() {
  if (bgTimer) clearInterval(bgTimer);
  setTimeout(() => { notifyPrimed = true; }, 4000);
  bgTimer = setInterval(() => { refreshContacts(); refreshGroups(); }, 9000);
}

// ===== Tangentbord =====
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('modal-dialog').classList.contains('open')) { dlgDone(null); return; }
  if (lightbox.classList.contains('open')) { closeLightbox(); return; }
  if (ctxMenu.classList.contains('open')) { closeCtxMenu(); return; }
  if (stx.ov.classList.contains('open')) { closeStickerEditor(); return; }
  const open = document.querySelector('.modal-overlay.open');
  if (open) { open.classList.remove('open'); if (open === lkModal) lkCurrent = null; return; }
  if (stPanel.classList.contains('open')) { closeStickerPanel(); return; }
  if (fullView) setFull(false);
});
// Klick utanför en ruta stänger den (inte dialogrutan: där måste man välja)
document.querySelectorAll('.modal-overlay').forEach((m) => {
  if (m.id === 'modal-dialog') return;
  m.addEventListener('click', (e) => { if (e.target === m) { m.classList.remove('open'); if (m === lkModal) lkCurrent = null; if (m === rpModal) reportCtx = null; } });
});

start();
