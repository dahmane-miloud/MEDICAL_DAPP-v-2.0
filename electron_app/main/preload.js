// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Authentication
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    signup: (userData) => ipcRenderer.invoke('auth:signup', userData),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),

    // Crypto
    signMessage: (data) => ipcRenderer.invoke('crypto:sign', data),
    verifySignature: (data) => ipcRenderer.invoke('crypto:verify', data),

    // IPFS
    checkIPFS: () => ipcRenderer.invoke('ipfs:check'),
    uploadToIPFS: (data) => ipcRenderer.invoke('ipfs:upload', data),
    getFromIPFS: (cid) => ipcRenderer.invoke('ipfs:get', cid),
    getUserFiles: () => ipcRenderer.invoke('ipfs:getUserFiles'),

    // Proxy TB-PRE
    encryptAES: (data) => ipcRenderer.invoke('proxy:encryptAES', data),
    decryptAES: (data) => ipcRenderer.invoke('proxy:decryptAES', data),

    // Accumulator Contract (ADD THESE)
    accumulatorGetCurrent: () => ipcRenderer.invoke('accumulator:getCurrent'),
    issueWitness: (data) => ipcRenderer.invoke('issue-witness', data),
    revokeDoctor: (data) => ipcRenderer.invoke('revoke-doctor', data),
    isDoctorActive: (did) => ipcRenderer.invoke('isDoctorActive', did),
    getDoctorWitness: (did) => ipcRenderer.invoke('getDoctorWitness', did),

    // Contract / Access
    grantAccess: (data) => ipcRenderer.invoke('contract:grantAccess', data),
    getPatientAccesses: () => ipcRenderer.invoke('contract:getPatientAccesses'),
    getDoctorAccesses: () => ipcRenderer.invoke('contract:getDoctorAccesses'),

    // Store
    storeGet: (key) => ipcRenderer.invoke('store:get', key),
    storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),

    // File operations
    openFile: () => ipcRenderer.invoke('file:open'),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

    // Statistics
    getHealthStats: () => ipcRenderer.invoke('stats:getHealthStats'),
    getPatientStats: () => ipcRenderer.invoke('stats:getPatientStats'),
    getDoctorStats: () => ipcRenderer.invoke('stats:getDoctorStats'),

    // Notifications
    sendNotification: (data) => ipcRenderer.invoke('notification:send', data),
    getNotifications: () => ipcRenderer.invoke('notification:get'),
    //------------ ipfs pinats -------------------
    // Add these to your preload.js if not already present
    checkIPFS: () => ipcRenderer.invoke('ipfs:check'),
    uploadToIPFS: (data) => ipcRenderer.invoke('ipfs:upload', data),
    getFromIPFS: (cid) => ipcRenderer.invoke('ipfs:get', cid),
    //---------------- upload from patient to pinata -------------------
    // In preload.js, add this to the exposed API
    uploadToPinata: (data) => ipcRenderer.invoke('uploadToPinata', data),
    // Add to your existing contextBridge
    pinataUpload: (data) => ipcRenderer.invoke('pinata:upload', data),
    pinataGet: (cid) => ipcRenderer.invoke('pinata:get', cid),
    pinataCheck: () => ipcRenderer.invoke('pinata:check'),
    // Add these to your existing contextBridge.exposeInMainWorld
    pinataUpload: (data) => ipcRenderer.invoke('pinata:upload', data),
    pinataGet: (cid) => ipcRenderer.invoke('pinata:get', cid),
    pinataCheck: () => ipcRenderer.invoke('pinata:check'),
    // preload.js (add to existing contextBridge)
    getAccumulator: () => ipcRenderer.invoke('get-accumulator'),
    pinataUnpin: (cid) => ipcRenderer.invoke('pinata-unpin', cid)
});

console.log('✅ Preload script loaded successfully');