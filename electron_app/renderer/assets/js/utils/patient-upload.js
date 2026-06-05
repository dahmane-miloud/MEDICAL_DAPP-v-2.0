/*
// patient-upload.js - Complete with both IPFS Desktop and Pinata upload
console.log('Upload page initializing...');

let currentFile = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for MediChainCrypto
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        showError('Crypto library not available. Please refresh.');
        return;
    }

    if (typeof window.MediChainCrypto.generateAESKey !== 'function') {
        showError('Crypto library corrupted. Refresh the page.');
        return;
    }

    console.log('✅ MediChainCrypto ready');

    await checkSession();
    attachEventListeners();

    // Set default date to today
    const dateInput = document.getElementById('recordDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'patient') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;

        const userNameEl = document.getElementById('userName');
        const userDidEl = document.getElementById('userDid');

        if (userNameEl) userNameEl.innerText = session.name || 'Patient';
        if (userDidEl) userDidEl.innerText = shortenDid(session.did);

        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function attachEventListeners() {
    const fileZone = document.getElementById('fileZone');
    const fileInput = document.getElementById('fileInput');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (fileZone) {
        fileZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });

        fileZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#1a5276';
            fileZone.style.background = '#f1f5f9';
        });

        fileZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
        });

        fileZone.addEventListener('drop', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    if (uploadLocalBtn) {
        uploadLocalBtn.addEventListener('click', () => {
            startUpload('local');
        });
    }

    if (uploadPinataBtn) {
        uploadPinataBtn.addEventListener('click', () => {
            startUpload('pinata');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }
}

function handleFileSelect(file) {
    if (file.size > 200 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }

    currentFile = file;

    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');

    if (fileName) fileName.innerText = file.name;
    if (fileSize) fileSize.innerText = formatFileSize(file.size);
    if (fileInfo) fileInfo.style.display = 'flex';
    if (uploadLocalBtn) uploadLocalBtn.disabled = false;
    if (uploadPinataBtn) uploadPinataBtn.disabled = false;

    console.log('File selected:', file.name);
}

async function startUpload(target = 'local') {
    if (!currentFile) {
        showError('Please select a file first');
        return;
    }

    const recordDate = document.getElementById('recordDate')?.value || new Date().toISOString().split('T')[0];

    const targetName = target === 'pinata' ? 'Pinata Cloud IPFS' : 'IPFS Desktop';
    console.log(`Uploading to ${targetName}: ${currentFile.name}`);
    console.log(`Record date: ${recordDate}`);

    showLoading(`Encrypting and uploading to ${targetName}...`);

    try {
        // Step 1: Generate AES key (same for both)
        console.log('Generating AES key...');
        const aesKey = await window.MediChainCrypto.generateAESKey();
        const aesKeyBase64 = await window.MediChainCrypto.exportKey(aesKey);
        console.log('✅ AES key generated');

        // Step 2: Encrypt the file (same for both)
        console.log('Encrypting file...');
        const encryptedArrayBuffer = await window.MediChainCrypto.encryptFile(currentFile, aesKey);
        console.log('✅ File encrypted, size:', encryptedArrayBuffer.byteLength);

        // Step 3: Convert ArrayBuffer to Base64
        const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

        // Step 4: Upload encrypted file to IPFS (different based on target)
        console.log(`Uploading to ${targetName}...`);

        let ipfsResult;

        if (target === 'pinata') {
            // Upload to Pinata (cloud IPFS) - REDUCED METADATA
            ipfsResult = await window.electronAPI.uploadToPinata({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: {
                    // Only 2 metadata keys to avoid 10 key limit
                    originalName: currentFile.name,
                    recordDate: recordDate
                }
            });
        } else {
            // Upload to local IPFS Desktop
            ipfsResult = await window.electronAPI.uploadToIPFS({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: {
                    originalName: currentFile.name,
                    recordDate: recordDate,
                    encrypted: true,
                    uploadMethod: 'local'
                }
            });
        }

        if (!ipfsResult.success) {
            throw new Error(ipfsResult.error || 'IPFS upload failed');
        }

        const encryptedCID = ipfsResult.cid;
        const ipfsUrl = ipfsResult.pinataUrl || `http://127.0.0.1:8080/ipfs/${encryptedCID}`;
        console.log(`✅ Uploaded to ${targetName}, CID: ${encryptedCID}`);
        if (ipfsResult.pinataUrl) console.log(`   Pinata URL: ${ipfsResult.pinataUrl}`);

        // Step 5: Encrypt AES key with proxy (same for both)
        console.log('Encrypting AES key with proxy...');

      // Step 5: Encrypt AES key with proxy (DYNAMIC MULTI-POLICY)
        console.log('Encrypting AES key with proxy...');
        
        // 1. Gather checked attributes from checkboxes
        const checkedBoxes = document.querySelectorAll('input[name="policyAttr"]:checked');
        let policyAttributes = Array.from(checkedBoxes).map(cb => cb.value);

        // 2. Gather custom comma-separated attributes if typed out
        const customInput = document.getElementById('customAttributes')?.value.trim();
        if (customInput) {
            const customList = customInput.split(',')
                                          .map(attr => attr.trim().toLowerCase())
                                          .filter(attr => attr.length > 0);
            policyAttributes = [...policyAttributes, ...customList];
        }

        // 3. Validate that at least one policy attribute is designated
        if (policyAttributes.length === 0) {
            throw new Error('You must select or type at least one authorized attribute for the access policy.');
        }

        // 4. Construct the DNF format expected by your Charm-crypto server 
        // Example: If 'doctor' and 'researcher' are chosen, this produces: [["doctor"], ["researcher"]]
        const policy = policyAttributes.map(attr => [attr]);
        
        console.log('Generated Multi-Attribute Access Policy:', JSON.stringify(policy));

        const timeSlot = Math.floor(Date.now() / 1000 / 3600); //
        const proxyResponse = await fetch('http://127.0.0.1:5000/encrypt_aes', { //
            method: 'POST', //
            headers: { 'Content-Type': 'application/json' }, //
            body: JSON.stringify({ //
                aes_key_b64: aesKeyBase64, //
                policy: policy, // Now sends your dynamic nested array!
                time_slot: timeSlot //
            })
        });

        if (!proxyResponse.ok) {
            const errorText = await proxyResponse.text();
            console.error('Proxy error:', errorText);
            throw new Error(`Proxy encryption failed: ${proxyResponse.status}`);
        }

        const proxyResult = await proxyResponse.json();
        console.log('✅ AES key encrypted, ID:', proxyResult.ciphertext_id);

        // Step 6: Upload ciphertext to IPFS (same for both)
        const ciphertextJson = JSON.stringify(proxyResult.ciphertext);
        const ciphertextBlob = new Blob([ciphertextJson], { type: 'application/json' });
        const ciphertextBase64 = await blobToBase64(ciphertextBlob);

        let ciphertextResult;

        if (target === 'pinata') {
            // Upload ciphertext to Pinata - REDUCED METADATA
            ciphertextResult = await window.electronAPI.uploadToPinata({
                data: ciphertextBase64,
                filename: `cipher_${Date.now()}.json`,
                fileType: 'application/json',
                metadata: {
                    // Only 1 metadata key
                    fileType: 'ciphertext'
                }
            });
        } else {
            ciphertextResult = await window.electronAPI.uploadToIPFS({
                data: ciphertextBase64,
                filename: `cipher_${Date.now()}.json`,
                fileType: 'application/json',
                metadata: {
                    recordCID: encryptedCID,
                    policy: policy,
                    uploadMethod: 'local'
                }
            });
        }

        if (!ciphertextResult.success) {
            throw new Error(ciphertextResult.error || 'Ciphertext upload failed');
        }

        const ciphertextCID = ciphertextResult.cid;
        console.log('✅ Ciphertext uploaded, CID:', ciphertextCID);

        // Step 7: Save record to local storage with upload method info
        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        const newRecord = {
            id: Date.now(),
            filename: currentFile.name,
            recordType: 'Medical Record',
            recordDate: recordDate,
            encryptedCID: encryptedCID,
            ciphertextCID: ciphertextCID,
            aesKeyBase64: aesKeyBase64,
            uploadedAt: new Date().toISOString(),
            uploadMethod: target,
            ipfsUrl: ipfsUrl
        };

        records.push(newRecord);
        localStorage.setItem('sharedRecords', JSON.stringify(records));

        showSuccess(`✅ "${currentFile.name}" uploaded successfully to ${targetName}!`);

        // Reset form
        currentFile = null;
        const fileInfo = document.getElementById('fileInfo');
        const uploadLocalBtn = document.getElementById('uploadLocalBtn');
        const uploadPinataBtn = document.getElementById('uploadPinataBtn');
        const fileInput = document.getElementById('fileInput');

        if (fileInfo) fileInfo.style.display = 'none';
        if (uploadLocalBtn) uploadLocalBtn.disabled = true;
        if (uploadPinataBtn) uploadPinataBtn.disabled = true;
        if (fileInput) fileInput.value = '';

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);

    } catch (error) {
        console.error('Upload error:', error);

        let errorMsg = error.message;
        if (errorMsg.includes('IPFS') || errorMsg.includes('ipfs')) {
            if (target === 'pinata') {
                errorMsg = 'Cannot connect to Pinata. Please check your internet connection and API keys.';
            } else {
                errorMsg = 'Cannot connect to IPFS Desktop. Please make sure IPFS Desktop is running on port 5001.';
            }
        } else if (errorMsg.includes('proxy') || errorMsg.includes('5000')) {
            errorMsg = 'Proxy server error. Please make sure TB-PRE server is running on port 5000.';
        } else if (errorMsg.includes('Failed to fetch')) {
            errorMsg = 'Cannot connect to proxy server. Please make sure it is running on port 5000.';
        }

        showError('Upload failed: ' + errorMsg);
    } finally {
        hideLoading();
    }
}

// Helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    return did.length <= 20 ? did : did.substring(0, 12) + '...' + did.substring(did.length - 8);
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.remove();
}

function showError(msg) {
    showToast(msg, 'error');
}

function showSuccess(msg) {
    showToast(msg, 'success');
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ Upload page ready');


*/
//*********************** new code  */

