const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onServerStatus: (callback) => ipcRenderer.on('server-status', (event, value) => callback(value)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, value) => callback(value))
});
