/*  const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createMenu } = require('./menu');
const { ethers } = require('ethers');
const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64 } = require('tweetnacl-util');
const crypto = require('crypto');
const { create } = require('ipfs-http-client');
const fetch = require('node-fetch');
const fs = require('fs');

// ==================== Configuration du contrat unique ====================
let contractConfig;
try {
    contractConfig = require('./contracts.json');
    if (!contractConfig.rpcUrl || !contractConfig.witnessAccumulator) {
        throw new Error('Missing rpcUrl or witnessAccumulator in contracts.json');
    }
} catch (error) {
    console.error('❌ Failed to load contracts.json:', error.message);
    process.exit(1);
}

// Load contract ABI
const WitnessABI = require(path.join(__dirname, '../../hardhat/artifacts/contracts/WitnessAccumulator.sol/WitnessAccumulator.json')).abi;

let provider;
try {
    provider = new ethers.JsonRpcProvider(contractConfig.rpcUrl);
    console.log('✅ Provider connected to', contractConfig.rpcUrl);
} catch (error) {
    console.error('❌ Provider error:', error);
    process.exit(1);
}

const store = new Store();
let mainWindow;

// ==================== Create Window ====================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366, height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        webgl: false
    });
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());
    Menu.setApplicationMenu(createMenu(mainWindow));
    if (process.env.NODE_ENV === 'development') mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(() => {
    createWindow();
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
                    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
                    "connect-src 'self' http://127.0.0.1:8545 http://localhost:5001 http://localhost:3000 http://localhost:5000;"
                ]
            }
        });
    });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// ==================== Helper functions ====================
function generateHybridKeys() {
    const ethWallet = ethers.Wallet.createRandom();
    const keyPair = nacl.sign.keyPair();
    const publicKeyBase64 = encodeBase64(keyPair.publicKey);
    const privateKeyBase64 = encodeBase64(keyPair.secretKey);
    const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
    return {
        did,
        ethAddress: ethWallet.address,
        ethPublicKey: ethWallet.publicKey,
        ethPrivateKey: ethWallet.privateKey,
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64,
        keyPair
    };
}

function signMessage(privateKeyBase64, message) {
    const privateKeyBytes = decodeBase64(privateKeyBase64);
    const messageBytes = new TextEncoder().encode(message);
    return encodeBase64(nacl.sign.detached(messageBytes, privateKeyBytes));
}

function verifySignature(publicKeyBase64, message, signatureBase64) {
    try {
        const publicKeyBytes = decodeBase64(publicKeyBase64);
        const signatureBytes = decodeBase64(signatureBase64);
        const messageBytes = new TextEncoder().encode(message);
        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch { return false; }
}

// ==================== Authentication ====================
ipcMain.handle('auth:login', async (event, { did, privateKey }) => {
    const users = store.get('users') || {};
    const user = users[did];
    if (!user || user.privateKey !== privateKey) return { success: false, error: 'Invalid credentials' };
    store.set('currentSession', { did: user.did, type: user.type, name: user.name, publicKey: user.publicKey, loggedInAt: new Date().toISOString() });
    return { success: true, user: store.get('currentSession') };
});

ipcMain.handle('auth:signup', async (event, userData) => {
    const { name, type, license, specialization } = userData;
    if (!name || !type) return { success: false, error: 'Missing fields' };
    let keys;
    if (type === 'health') {
        const deployerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        const wallet = new ethers.Wallet(deployerPrivateKey);
        const keyPair = nacl.sign.keyPair();
        const publicKeyBase64 = encodeBase64(keyPair.publicKey);
        const privateKeyBase64 = encodeBase64(keyPair.secretKey);
        const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
        keys = { did, ethAddress: wallet.address, ethPublicKey: wallet.publicKey, ethPrivateKey: wallet.privateKey, publicKey: publicKeyBase64, privateKey: privateKeyBase64, keyPair };
    } else {
        keys = generateHybridKeys();
    }
    const newUser = {
        did: keys.did, name, type, publicKey: keys.publicKey, privateKey: keys.privateKey,
        ethAddress: keys.ethAddress, ethPublicKey: keys.ethPublicKey, ethPrivateKey: keys.ethPrivateKey,
        license: license || '', specialization: specialization || '', createdAt: new Date().toISOString()
    };
    const users = store.get('users') || {};
    users[keys.did] = newUser;
    store.set('users', users);
    return { success: true, user: { did: keys.did, publicKey: keys.publicKey, privateKey: keys.privateKey, name, type, ethAddress: keys.ethAddress } };
});

ipcMain.handle('auth:logout', () => { store.delete('currentSession'); return { success: true }; });
ipcMain.handle('auth:getSession', () => store.get('currentSession'));

// ==================== Crypto (signature) ====================
ipcMain.handle('crypto:sign', async (event, { message }) => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const users = store.get('users') || {};
    const user = users[session.did];
    if (!user) return { success: false, error: 'User not found' };
    return { success: true, signature: signMessage(user.privateKey, message), publicKey: user.publicKey, did: user.did };
});

ipcMain.handle('crypto:verify', async (event, { did, message, signature }) => {
    const users = store.get('users') || {};
    const user = users[did];
    if (!user) return { success: false, valid: false };
    return { success: true, valid: verifySignature(user.publicKey, message, signature) };
});

// ==================== IPFS ====================
ipcMain.handle('ipfs:upload', async (event, { data, filename, fileType, metadata }) => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const ipfs = create({ url: 'http://localhost:5001' });
    const buffer = Buffer.from(data, 'base64');
    const result = await ipfs.add(buffer);
    const cid = result.cid.toString();
    const files = store.get('ipfsFiles') || [];
    const fileRecord = { cid, filename, fileType, size: buffer.length, uploadedAt: new Date().toISOString(), uploadedBy: session.did, metadata };
    files.push(fileRecord);
    store.set('ipfsFiles', files);
    const userFiles = store.get('userFiles:' + session.did) || [];
    userFiles.push({ cid, filename, uploadedAt: fileRecord.uploadedAt, metadata });
    store.set('userFiles:' + session.did, userFiles);
    return { success: true, cid };
});

ipcMain.handle('ipfs:get', async (event, cid) => {
    const ipfs = create({ url: 'http://localhost:5001' });
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const data = buffer.toString('base64');
    const files = store.get('ipfsFiles') || [];
    const file = files.find(f => f.cid === cid);
    return { success: true, data: { data, ...file } };
});

ipcMain.handle('ipfs:getUserFiles', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    return { success: true, files: store.get('userFiles:' + session.did) || [] };
});

// ==================== Proxy TB‑PRE ====================
ipcMain.handle('proxy:encryptAES', async (event, { aesKeyB64, policy, timeSlot }) => {
    const res = await fetch('http://localhost:5000/encrypt_aes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aes_key_b64: aesKeyB64, policy, time_slot: timeSlot })
    });
    return res.json();
});

ipcMain.handle('proxy:registerDoctorAttributes', async (event, { did, attributes }) => {
    const res = await fetch('http://localhost:5000/register_doctor_attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did, attributes })
    });
    return res.json();
});

ipcMain.handle('proxy:generateRekey', async (event, { ctId, delegateeAttrs, delegateeTimeWindow }) => {
    const res = await fetch('http://localhost:5000/generate_rekey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ct_id: ctId, delegatee_attrs: delegateeAttrs, delegatee_time_window: delegateeTimeWindow })
    });
    return res.json();
});

ipcMain.handle('proxy:proxyReencrypt', async (event, { rekeyId }) => {
    const res = await fetch('http://localhost:5000/proxy_reencrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rekey_id: rekeyId })
    });
    return res.json();
});

ipcMain.handle('proxy:decryptAES', async (event, { transformedCtId, doctorDid }) => {
    const res = await fetch('http://localhost:5000/decrypt_aes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transformed_ct_id: transformedCtId, doctor_did: doctorDid })
    });
    return res.json();
});

// ==================== Witness Accumulator Contract ====================
const witnessAddress = contractConfig.witnessAccumulator;
let witnessContract = new ethers.Contract(witnessAddress, WitnessABI, provider);

async function getHealthSigner() {
    const session = store.get('currentSession');
    if (!session || session.type !== 'health') {
        throw new Error('No health department session');
    }
    const users = store.get('users') || {};
    const healthUser = users[session.did];
    let privateKey = healthUser?.ethPrivateKey;
    if (!privateKey) {
        console.warn('⚠️ No ethPrivateKey for health dept, using hardhat default key');
        privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    }
    return new ethers.Wallet(privateKey, provider);
}

// 1. Issue witness
ipcMain.handle('issue-witness', async (event, { did, witnessHash, expiryTime }) => {
    console.log(`📡 issue-witness called: DID=${did}, expiry=${expiryTime}`);
    try {
        const signer = await getHealthSigner();
        const contractWithSigner = witnessContract.connect(signer);
        const tx = await contractWithSigner.issueWitness(did, witnessHash, expiryTime);
        await tx.wait();
        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error(`❌ issue-witness error:`, error);
        return { success: false, error: error.message };
    }
});

// 2. Get doctor witness
ipcMain.handle('getDoctorWitness', async (event, did) => {
    try {
        const contract = new ethers.Contract(witnessAddress, WitnessABI, provider);
        const [witnessHash, expiryTime] = await contract.getDoctorWitness(did);
        return { witnessHash, expiryTime: Number(expiryTime) };
    } catch (error) {
        console.error(`❌ getDoctorWitness error:`, error.message);
        throw error;
    }
});

// 3. Check if doctor is active
ipcMain.handle('isDoctorActive', async (event, did) => {
    try {
        const contract = new ethers.Contract(witnessAddress, WitnessABI, provider);
        const isActive = await contract.isDoctorActive(did);
        return isActive;
    } catch (error) {
        return false;
    }
});

// 4. Revoke doctor (single handler, no duplicate)
ipcMain.handle('revoke-doctor', async (event, { did }) => {
    console.log(`📡 revoke-doctor called for ${did}`);
    try {
        const signer = await getHealthSigner();
        const contractWithSigner = witnessContract.connect(signer);
        const tx = await contractWithSigner.revokeDoctor(did);
        await tx.wait();
        const revoked = store.get('revokedDoctors') || [];
        revoked.push({ did, revokedAt: new Date().toISOString() });
        store.set('revokedDoctors', revoked);
        const users = store.get('users') || {};
        if (users[did]) users[did].isActive = false;
        store.set('users', users);
        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error('Revoke error:', error);
        return { success: false, error: error.message };
    }
});

// Alias for contract:revokeDoctor (if needed) – but we already have revoke-doctor
ipcMain.handle('contract:revokeDoctor', async (event, { did }) => {
    return ipcMain.emit('revoke-doctor', event, { did });
});

// Additional contract handlers
ipcMain.handle('contract:verifyDoctor', async (event, did) => {
    try {
        const contract = new ethers.Contract(witnessAddress, WitnessABI, provider);
        const isActive = await contract.isDoctorActive(did);
        return { success: true, isActive };
    } catch (error) {
        return { success: false, isActive: false };
    }
});

ipcMain.handle('contract:grantAccess', async (event, data) => {
    console.log('contract:grantAccess', data);
    return { success: true };
});

ipcMain.handle('contract:getPatientAccesses', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const accesses = store.get('accessGrants') || [];
    const patientAccesses = accesses.filter(a => a.patientDid === session.did);
    return { success: true, accesses: patientAccesses };
});

ipcMain.handle('contract:getDoctorAccesses', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const accesses = store.get('doctorAccesses:' + session.did) || [];
    return { success: true, accesses };
});

ipcMain.handle('contract:registerDoctor', async (event, data) => {
    console.log('contract:registerDoctor', data);
    return { success: true };
});

// ==================== Store Handlers ====================
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, value) => { store.set(key, value); return { success: true }; });
ipcMain.handle('store:delete', (event, key) => { store.delete(key); return { success: true }; });

// ==================== File Handlers ====================
ipcMain.handle('file:open', async () => {
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
    if (!res.canceled) return { success: true, filePath: res.filePaths[0] };
    return { success: false, canceled: true };
});

ipcMain.handle('file:save', async (event, { data, filename }) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: filename });
    if (!result.canceled) {
        fs.writeFileSync(result.filePath, Buffer.from(data, 'base64'));
        return { success: true, path: result.filePath };
    }
    return { success: false, canceled: true };
});

ipcMain.handle('file:read', async (event, filePath) => {
    const data = fs.readFileSync(filePath);
    return { success: true, data: data.toString('base64') };
});

// ==================== Statistics Handlers ====================
ipcMain.handle('stats:getHealthStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'health') return { success: false, error: 'Unauthorized' };
    const users = store.get('users') || {};
    const revoked = store.get('revokedDoctors') || [];
    let doctors = 0, patients = 0;
    for (const u of Object.values(users)) {
        if (u.type === 'doctor') doctors++;
        else if (u.type === 'patient') patients++;
    }
    const activeDoctors = doctors - revoked.length;
    return { success: true, stats: { totalDoctors: doctors, activeDoctors, revokedDoctors: revoked.length, totalPatients: patients } };
});

ipcMain.handle('stats:getPatientStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'patient') return { success: false, error: 'Unauthorized' };
    const files = store.get('userFiles:' + session.did) || [];
    const accesses = store.get('accessGrants') || [];
    const patientAccesses = accesses.filter(a => a.patientDid === session.did);
    const now = Date.now() / 1000;
    const activeShares = patientAccesses.filter(a => a.isActive && a.expiryTime > now).length;
    const uniqueDoctors = new Set(patientAccesses.map(a => a.doctorDid));
    return { success: true, stats: { totalRecords: files.length, authorizedDoctors: uniqueDoctors.size, activeShares, totalAccesses: patientAccesses.length } };
});

ipcMain.handle('stats:getDoctorStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'doctor') return { success: false, error: 'Unauthorized' };
    const accesses = store.get('doctorAccesses:' + session.did) || [];
    const now = Date.now() / 1000;
    const active = accesses.filter(a => a.isActive && a.expiryTime > now);
    const expiringSoon = active.filter(a => a.expiryTime - now < 7 * 24 * 3600);
    const uniquePatients = new Set(accesses.map(a => a.patientDid));
    return { success: true, stats: { totalPatients: uniquePatients.size, availableRecords: accesses.length, activeAccesses: active.length, expiringSoon: expiringSoon.length } };
});

// ==================== Notifications ====================
ipcMain.handle('notification:send', async (event, { toDid, message }) => {
    const notifications = store.get('notifications') || {};
    if (!notifications[toDid]) notifications[toDid] = [];
    notifications[toDid].push({ message, timestamp: new Date().toISOString(), read: false });
    store.set('notifications', notifications);
    return { success: true };
});

ipcMain.handle('notification:get', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const notifications = store.get('notifications') || {};
    return { success: true, notifications: notifications[session.did] || [] };
});

// ==================== Crypto Helpers for PRE ====================
ipcMain.handle('crypto:isReady', async () => ({ success: true, ready: true }));
ipcMain.handle('crypto:registerDoctor', async (event, data) => ({ success: true }));
ipcMain.handle('crypto:encryptCID', async (event, data) => ({ success: true, encryptedCid: data.cid }));
ipcMain.handle('crypto:reencrypt', async (event, data) => ({ success: true, reencryptedCid: data.cid }));
ipcMain.handle('crypto:decrypt', async (event, data) => ({ success: true, decryptedData: 'mock' }));

// ==================== Disable GPU errors (optional) ====================
app.commandLine.appendSwitch('disable-gpu');

*/


