// Anpassa: startsidan (huvudprocessen). Registrerar startsidans nycklar i Anpassa-butiken och hämtar
// väder och orter från Open-Meteo (ingen API-nyckel). Skalets CSP släpper inte ut fetch till nätet,
// därför går hämtningen via huvudprocessen (net.fetch = Chromiums nätverk, samma DNS-inställningar som flikarna).
// Inget hämtas förrän skalet ber om det, och skalet ber bara när väderwidgeten finns på startsidan.
const { ipcMain, net } = require('electron');
const anpassa = require('./anpassa');

// Rena utseendeval: inget här laddar webbsidor eller kringgår barnspärrar, så inget är barnlåst.
// Ort och anteckning är personliga och ligger därför i skalets localStorage, inte här (de ska inte följa med i en delningskod).
const NYCKLAR = [
  { nyckel: 'startsida.layout', standard: [{ w: 'genvagar', s: 'bred' }], etikett: 'Startsidans widgetar' },
  { nyckel: 'startsida.sokfalt', standard: true, etikett: 'Sökfält på startsidan' },
  { nyckel: 'startsida.logga', standard: false, etikett: 'Logga på startsidan' },
  { nyckel: 'startsida.halsning', standard: true, etikett: 'Klocka och hälsning' },
  { nyckel: 'startsida.bakgrund', standard: true, etikett: 'Bakgrundsbild på startsidan' },
  { nyckel: 'startsida.statistik', standard: true, etikett: 'Statistik längst ned' },
  { nyckel: 'startsida.stil', standard: 'frostad', etikett: 'Widgetarnas stil' },
  { nyckel: 'startsida.klocka', standard: 'digital', etikett: 'Klockans utseende' },
  { nyckel: 'startsida.tom', standard: false, etikett: 'Tom startsida' },
];

const CACHE_MS = 30 * 60 * 1000;   // vädret cachas i 30 minuter (delas av alla fönster)
const cache = new Map();           // "lat,lon" → { ts, data }
const pagar = new Map();           // "lat,lon" → Promise (två fönster som frågar samtidigt ger en hämtning)
const stat = { vaderHamtningar: 0, ortSokningar: 0 };   // för testerna

const tal = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const kod = (v) => (Number.isInteger(v) && v >= 0 && v < 100 ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

async function hamtaJson(url) {
  const res = await net.fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

// Bara de fält widgeten visar, kontrollerade (svaret kommer utifrån)
function forenkla(j) {
  const c = (j && j.current) || {}, d = (j && j.daily) || {};
  const dagar = [];
  const n = Math.min(7, Array.isArray(d.time) ? d.time.length : 0);
  for (let i = 0; i < n; i++) {
    const datum = text(d.time[i], 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) continue;
    dagar.push({ datum, kod: kod((d.weather_code || [])[i]), max: tal((d.temperature_2m_max || [])[i]), min: tal((d.temperature_2m_min || [])[i]) });
  }
  return { temp: tal(c.temperature_2m), kanns: tal(c.apparent_temperature), kod: kod(c.weather_code), dag: c.is_day !== 0, vind: tal(c.wind_speed_10m), dagar };
}

async function vader(arg) {
  const lat = Number(arg && arg.lat), lon = Number(arg && arg.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'plats' };
  const nyckel = lat.toFixed(2) + ',' + lon.toFixed(2);
  const c = cache.get(nyckel);
  if (c && Date.now() - c.ts < CACHE_MS) return { ok: true, ts: c.ts, data: c.data };
  if (pagar.has(nyckel)) return pagar.get(nyckel);
  const p = (async () => {
    try {
      stat.vaderHamtningar++;
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4)
        + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6&wind_speed_unit=ms';
      const data = forenkla(await hamtaJson(url));
      if (data.temp === null) return { ok: false, error: 'svar' };
      const ts = Date.now();
      cache.set(nyckel, { ts, data });
      return { ok: true, ts, data };
    } catch { return { ok: false, error: 'natet' }; } finally { pagar.delete(nyckel); }
  })();
  pagar.set(nyckel, p);
  return p;
}

// Ortsök (Open-Meteos geokodning). Användaren skriver själv in orten – ingen platsåtkomst.
async function ortSok(q) {
  q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return [];
  try {
    stat.ortSokningar++;
    const j = await hamtaJson('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=sv&format=json');
    return (Array.isArray(j && j.results) ? j.results : []).map((r) => ({
      namn: text(r.name, 80), region: text(r.admin1, 80), land: text(r.country, 60), lat: Number(r.latitude), lon: Number(r.longitude),
    })).filter((r) => r.namn && Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180).slice(0, 6);
  } catch { return null; }   // null = nätfel (skalet visar "försök igen"), [] = inga träffar
}

let klar = false;
function init() {
  if (klar) return; klar = true;
  for (const n of NYCKLAR) anpassa.registrera(n);
  ipcMain.handle('startsida:vader', (_e, arg) => vader(arg));
  ipcMain.handle('startsida:ort-sok', (_e, q) => ortSok(q));
}

module.exports = { init, NYCKLAR, _stat: stat };
