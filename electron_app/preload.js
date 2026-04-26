const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    ssiSignIn: () => ipcRenderer.invoke('ssi-sign-in'),
    verifyDoctor: (did) => ipcRenderer.invoke('verify-doctor', did),
    attachDoctor: (did, reason) => ipcRenderer.invoke('attach-doctor', { did, reason }),
    detachDoctor: (did, reason) => ipcRenderer.invoke('detach-doctor', { did, reason }),
    getDoctorStatus: (did) => ipcRenderer.invoke('get-doctor-status', did)
});