/*

//code 2
// patient-upload.js - Simplified to encrypt with local AES-256 only
console.log('Upload page initializing...');

let currentFile = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for MediChainCrypto library to be fully ready
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        showError('Crypto library not available. Please refresh.');
        return;
    }

    console.log('✅ MediChainCrypto ready');
    await checkSession();
    attachEventListeners();

    // Set default date picker to today
    const dateInput = document.getElementById('recordDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'patient') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;
        const userNameEl = document.getElementById('userName');
        const userDidEl = document.getElementById('userDid');
        if (userNameEl) userNameEl.innerText = session.name || 'Patient';
        if (userDidEl) userDidEl.innerText = shortenDid(session.did);
        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function attachEventListeners() {
    const fileZone = document.getElementById('fileZone');
    const fileInput = document.getElementById('fileInput');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (fileZone) {
        fileZone.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        fileZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#1a5276';
            fileZone.style.background = '#f1f5f9';
        });
        fileZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
        });
        fileZone.addEventListener('drop', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileSelect(files[0]);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
        });
    }

    if (uploadLocalBtn) {
        uploadLocalBtn.addEventListener('click', () => startUpload('local'));
    }
    if (uploadPinataBtn) {
        uploadPinataBtn.addEventListener('click', () => startUpload('pinata'));
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }
}

function handleFileSelect(file) {
    if (file.size > 200 * 1024 * 1024) {
        showError('File size exceeds the 200MB limit.');
        return;
    }
    currentFile = file;
    const fileInfo = document.getElementById('fileInfo');
    const fileNameEl = document.getElementById('fileName');
    const fileSizeEl = document.getElementById('fileSize');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');

    if (fileNameEl) fileNameEl.innerText = file.name;
    if (fileSizeEl) fileSizeEl.innerText = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (fileInfo) fileInfo.style.display = 'flex';

    if (uploadLocalBtn) uploadLocalBtn.disabled = false;
    if (uploadPinataBtn) uploadPinataBtn.disabled = false;
}

async function startUpload(target = 'local') {
    if (!currentFile) {
        showError('Please select a file first');
        return;
    }

    const recordDate = document.getElementById('recordDate')?.value || new Date().toISOString().split('T')[0];
    const targetName = target === 'pinata' ? 'Pinata Cloud IPFS' : 'IPFS Desktop';
    showLoading(`Encrypting and uploading to ${targetName}...`);

    try {
        // Step 1: Generate plain AES-256 key locally
        console.log('Generating local AES key...');
        const aesKey = await window.MediChainCrypto.generateAESKey();
        const aesKeyBase64 = await window.MediChainCrypto.exportKey(aesKey);

        // Step 2: Encrypt EHR file data with AES
        console.log('Encrypting file contents...');
        const encryptedArrayBuffer = await window.MediChainCrypto.encryptFile(currentFile, aesKey);
        const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

        // Step 3: Upload Raw Encrypted Data directly to targeted network storage
        let ipfsResult;
        if (target === 'pinata') {
            ipfsResult = await window.electronAPI.uploadToPinata({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: { originalName: currentFile.name, recordDate: recordDate }
            });
        } else {
            ipfsResult = await window.electronAPI.uploadToIPFS({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: { originalName: currentFile.name, recordDate: recordDate, encrypted: true, uploadMethod: 'local' }
            });
        }


        if (!ipfsResult.success) throw new Error(ipfsResult.error || 'Storage upload failed');

        const encryptedCID = ipfsResult.cid;
        const ipfsUrl = ipfsResult.pinataUrl || `http://127.0.0.1:8080/ipfs/${encryptedCID}`;
        console.log(`✅ File uploaded successfully. CID: ${encryptedCID}`);

        // Step 4: Map local storage record directly with the plain AES text key
        // NO Proxy call happens here anymore!
        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        const newRecord = {
            id: Date.now(),
            filename: currentFile.name,
            recordType: 'Medical Record',
            recordDate: recordDate,
            encryptedCID: encryptedCID,
            ciphertextCID: null,         // Stays empty until explicitly shared with an attribute policy
            aesKeyBase64: aesKeyBase64,   // Kept safe locally for later on-demand proxy encryption calls
            uploadedAt: new Date().toISOString(),
            uploadMethod: target,
            ipfsUrl: ipfsUrl
        };

        records.push(newRecord);
        localStorage.setItem('sharedRecords', JSON.stringify(records));
        showSuccess(`✅ "${currentFile.name}" uploaded successfully!`);

        // Reset elements
        currentFile = null;
        document.getElementById('fileInput').value = '';
        if (document.getElementById('fileInfo')) document.getElementById('fileInfo').style.display = 'none';
        if (uploadLocalBtn) uploadLocalBtn.disabled = true;
        if (uploadPinataBtn) uploadPinataBtn.disabled = true;

        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);

    } catch (error) {
        console.error('Upload Error:', error);
        showError('Upload execution failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    return did.length <= 20 ? did : did.substring(0, 12) + '...' + did.substring(did.length - 8);
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${msg}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const el = document.getElementById('global-loading');
    if (el) el.remove();
}

function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

*/

