const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Authentification
    login: (data) => ipcRenderer.invoke('auth:login', data),
    signup: (data) => ipcRenderer.invoke('auth:signup', data),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),

    // IPFS
    uploadToIPFS: (data) => ipcRenderer.invoke('ipfs:upload', data),
    getFromIPFS: (cid) => ipcRenderer.invoke('ipfs:get', cid),
    getUserFiles: () => ipcRenderer.invoke('ipfs:getUserFiles'),

    // Proxy TB-PRE
    proxyEncryptAES: (data) => ipcRenderer.invoke('proxy:encryptAES', data),
    proxyRegisterDoctor: (data) => ipcRenderer.invoke('proxy:registerDoctorAttributes', data),
    proxyGenerateRekey: (data) => ipcRenderer.invoke('proxy:generateRekey', data),
    proxyReencrypt: (data) => ipcRenderer.invoke('proxy:proxyReencrypt', data),
    proxyDecryptAES: (data) => ipcRenderer.invoke('proxy:decryptAES', data),

    // Witness Contract (CRITICAL - these are used by health-dept.js)
    issueWitness: (data) => ipcRenderer.invoke('issue-witness', data),
    getDoctorWitness: (did) => ipcRenderer.invoke('getDoctorWitness', did),
    isDoctorActive: (did) => ipcRenderer.invoke('isDoctorActive', did),
    revokeDoctor: (data) => ipcRenderer.invoke('contract:revokeDoctor', data),

    // Legacy contract handlers (for compatibility)
    grantAccess: (data) => ipcRenderer.invoke('contract:grantAccess', data),
    verifyDoctor: (did) => ipcRenderer.invoke('contract:verifyDoctor', did),
    getPatientAccesses: () => ipcRenderer.invoke('contract:getPatientAccesses'),
    getDoctorAccesses: () => ipcRenderer.invoke('contract:getDoctorAccesses'),
    registerDoctor: (data) => ipcRenderer.invoke('contract:registerDoctor', data),

    // Notifications
    sendNotification: (data) => ipcRenderer.invoke('notification:send', data),
    getNotifications: () => ipcRenderer.invoke('notification:get'),

    // Fichiers
    openFile: () => ipcRenderer.invoke('file:open'),
    saveFile: (data) => ipcRenderer.invoke('file:save', data),
    readFile: (path) => ipcRenderer.invoke('file:read', path),

    // Store
    storeGet: (key) => ipcRenderer.invoke('store:get', key),
    storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
    storeDelete: (key) => ipcRenderer.invoke('store:delete', key),

    // Statistiques
    getPatientStats: () => ipcRenderer.invoke('stats:getPatientStats'),
    getDoctorStats: () => ipcRenderer.invoke('stats:getDoctorStats'),
    getHealthStats: () => ipcRenderer.invoke('stats:getHealthStats'),

    // Crypto simple (signature)
    sign: (message) => ipcRenderer.invoke('crypto:sign', { message }),
    verify: (did, message, signature) => ipcRenderer.invoke('crypto:verify', { did, message, signature }),
    revokeDoctor: (data) => ipcRenderer.invoke('revoke-doctor', data),
    grantAccess: (data) => ipcRenderer.invoke('contract:grantAccess', data),
    grantAccess: (data) => ipcRenderer.invoke('contract:grantAccess', data),
    getDoctorAccesses: () => ipcRenderer.invoke('contract:getDoctorAccesses', currentUser.did),
});