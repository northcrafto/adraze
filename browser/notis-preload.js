// Bryggan för den flytande notisrutan (sandlåda: bara electron får laddas här).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notis', {
  redo: () => ipcRenderer.send('notis:redo'),
  klick: (id, knapp) => ipcRenderer.send('notis:klick', id, knapp),
  hojd: (h) => ipcRenderer.send('notis:hojd', h),
  on: (namn, fn) => { if (namn === 'data') ipcRenderer.on('notis-data', (_e, d) => fn(d)); },
});
