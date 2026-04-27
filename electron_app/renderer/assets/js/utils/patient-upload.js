// upload.js - Complete working version
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
    const uploadBtn = document.getElementById('uploadBtn');
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

    if (uploadBtn) {
        uploadBtn.addEventListener('click', startUpload);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }
}

function handleFileSelect(file) {
    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }

    currentFile = file;

    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const uploadBtn = document.getElementById('uploadBtn');

    if (fileName) fileName.innerText = file.name;
    if (fileSize) fileSize.innerText = formatFileSize(file.size);
    if (fileInfo) fileInfo.style.display = 'flex';
    if (uploadBtn) uploadBtn.disabled = false;

    console.log('File selected:', file.name);
}

async function startUpload() {
    if (!currentFile) {
        showError('Please select a file first');
        return;
    }

    const recordDate = document.getElementById('recordDate')?.value || new Date().toISOString().split('T')[0];

    console.log(`Uploading: ${currentFile.name}`);
    console.log(`Record date: ${recordDate}`);

    showLoading('Encrypting and uploading to IPFS...');

    try {
        // Step 1: Generate AES key
        console.log('Generating AES key...');
        const aesKey = await window.MediChainCrypto.generateAESKey();
        const aesKeyBase64 = await window.MediChainCrypto.exportKey(aesKey);
        console.log('✅ AES key generated');

        // Step 2: Encrypt the file
        console.log('Encrypting file...');
        const encryptedArrayBuffer = await window.MediChainCrypto.encryptFile(currentFile, aesKey);
        console.log('✅ File encrypted, size:', encryptedArrayBuffer.byteLength);

        // Step 3: Convert ArrayBuffer to Base64
        const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

        // Step 4: Upload encrypted file to IPFS
        console.log('Uploading to IPFS...');

        const ipfsResult = await window.electronAPI.uploadToIPFS({
            data: encryptedBase64,
            filename: currentFile.name + '.enc',
            fileType: 'application/octet-stream',
            metadata: {
                originalName: currentFile.name,
                recordDate: recordDate,
                encrypted: true
            }
        });

        if (!ipfsResult.success) {
            throw new Error(ipfsResult.error || 'IPFS upload failed');
        }

        const encryptedCID = ipfsResult.cid;
        console.log('✅ Uploaded to IPFS, CID:', encryptedCID);

        // Step 5: Encrypt AES key with proxy
        console.log('Encrypting AES key with proxy...');

        const policy = [["doctor"]];
        const timeSlot = Math.floor(Date.now() / 1000 / 3600);

        const proxyResponse = await fetch('http://127.0.0.1:5000/encrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aes_key_b64: aesKeyBase64,
                policy: policy,
                time_slot: timeSlot
            })
        });

        if (!proxyResponse.ok) {
            const errorText = await proxyResponse.text();
            console.error('Proxy error:', errorText);
            throw new Error(`Proxy encryption failed: ${proxyResponse.status}`);
        }

        const proxyResult = await proxyResponse.json();
        console.log('✅ AES key encrypted, ID:', proxyResult.ciphertext_id);

        // Step 6: Upload ciphertext to IPFS
        const ciphertextJson = JSON.stringify(proxyResult.ciphertext);
        const ciphertextBlob = new Blob([ciphertextJson], { type: 'application/json' });
        const ciphertextBase64 = await blobToBase64(ciphertextBlob);

        const ciphertextResult = await window.electronAPI.uploadToIPFS({
            data: ciphertextBase64,
            filename: `cipher_${Date.now()}.json`,
            fileType: 'application/json',
            metadata: {
                recordCID: encryptedCID,
                policy: policy
            }
        });

        if (!ciphertextResult.success) {
            throw new Error(ciphertextResult.error || 'Ciphertext upload failed');
        }

        const ciphertextCID = ciphertextResult.cid;
        console.log('✅ Ciphertext uploaded, CID:', ciphertextCID);

        // Step 7: Save record to local storage
        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        const newRecord = {
            id: Date.now(),
            filename: currentFile.name,
            recordType: 'Medical Record',
            recordDate: recordDate,
            encryptedCID: encryptedCID,
            ciphertextCID: ciphertextCID,
            aesKeyBase64: aesKeyBase64,
            uploadedAt: new Date().toISOString()
        };

        records.push(newRecord);
        localStorage.setItem('sharedRecords', JSON.stringify(records));

        showSuccess(`✅ "${currentFile.name}" uploaded successfully!`);

        // Reset form
        currentFile = null;
        const fileInfo = document.getElementById('fileInfo');
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');

        if (fileInfo) fileInfo.style.display = 'none';
        if (uploadBtn) uploadBtn.disabled = true;
        if (fileInput) fileInput.value = '';

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);

    } catch (error) {
        console.error('Upload error:', error);

        let errorMsg = error.message;
        if (errorMsg.includes('IPFS') || errorMsg.includes('ipfs')) {
            errorMsg = 'Cannot connect to IPFS. Please make sure IPFS Desktop is running on port 5001.';
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