const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createMenu } = require('./menu');
const { ethers } = require('ethers');
const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64 } = require('tweetnacl-util');
const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');

// ============ FIX GPU FLASHING ISSUES ============
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ==================== Configuration ====================
let contractConfig;
try {
    contractConfig = require('./contracts.json');
    if (!contractConfig.rpcUrl) {
        throw new Error('Missing rpcUrl in contracts.json');
    }
    if (!contractConfig.Accumulator) {
        console.warn('⚠️ Missing Accumulator address in contracts.json');
    }
} catch (error) {
    console.error('❌ Failed to load contracts.json:', error.message);
    process.exit(1);
}

// Load contract ABI
let accumulatorABI;
let accumulatorAddress = contractConfig.Accumulator;

try {
    const accumulatorArtifact = require(path.join(__dirname, '../../hardhat/artifacts/contracts/Accumulator.sol/Accumulator.json'));
    accumulatorABI = accumulatorArtifact.abi;
    console.log('✅ Accumulator ABI loaded');
} catch (error) {
    console.error('❌ Failed to load Accumulator ABI:', error.message);
    accumulatorABI = [
        "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
        "function revokeDoctor(string memory doctorDid) external",
        "function getCurrentAccumulator() external view returns (bytes32, uint256, uint256)",
        "function isDoctorActive(string memory doctorDid) external view returns (bool)",
        "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)"
    ];
}

