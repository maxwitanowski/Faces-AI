const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
    getStatus: () => ipcRenderer.invoke('installer-get-status'),
    startInstall: (preferences) => ipcRenderer.invoke('installer-start', preferences),
    skipInstall: () => ipcRenderer.invoke('installer-skip'),
    onProgress: (callback) => ipcRenderer.on('install-progress', (event, data) => callback(data)),
    removeProgressListener: () => ipcRenderer.removeAllListeners('install-progress'),
    closeWindow: () => ipcRenderer.invoke('installer-close')
});