// patient-upload.js - Simplified to encrypt with local AES-256 only
console.log('Upload page initializing...');

let currentFile = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for MediChainCrypto library to be fully ready
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        showError('Crypto library not available. Please refresh.');
        return;
    }

    if (typeof window.MediChainCrypto.generateAESKey !== 'function') {
        showError('Crypto library corrupted. Refresh the page.');
        return;
    }

    console.log('✅ MediChainCrypto ready');
    await checkSession();
    attachEventListeners();

    // Set default date picker to today
    const dateInput = document.getElementById('recordDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'patient') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;
        const userNameEl = document.getElementById('userName');
        const userDidEl = document.getElementById('userDid');
        if (userNameEl) userNameEl.innerText = session.name || 'Patient';
        if (userDidEl) userDidEl.innerText = shortenDid(session.did);
        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function attachEventListeners() {
    const fileZone = document.getElementById('fileZone');
    const fileInput = document.getElementById('fileInput');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (fileZone) {
        fileZone.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        fileZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#1a5276';
            fileZone.style.background = '#f1f5f9';
        });
        fileZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
        });
        fileZone.addEventListener('drop', (e) => {
            e.preventDefault();
            fileZone.style.borderColor = '#cbd5e1';
            fileZone.style.background = '#f8f9fa';
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileSelect(files[0]);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
        });
    }

    if (uploadLocalBtn) {
        uploadLocalBtn.addEventListener('click', () => startUpload('local'));
    }
    if (uploadPinataBtn) {
        uploadPinataBtn.addEventListener('click', () => startUpload('pinata'));
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }
}

