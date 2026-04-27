/*

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
    getFromIPFS: (cid) => ipcRenderer.invoke('ipfs:get', cid),
    ipfsId: () => ipcRenderer.invoke('ipfs:id'),
    // In preload.js, add these to the exposed object:
    ipfsCheck: () => ipcRenderer.invoke('ipfs:check'),
    uploadToIPFS: (data) => ipcRenderer.invoke('ipfs:upload', data),
    getFromIPFS: (cid) => ipcRenderer.invoke('ipfs:get', cid),


});

*/
// preload.js - Exposes Electron APIs to renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
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
    generateRekey: (data) => ipcRenderer.invoke('proxy:generateRekey', data),
    proxyReencrypt: (data) => ipcRenderer.invoke('proxy:proxyReencrypt', data),

    // Blockchain / Contract
    grantAccess: (data) => ipcRenderer.invoke('contract:grantAccess', data),
    getPatientAccesses: () => ipcRenderer.invoke('contract:getPatientAccesses'),
    getDoctorAccesses: () => ipcRenderer.invoke('contract:getDoctorAccesses'),
    isDoctorActive: (did) => ipcRenderer.invoke('isDoctorActive', did),
    getDoctorWitness: (did) => ipcRenderer.invoke('getDoctorWitness', did),
    issueWitness: (data) => ipcRenderer.invoke('issue-witness', data),
    revokeDoctor: (data) => ipcRenderer.invoke('revoke-doctor', data),
    verifyDoctor: (did) => ipcRenderer.invoke('contract:verifyDoctor', did),
    registerDoctor: (data) => ipcRenderer.invoke('contract:registerDoctor', data),

    // Store
    storeGet: (key) => ipcRenderer.invoke('store:get', key),
    storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
    storeDelete: (key) => ipcRenderer.invoke('store:delete', key),

    // File operations
    openFile: () => ipcRenderer.invoke('file:open'),
    saveFile: (data) => ipcRenderer.invoke('file:save', data),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

    // Statistics
    getPatientStats: () => ipcRenderer.invoke('stats:getPatientStats'),
    getDoctorStats: () => ipcRenderer.invoke('stats:getDoctorStats'),
    getHealthStats: () => ipcRenderer.invoke('stats:getHealthStats'),

    // Notifications
    sendNotification: (data) => ipcRenderer.invoke('notification:send', data),
    getNotifications: () => ipcRenderer.invoke('notification:get'),

    // Crypto helpers
    isCryptoReady: () => ipcRenderer.invoke('crypto:isReady'),
    encryptCID: (data) => ipcRenderer.invoke('crypto:encryptCID', data),
    reencrypt: (data) => ipcRenderer.invoke('crypto:reencrypt', data),
    decrypt: (data) => ipcRenderer.invoke('crypto:decrypt', data),
});

// Expose specific crypto utils if needed (but keep secure)
contextBridge.exposeInMainWorld('CryptoUtils', {
    // These are just placeholders - actual crypto should be in main process
    generateKey: () => ipcRenderer.invoke('crypto:generateKey'),
    encryptFile: (data) => ipcRenderer.invoke('crypto:encryptFile', data),
    decryptFile: (data) => ipcRenderer.invoke('crypto:decryptFile', data),
});

console.log('✅ Preload script loaded successfully');