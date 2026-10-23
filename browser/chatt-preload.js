'use strict';
/* Preload för chattpanelen (ui/chatt.html). Sidan når API:t bara via huvudprocessen,
 * som lägger på AdRaze-kontots token – token finns aldrig i sidan. */
const { contextBridge, ipcRenderer } = require('electron');

let boot = { lang: 'sv', theme: 'light' };
try { boot = ipcRenderer.sendSync('chatt:boot') || boot; } catch {}
// i18n.js läser språket ur localStorage när den laddas (partitionen delar inte skalets lagring)
try { localStorage.setItem('adraze-lang', boot.lang || 'sv'); } catch {}

contextBridge.exposeInMainWorld('locale', {
  load: (lang) => { try { return ipcRenderer.sendSync('i18n:load', lang) || {}; } catch { return {}; } },
});
contextBridge.exposeInMainWorld('chatt', {
  boot: () => ({ lang: boot.lang, theme: boot.theme }),
  api: (req) => ipcRenderer.invoke('chatt:api', req),
  expand: (full) => ipcRenderer.send('chatt:expand', !!full),
  close: () => ipcRenderer.send('chatt:close'),
  unread: (n) => ipcRenderer.send('chatt:unread', n),
  onTheme: (cb) => ipcRenderer.on('chatt-theme', (_e, t) => cb(t)),
  onVisible: (cb) => ipcRenderer.on('chatt-visible', (_e, v) => cb(!!v)),
});