let provider;
try {
    provider = new ethers.JsonRpcProvider(contractConfig.rpcUrl);
    console.log('✅ Provider connected to', contractConfig.rpcUrl);
} catch (error) {
    console.error('❌ Provider error:', error);
    process.exit(1);
}

const store = new Store();
let mainWindow;

// ==================== Create Window ====================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        backgroundColor: '#f0f2f5',
        webgl: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());
    Menu.setApplicationMenu(createMenu(mainWindow));

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => mainWindow = null);
}

// ==================== CSP Configuration ====================
app.whenReady().then(() => {
    createWindow();

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
                    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
                    "connect-src 'self' " +
                    "http://localhost:8545 " +
                    "http://127.0.0.1:8545 " +
                    "http://localhost:5001 " +
                    "http://127.0.0.1:5001 " +
                    "http://localhost:5000 " +
                    "http://127.0.0.1:5000 " +
                    "ws://localhost:5001 " +
                    "ws://127.0.0.1:5001 " +
                    "https://*;"
                ]
            }
        });
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

// ==================== Helper Functions ====================
function generateHybridKeys() {
    const ethWallet = ethers.Wallet.createRandom();
    const keyPair = nacl.sign.keyPair();
    const publicKeyBase64 = encodeBase64(keyPair.publicKey);
    const privateKeyBase64 = encodeBase64(keyPair.secretKey);
    const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
    return {
        did,
        ethAddress: ethWallet.address,
        ethPublicKey: ethWallet.publicKey,
        ethPrivateKey: ethWallet.privateKey,
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64,
        keyPair
    };
}

