// Minimal preload script kept for secure IPC exposure.
// Keep the surface minimal — use contextBridge to expose only safe methods.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args)
});
