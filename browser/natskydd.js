'use strict';
/* Skydd för det lokala nätverket, som Braves "localhost-skydd" och Chromes Local Network Access:
 * en sajt på internet får inte i smyg prata med din dator (localhost), din router eller andra
 * prylar hemma (192.168.x.x, 10.x.x.x, *.local …). Utan skyddet kan vilken sida som helst
 * portskanna datorn, kapa routrar via deras webbgränssnitt (CSRF) eller attackera lokala
 * utvecklingsservrar. Sajter som behöver det (Trezor, Lenovo, Intel-drivrutiner …) finns i
 * Braves undantagslista (brave-localhost.txt), som uppdateras med filterlistorna.
 * Gäller underresurser och ramar; att själv klicka sig till routerns sida fungerar som vanligt. */
const fs = require('fs');
const path = require('path');

function privatVard(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home.arpa') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '0.0.0.0') return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;           // CGNAT/Tailscale
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  if (/^::ffff:(127|10|192\.168)\./.test(h)) return true;
  return false;
}

function vardAv(u) { try { return new URL(u).hostname; } catch { return ''; } }
function bas(h) {
  const d = String(h || '').split('.');
  return d.length > 2 && /^(co|com|org|net|gov|ac|edu)$/.test(d[d.length - 2]) && d[d.length - 1].length === 2 ? d.slice(-3).join('.') : d.slice(-2).join('.');
}

class NatSkydd {
  constructor(listDirs) { this.listDirs = listDirs; this.tillatna = new Set(); this.lastAt = 0; this.ladda(); }
  // Undantagslistan: den hämtade (userData) om den finns, annars den som följer med appen
  ladda() {
    for (const dir of this.listDirs) {
      if (!dir) continue;
      try {
        const text = fs.readFileSync(path.join(dir, 'brave-localhost.txt'), 'utf8');
        this.tillatna = new Set(text.split(/\r?\n/).map((r) => r.trim().toLowerCase()).filter((r) => r && !r.startsWith('#')));
        this.lastAt = Date.now();
        return;
      } catch {}
    }
  }
  tillaten(toppVard) {
    if (Date.now() - this.lastAt > 6 * 3600 * 1000) this.ladda();
    const h = String(toppVard || '').toLowerCase();
    return this.tillatna.has(h) || this.tillatna.has(bas(h));
  }
  /* true = stoppa förfrågan. toppUrl = flikens sida. */
  stoppa(url, resourceType, toppUrl) {
    if (resourceType === 'mainFrame') return false;
    const mal = vardAv(url);
    if (!privatVard(mal)) return false;
    if (!/^(https?|wss?):/i.test(String(toppUrl || ''))) return false;     // adraze://, file:, interna sidor
    const topp = vardAv(toppUrl);
    if (!topp || privatVard(topp)) return false;                            // sidan ligger själv på nätet hemma
    return !this.tillaten(topp);
  }
}

module.exports = { NatSkydd, privatVard };
