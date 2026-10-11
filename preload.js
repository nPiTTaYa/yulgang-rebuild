const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  act: (name) => ipcRenderer.send('bar-action', String(name)),
});