function signMessage(privateKeyBase64, message) {
    const privateKeyBytes = decodeBase64(privateKeyBase64);
    const messageBytes = new TextEncoder().encode(message);
    return encodeBase64(nacl.sign.detached(messageBytes, privateKeyBytes));
}

function verifySignature(publicKeyBase64, message, signatureBase64) {
    try {
        const publicKeyBytes = decodeBase64(publicKeyBase64);
        const signatureBytes = decodeBase64(signatureBase64);
        const messageBytes = new TextEncoder().encode(message);
        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
        return false;
    }
}

// ==================== Authentication ====================
ipcMain.handle('auth:login', async (event, { did, privateKey }) => {
    const users = store.get('users') || {};
    const user = users[did];
    if (!user || user.privateKey !== privateKey) {
        return { success: false, error: 'Invalid credentials' };
    }
    store.set('currentSession', {
        did: user.did,
        type: user.type,
        name: user.name,
        publicKey: user.publicKey,
        loggedInAt: new Date().toISOString()
    });
    return { success: true, user: store.get('currentSession') };
});

ipcMain.handle('auth:signup', async (event, userData) => {
    const { name, type, license, specialization } = userData;
    if (!name || !type) return { success: false, error: 'Missing fields' };

    let keys;
    if (type === 'health') {
        const wallet = ethers.Wallet.createRandom();
        const keyPair = nacl.sign.keyPair();
        const publicKeyBase64 = encodeBase64(keyPair.publicKey);
        const privateKeyBase64 = encodeBase64(keyPair.secretKey);
        const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
        keys = {
            did,
            ethAddress: wallet.address,
            ethPublicKey: wallet.publicKey,
            ethPrivateKey: wallet.privateKey,
            publicKey: publicKeyBase64,
            privateKey: privateKeyBase64,
            keyPair
        };
        console.log(`✅ Created Health Department with ETH address: ${wallet.address}`);
    } else {
        keys = generateHybridKeys();
    }

    const newUser = {
        did: keys.did,
        name,
        type,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        ethAddress: keys.ethAddress,
        ethPublicKey: keys.ethPublicKey,
        ethPrivateKey: keys.ethPrivateKey,
        license: license || '',
        specialization: specialization || '',
        createdAt: new Date().toISOString()
    };

    const users = store.get('users') || {};
    users[keys.did] = newUser;
    store.set('users', users);

    return {
        success: true, user: {
            did: keys.did,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
            name,
            type,
            ethAddress: keys.ethAddress
        }
    };
});

