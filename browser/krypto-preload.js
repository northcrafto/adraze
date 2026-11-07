'use strict';
/* Preload för Krypto-sidopanelen (ui/krypto.html). Exponerar bara en säker
 * kanal för att skicka chattmeddelanden — huvudprocessen lägger på kontonumret
 * och pratar med Säkerkoll-API:t, så numret behöver aldrig leva i panelen. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('locale', {
  load: (lang) => { try { return ipcRenderer.sendSync('i18n:load', lang) || {}; } catch { return {}; } },
});
contextBridge.exposeInMainWorld('krypto', {
  chat: (messages, opts) => ipcRenderer.invoke('krypto:chat', messages, opts),
  kvot: () => ipcRenderer.invoke('krypto:kvot'),
  doAction: (a) => ipcRenderer.send('krypto:action', a),
  tab: () => ipcRenderer.invoke('krypto:tab'),
  page: () => ipcRenderer.invoke('krypto:page'),
  act: (a) => ipcRenderer.invoke('krypto:act', a),
  expand: (full) => ipcRenderer.send('krypto:expand', !!full),
  onPrefill: (cb) => ipcRenderer.on('krypto-prefill', (_e, t) => cb(t)),
  me: () => ipcRenderer.invoke('krypto:me'),
  samtycke: (v) => ipcRenderer.invoke('krypto:samtycke', v),
});
/* Falk ändrar Anpassa-inställningar (ui/anpassa-falk.js). Huvudprocessen avgör allt (anpassa-falk.js). */
contextBridge.exposeInMainWorld('anpassaFalk', {
  lista: () => ipcRenderer.invoke('anpassa-falk:lista'),
  gor: (a) => ipcRenderer.invoke('anpassa-falk:gor', a),
});
/* Kassan (ui/checkout.html): huvudprocessen lägger på kontots token. */
contextBridge.exposeInMainWorld('billing', {
  intent: (plan) => ipcRenderer.invoke('billing:intent', plan),
  confirm: (d) => ipcRenderer.invoke('billing:confirm', d),
});