function handleFileSelect(file) {
    if (file.size > 200 * 1024 * 1024) {
        showError('File size exceeds the 200MB limit.');
        return;
    }
    currentFile = file;
    const fileInfo = document.getElementById('fileInfo');
    const fileNameEl = document.getElementById('fileName');
    const fileSizeEl = document.getElementById('fileSize');
    const uploadLocalBtn = document.getElementById('uploadLocalBtn');
    const uploadPinataBtn = document.getElementById('uploadPinataBtn');

    if (fileNameEl) fileNameEl.innerText = file.name;
    if (fileSizeEl) fileSizeEl.innerText = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (fileInfo) fileInfo.style.display = 'flex';

    if (uploadLocalBtn) uploadLocalBtn.disabled = false;
    if (uploadPinataBtn) uploadPinataBtn.disabled = false;
}

async function startUpload(target = 'local') {
    if (!currentFile) {
        showError('Please select a file first');
        return;
    }

    const recordDate = document.getElementById('recordDate')?.value || new Date().toISOString().split('T')[0];
    const targetName = target === 'pinata' ? 'Pinata Cloud IPFS' : 'IPFS Desktop';
    showLoading(`Encrypting and uploading to ${targetName}...`);
    try {
        // Step 1: Generate plain AES-256 key locally
        console.log('Generating local AES key...');
        const aesKey = await window.MediChainCrypto.generateAESKey();
        const aesKeyBase64 = await window.MediChainCrypto.exportKey(aesKey);

        // Step 2: Encrypt EHR file data with AES
        console.log('Encrypting file contents...');
        const encryptedArrayBuffer = await window.MediChainCrypto.encryptFile(currentFile, aesKey);
        const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

        // Step 3: Upload Raw Encrypted Data directly to targeted network storage
        let ipfsResult;
        if (target === 'pinata') {
            ipfsResult = await window.electronAPI.uploadToPinata({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: { originalName: currentFile.name, recordDate: recordDate }
            });
        } else {
            ipfsResult = await window.electronAPI.uploadToIPFS({
                data: encryptedBase64,
                filename: currentFile.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: { originalName: currentFile.name, recordDate: recordDate, encrypted: true, uploadMethod: 'local' }
            });
        }

        if (!ipfsResult || !ipfsResult.success) throw new Error(ipfsResult?.error || 'Storage upload failed');
        const encryptedCID = ipfsResult.cid;
        const ipfsUrl = ipfsResult.pinataUrl || `http://127.0.0.1:8080/ipfs/${encryptedCID}`;
        console.log(`✅ File uploaded successfully. CID: ${encryptedCID}`);

        // Step 4: Map local storage record directly with the plain AES text key
        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        const newRecord = {
            id: Date.now(),
            filename: currentFile.name,
            recordType: 'Medical Record',
            recordDate: recordDate,
            encryptedCID: encryptedCID,
            ciphertextCID: null,         // Stays empty until explicitly shared with an attribute policy
            aesKeyBase64: aesKeyBase64,   // Kept safe locally for later on-demand proxy encryption calls
            uploadedAt: new Date().toISOString(),
            uploadMethod: target,
            ipfsUrl: ipfsUrl,
            patientDid: window.currentUser.did // CRITICAL: Isolates records to this specific user account
        };
        records.push(newRecord);
        localStorage.setItem('sharedRecords', JSON.stringify(records));
        showSuccess(`✅ "${currentFile.name}" uploaded successfully!`);

        // Reset elements
        currentFile = null;
        const fileInfo = document.getElementById('fileInfo');
        const uploadLocalBtn = document.getElementById('uploadLocalBtn');
        const uploadPinataBtn = document.getElementById('uploadPinataBtn');
        const fileInput = document.getElementById('fileInput');

        if (fileInfo) fileInfo.style.display = 'none';
        if (uploadLocalBtn) uploadLocalBtn.disabled = true;
        if (uploadPinataBtn) uploadPinataBtn.disabled = true;
        if (fileInput) fileInput.value = '';

        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);

    } catch (error) {
        console.error('Upload Error:', error);
        showError('Upload execution failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    return did.length <= 20 ? did : did.substring(0, 12) + '...' + did.substring(did.length - 8);
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${msg}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const el = document.getElementById('global-loading');
    if (el) el.remove();
}

function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}