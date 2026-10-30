'use strict';
/* Preload för de små popupfönstren i ui/ (nedladdningar, sök på sidan, spara lösenord, stäng
 * flikar). De körde förr med Node direkt i sidan; nu i sandlåda med bara IPC – och IPC-vakten i
 * main.js släpper bara igenom kanalerna från sidor i ui/. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('adrazeIpc', {
  send: (k, ...a) => ipcRenderer.send(k, ...a),
  sendSync: (k, ...a) => ipcRenderer.sendSync(k, ...a),
  invoke: (k, ...a) => ipcRenderer.invoke(k, ...a),
  on: (k, fn) => { ipcRenderer.on(k, (_e, ...a) => fn({}, ...a)); },
});
