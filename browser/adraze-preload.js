'use strict';
/* AdRaze-blockeraren inne i sidan. Körs i varje ram före sidans egna skript (preload).
 * Kör tilläggets innehållsskript (adraze/content/) med ett litet chrome.runtime-skal
 * som svarar via IPC till adblock-adraze.js i stället för tilläggets bakgrundsskript:
 *   cosmetic.js – döljer annonsytor (CSS som användarstilmall) och tar tillbaka lockbeten
 *   kakor.js    – döljer och avvisar kakrutor
 *   guard.js    – stoppar popunders och osynliga klicklänkar (i sidans egen värld)
 *   youtube.js  – spolar förbi YouTube-reklam (i sidans egen värld) */
const { ipcRenderer, webFrame } = require('electron');

(function () {
  if (!/^https?:/.test(location.href)) return;
  let start = null;
  try { start = ipcRenderer.sendSync('adraze:start', location.hostname); } catch { return; }
  if (!start || !start.pa) return;

  const css = (text) => { if (text) { try { webFrame.insertCSS(text, { cssOrigin: 'user' }); } catch {} } };
  const svara = (msg) => {
    switch (msg && msg.typ) {
      case 'css': {
        const r = ipcRenderer.sendSync('adraze:css', msg.host);
        css(r.css);
        return { lockbete: r.css ? r.lockbete : null };
      }
      case 'kakor': {
        const kak = ipcRenderer.sendSync('adraze:kakor', msg.host) || {};
        css(kak.css || '');
        return { pa: !!kak.pa };
      }
      case 'kak-dolj': {
        const KAK_DOLJ = {
          sourcepoint: '[id^="sp_message_container"]{display:none!important}html.sp-message-open,html.sp-message-open body{overflow:auto!important}html.sp-message-open body{position:static!important}',
          didomi: '#didomi-host{display:none!important}body.didomi-popup-open,html.didomi-popup-open{overflow:auto!important}',
        };
        css(KAK_DOLJ[msg.cmp]);
        ipcRenderer.send('adraze:rakna', 'kakor');
        return true;
      }
      case 'kaka-avvisad': ipcRenderer.send('adraze:rakna', 'kakor'); return true;
      case 'popup-stoppad': ipcRenderer.send('adraze:rakna', 'popups'); return true;
      case 'dolj-regler': return ipcRenderer.sendSync('adraze:dolj-regler', msg.host, msg.tokens || []);
      default: return null;
    }
  };
  const chrome = { runtime: { sendMessage: (msg) => { try { return Promise.resolve(svara(msg)); } catch (e) { return Promise.reject(e); } } } };

  // Sidans egen värld först, så vakten hinner före sidans skript
  const huvud = [start.skript.guard];
  if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) huvud.push(start.skript.youtube);
  for (const s of huvud) if (s) { try { webFrame.executeJavaScript(s).catch(() => {}); } catch {} }

  // Preloaden kör innan <html> finns; innehållsskripten räknar med document.documentElement som i Chrome
  const kor = () => {
    for (const namn of ['cosmetic', 'kakor']) {
      const kod = start.skript[namn]; if (!kod) continue;
      try { new Function('chrome', kod)(chrome); } catch (e) { console.warn('[adraze] ' + namn + ':', e && e.message); }
    }
  };
  if (document.documentElement) kor();
  else {
    const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); kor(); } });
    try { mo.observe(document, { childList: true }); } catch {}
  }
})();
