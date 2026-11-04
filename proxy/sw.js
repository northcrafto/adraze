// AdRaze Proxy – service worker. Byggs till proxy/sw.js av bygg.py.
// Scramjet skriver om sidorna så att allt de hämtar hamnar här. Innan något hämtas prövas adressen mot
// AdRazes regler (samma som tillägget). Reklam och spårare stoppas, och HTML-sidor får AdRazes kosmetik-CSS.
importScripts('/motor/scram/scramjet.all.js', '/adraze/filtermotor.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const PREFIX = '/s/';
const CACHE = 'adraze-regler';

self.addEventListener('install', (e) => { e.waitUntil(hamtaRegler(true).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---------- reglerna ----------
let matchare = null;
async function hamtaRegler(tvinga) {
  const cache = await caches.open(CACHE);
  let svar = tvinga ? null : await cache.match('/adraze/regler.json');
  if (!svar) {
    svar = await fetch('/adraze/regler.json', { cache: 'no-cache' });
    if (!svar.ok) throw new Error('regler ' + svar.status);
    await cache.put('/adraze/regler.json', svar.clone());
  }
  return new AdRazeFilter.Matchare(await svar.json());
}
let laddar = null;
function regler() {
  if (matchare) return Promise.resolve(matchare);
  return (laddar ||= hamtaRegler(false).then((m) => { matchare = m; return m; }).catch((e) => { laddar = null; console.warn('AdRaze: regler', e); return null; }));
}
// Nya regler en gång i timmen (servern byter när tillägget släpper nya listor)
let senast = Date.now();
async function kanskeNyaRegler() {
  if (Date.now() - senast < 3_600_000) return;
  senast = Date.now();
  try { matchare = await hamtaRegler(true); } catch {}
}

// ---------- hjälp ----------
const TYP = { '': 'xmlhttprequest', document: 'main_frame', iframe: 'sub_frame', frame: 'sub_frame', script: 'script', style: 'stylesheet',
  image: 'image', font: 'font', audio: 'media', video: 'media', track: 'media', object: 'object', embed: 'object', worker: 'script',
  sharedworker: 'script', serviceworker: 'script', manifest: 'other', report: 'ping', xslt: 'other', paintworklet: 'script', audioworklet: 'script' };
function avkoda(adress) {
  try {
    const u = new URL(adress, self.location.origin);
    if (u.origin !== self.location.origin || !u.pathname.startsWith(PREFIX)) return null;
    return decodeURIComponent(u.pathname.slice(PREFIX.length)) ;
  } catch { return null; }
}
const vardAv = (adress) => { try { return new URL(adress).hostname.toLowerCase(); } catch { return null; } };

async function sidansVard(e) {
  const fran = e.request.referrer && avkoda(e.request.referrer);
  if (fran) return vardAv(fran);
  if (e.clientId) {
    const k = await self.clients.get(e.clientId);
    const a = k && avkoda(k.url);
    if (a) return vardAv(a);
  }
  return null;
}

// Räknaren i adressfältet: skicka i klumpar till skalet (sidor som inte ligger under /s/)
let kö = [];
let timer = null;
function rapportera(post) {
  kö.push(post);
  if (timer) return;
  timer = setTimeout(async () => {
    const lista = kö; kö = []; timer = null;
    for (const k of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (!new URL(k.url).pathname.startsWith(PREFIX)) k.postMessage({ adraze: 'stoppade', lista });
    }
  }, 250);
}

const STOPPSIDA = (vard) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdRaze</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111113;color:#f2f2ef;font:17px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
b{display:block;font-size:28px;letter-spacing:-.03em;margin-bottom:8px}span{color:#ff4b1f}</style>
<div><b>AdRaze <span>stoppade</span> sidan</b>${vard ? `<p>${vard.replace(/[<>&"]/g, '')}</p>` : ''}<p>Den finns på våra listor över farliga sidor. / This site is on our list of dangerous sites.</p></div>`;

// ---------- förfrågningarna ----------
async function hantera(e) {
  await scramjet.loadConfig();
  if (!scramjet.route(e)) return fetch(e.request);
  const adress = avkoda(e.request.url);
  const m = adress && await regler();
  if (m) {
    kanskeNyaRegler();
    const typ = TYP[e.request.destination] ?? 'other';
    const fran = typ === 'main_frame' ? null : await sidansVard(e);
    const traff = m.klassa({ url: adress, typ, fran });
    if (traff) {
      rapportera({ kat: traff.kat, vard: vardAv(adress), sida: fran });
      if (typ === 'main_frame' || typ === 'sub_frame') {
        return new Response(traff.kat === 'farlig' || typ === 'main_frame' ? STOPPSIDA(vardAv(adress)) : '', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (traff.stubb) {
        const s = await fetch('/adraze' + traff.stubb).catch(() => null);
        if (s && s.ok) return new Response(s.body, { status: 200, headers: { 'Content-Type': s.headers.get('Content-Type') || 'text/plain' } });
      }
      return Response.error();
    }
  }
  return scramjet.fetch(e);
}
self.addEventListener('fetch', (e) => e.respondWith(hantera(e)));

// HTML-sidor (även inbäddade ramar) får AdRazes kosmetik (döljer annonsytor och kakrutor) och tilläggets
// sidskript: avvisar kakrutor, stoppar popunders och spolar förbi YouTube-reklam
scramjet.addEventListener('handleResponse', (ev) => {
  if (ev.destination !== 'document' && ev.destination !== 'iframe') return;
  if (typeof ev.responseBody !== 'string') return;
  const typ = Object.entries(ev.responseHeaders || {}).find(([k]) => k.toLowerCase() === 'content-type');
  if (typ && !/text\/html/i.test(typ[1])) return;
  const vard = ev.url.hostname.toLowerCase();
  const lank = `<link rel="stylesheet" href="${self.location.origin}/adraze/k.css?h=${encodeURIComponent(vard)}" data-adraze>`
    + `<script src="${self.location.origin}/adraze/sida.js" data-adraze></script>`;
  const b = ev.responseBody;
  const i = b.search(/<\/head\s*>/i);
  ev.responseBody = i >= 0 ? b.slice(0, i) + lank + b.slice(i) : lank + b;
});