ipcMain.handle('auth:logout', () => {
    store.delete('currentSession');
    return { success: true };
});

ipcMain.handle('auth:getSession', () => store.get('currentSession'));

// ==================== Crypto ====================
ipcMain.handle('crypto:sign', async (event, { message }) => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const users = store.get('users') || {};
    const user = users[session.did];
    if (!user) return { success: false, error: 'User not found' };
    return { success: true, signature: signMessage(user.privateKey, message), publicKey: user.publicKey, did: user.did };
});

ipcMain.handle('crypto:verify', async (event, { did, message, signature }) => {
    const users = store.get('users') || {};
    const user = users[did];
    if (!user) return { success: false, valid: false };
    return { success: true, valid: verifySignature(user.publicKey, message, signature) };
});

// ==================== IPFS Handlers ====================
const IPFS_API_URL = 'http://127.0.0.1:5001';

ipcMain.handle('ipfs:check', async () => {
    try {
        const response = await fetch(`${IPFS_API_URL}/api/v0/id`, { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            return { success: true, message: 'IPFS is running' };
        }
        return { success: false, error: 'IPFS not responding' };
    } catch (error) {
        return { success: false, error: 'IPFS Desktop is not running' };
    }
});

ipcMain.handle('ipfs:upload', async (event, { data, filename, fileType, metadata }) => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };

    try {
        const buffer = Buffer.from(data, 'base64');
        const formData = new FormData();
        formData.append('file', buffer, { filename: filename, contentType: fileType || 'application/octet-stream' });

        const response = await fetch(`${IPFS_API_URL}/api/v0/add`, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!response.ok) throw new Error(`IPFS returned ${response.status}`);

        const result = await response.json();
        const cid = result.Hash;

        const files = store.get('ipfsFiles') || [];
        files.push({ cid, filename, fileType, size: buffer.length, uploadedAt: new Date().toISOString(), uploadedBy: session.did, metadata });
        store.set('ipfsFiles', files);

        const userFiles = store.get('userFiles:' + session.did) || [];
        userFiles.push({ cid, filename, uploadedAt: new Date().toISOString(), metadata });
        store.set('userFiles:' + session.did, userFiles);

        return { success: true, cid };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ipfs:get', async (event, cid) => {
    try {
        const response = await fetch(`${IPFS_API_URL}/api/v0/cat?arg=${cid}`, { method: 'POST' });
        if (!response.ok) throw new Error(`IPFS returned ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = buffer.toString('base64');

        const files = store.get('ipfsFiles') || [];
        const file = files.find(f => f.cid === cid);

        return { success: true, data: { data, ...file } };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==================== TB-PRE Proxy Handlers ====================
ipcMain.handle('proxy:encryptAES', async (event, { aesKeyB64, policy, timeSlot }) => {
    try {
        const response = await fetch('http://localhost:5000/encrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aes_key_b64: aesKeyB64, policy, time_slot: timeSlot })
        });
        return await response.json();
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('proxy:decryptAES', async (event, { transformedCtId, doctorDid }) => {
    try {
        const response = await fetch('http://localhost:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transformed_ct_id: transformedCtId, doctor_did: doctorDid })
        });
        return await response.json();
    } catch (error) {
        return { error: error.message };
    }
});

// ==================== Accumulator Contract Handlers ====================

function getAccumulatorContract() {
    if (!accumulatorAddress) {
        throw new Error('Accumulator address not configured');
    }
    return new ethers.Contract(accumulatorAddress, accumulatorABI, provider);
}

async function getHealthSigner() {
    const session = store.get('currentSession');
    if (!session || session.type !== 'health') {
        throw new Error('No health department session');
    }

    const users = store.get('users') || {};
    const healthUser = users[session.did];
    let privateKey = healthUser?.ethPrivateKey;

    if (!privateKey) {
        privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    }

    return new ethers.Wallet(privateKey, provider);
}

ipcMain.handle('accumulator:getCurrent', async () => {
    try {
        const contract = getAccumulatorContract();
        const [accumulator, activeCount, blockNumber] = await contract.getCurrentAccumulator();
        return { success: true, accumulator, activeCount: Number(activeCount), blockNumber: Number(blockNumber) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('issue-witness', async (event, { did, witnessHash, expiryTime }) => {
    console.log(`📡 Issuing witness for: ${did}`);
    try {
        const session = store.get('currentSession');
        if (!session || session.type !== 'health') {
            return { success: false, error: 'Only Health Department can issue witnesses' };
        }

        const signer = await getHealthSigner();
        const contract = getAccumulatorContract();
        const contractWithSigner = contract.connect(signer);

        const witnessHashBytes = ethers.keccak256(ethers.toUtf8Bytes(witnessHash));
        const tx = await contractWithSigner.setDoctorWitness(did, witnessHashBytes, expiryTime);
        await tx.wait();

        console.log(`✅ Witness issued for ${did}`);
        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error('Issue witness error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('revoke-doctor', async (event, { did }) => {
    console.log(`📡 Revoking doctor: ${did}`);
    try {
        const session = store.get('currentSession');
        if (!session || session.type !== 'health') {
            return { success: false, error: 'Only Health Department can revoke doctors' };
        }

        const signer = await getHealthSigner();
        const contract = getAccumulatorContract();
        const contractWithSigner = contract.connect(signer);

        const tx = await contractWithSigner.revokeDoctor(did);
        await tx.wait();

        console.log(`✅ Doctor revoked: ${did}`);
        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error('Revoke doctor error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('isDoctorActive', async (event, did) => {
    try {
        const contract = getAccumulatorContract();
        return await contract.isDoctorActive(did);
    } catch (error) {
        return false;
    }
});

ipcMain.handle('getDoctorWitness', async (event, did) => {
    try {
        const contract = getAccumulatorContract();
        const [witnessHash, expiryTime, isActive] = await contract.getDoctorWitness(did);
        return { witnessHash, expiryTime: Number(expiryTime), isActive };
    } catch (error) {
        return { witnessHash: null, expiryTime: 0, isActive: false };
    }
});

// ==================== Contract Handlers ====================
ipcMain.handle('contract:grantAccess', async (event, { patientDid, doctorDid, documentCid, encryptedCid, ciphertextId, filename, expiryTime }) => {
    try {
        const accesses = store.get('accessGrants') || [];
        accesses.push({
            patientDid, doctorDid, documentCid, encryptedCid,
            ciphertextId, filename: filename || 'Medical Record',
            expiryTime: Number(expiryTime), isActive: true, grantedAt: Date.now()
        });
        store.set('accessGrants', accesses);

        const doctorAccesses = store.get(`doctorAccesses:${doctorDid}`) || [];
        doctorAccesses.push({ patientDid, doctorDid, documentCid, encryptedCid, ciphertextId, filename, expiryTime: Number(expiryTime), isActive: true });
        store.set(`doctorAccesses:${doctorDid}`, doctorAccesses);

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('contract:getPatientAccesses', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const accesses = store.get('accessGrants') || [];
    return { success: true, accesses: accesses.filter(a => a.patientDid === session.did) };
});

ipcMain.handle('contract:getDoctorAccesses', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    return { success: true, accesses: store.get(`doctorAccesses:${session.did}`) || [] };
});

// ==================== Store Handlers ====================
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, value) => { store.set(key, value); return { success: true }; });

// ==================== File Handlers ====================
ipcMain.handle('file:open', async () => {
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
    if (!res.canceled) return { success: true, filePath: res.filePaths[0] };
    return { success: false, canceled: true };
});

ipcMain.handle('file:read', async (event, filePath) => {
    const data = fs.readFileSync(filePath);
    return { success: true, data: data.toString('base64') };
});

// ==================== Statistics ====================
ipcMain.handle('stats:getHealthStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'health') return { success: false, error: 'Unauthorized' };

    const users = store.get('users') || {};
    const revoked = store.get('revokedDoctors') || [];
    let doctors = 0, patients = 0;
    for (const u of Object.values(users)) {
        if (u.type === 'doctor') doctors++;
        else if (u.type === 'patient') patients++;
    }

    return {
        success: true, stats: {
            totalDoctors: doctors,
            activeDoctors: doctors - revoked.length,
            revokedDoctors: revoked.length,
            totalPatients: patients
        }
    };
});

ipcMain.handle('stats:getPatientStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'patient') return { success: false, error: 'Unauthorized' };

    const files = store.get('userFiles:' + session.did) || [];
    const accesses = store.get('accessGrants') || [];
    const patientAccesses = accesses.filter(a => a.patientDid === session.did);
    const now = Date.now() / 1000;

    return {
        success: true, stats: {
            totalRecords: files.length,
            authorizedDoctors: new Set(patientAccesses.map(a => a.doctorDid)).size,
            activeShares: patientAccesses.filter(a => a.isActive && a.expiryTime > now).length
        }
    };
});

ipcMain.handle('stats:getDoctorStats', async () => {
    const session = store.get('currentSession');
    if (!session || session.type !== 'doctor') return { success: false, error: 'Unauthorized' };

    const accesses = store.get(`doctorAccesses:${session.did}`) || [];
    const now = Date.now() / 1000;
    const active = accesses.filter(a => a.isActive && a.expiryTime > now);

    return {
        success: true, stats: {
            totalPatients: new Set(accesses.map(a => a.patientDid)).size,
            availableRecords: accesses.length,
            activeAccesses: active.length,
            expiringSoon: active.filter(a => a.expiryTime - now < 7 * 24 * 3600).length
        }
    };
});

// ==================== Notifications ====================
ipcMain.handle('notification:send', async (event, { toDid, message }) => {
    const notifications = store.get('notifications') || {};
    if (!notifications[toDid]) notifications[toDid] = [];
    notifications[toDid].push({ message, timestamp: new Date().toISOString(), read: false, type: 'access_request' });
    store.set('notifications', notifications);
    return { success: true };
});

ipcMain.handle('notification:get', async () => {
    const session = store.get('currentSession');
    if (!session) return { success: false, error: 'Not authenticated' };
    const notifications = store.get('notifications') || {};
    return { success: true, notifications: notifications[session.did] || [] };
});

console.log('✅ Electron main process initialized successfully');