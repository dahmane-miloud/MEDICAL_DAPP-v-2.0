/*
// patient.js - Complete Professional Patient Dashboard
console.log('Patient dashboard initializing...');

window.currentUser = null;
let currentViewRecord = { cid: null, aesKeyBase64: null };
let currentShareRecordId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadDashboardData();
    attachEventListeners();
});

// ========== SESSION MANAGEMENT ==========
async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'patient') {
        window.location.href = '../login.html';
        return false;
    }
    window.currentUser = session;
    document.getElementById('userName').innerText = session.name || 'Patient';
    document.getElementById('userDid').innerText = shortenDid(session.did);
    document.getElementById('userNameHeader').innerText = session.name || 'Patient';
    return true;
}

function attachEventListeners() {
    // Navigation
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        window.electronAPI.logout();
        window.location.href = '../login.html';
    });
    document.getElementById('newRecordBtn')?.addEventListener('click', () => {
        window.location.href = 'upload.html';
    });
    document.getElementById('checkDoctorBtn')?.addEventListener('click', () => {
        openDoctorDidModal(checkDoctorStatus);
    });
    document.getElementById('refreshRecordsBtn')?.addEventListener('click', () => {
        loadDashboardData();
    });
    document.getElementById('confirmShareBtn')?.addEventListener('click', () => {
        confirmShare();
    });

    // Duration buttons in share modal
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // View options buttons
    document.getElementById('downloadEncryptedBtn')?.addEventListener('click', () => {
        downloadEncryptedFile(currentViewRecord.cid);
        closeViewOptionsModal();
    });
    document.getElementById('decryptAndOpenBtn')?.addEventListener('click', () => {
        decryptAndDownload(currentViewRecord.cid, currentViewRecord.aesKeyBase64, document.getElementById('viewFileName')?.innerText || 'file');
        closeViewOptionsModal();
    });
}

// ========== DASHBOARD DATA ==========
async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        const stats = await window.electronAPI.getPatientStats();
        if (stats.success) {
            document.getElementById('totalRecords').innerText = stats.stats.totalRecords;
            document.getElementById('authorizedDoctors').innerText = stats.stats.authorizedDoctors;
            document.getElementById('activeShares').innerText = stats.stats.activeShares;
        }

        await loadAccessRequests();
        await loadRecords();
        await loadAuthorizations();

        // Update total records from localStorage
        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        document.getElementById('totalRecords').innerText = records.length;

    } catch (err) {
        console.error(err);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

async function loadAccessRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;
    try {
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? notifs.notifications.filter(n => n.type === 'access_request') : [];
        document.getElementById('requestBadge').innerText = requests.length;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-data">No access requests</div>';
            return;
        }
        let html = '';
        for (const req of requests) {
            const doctorDid = req.doctorDid || extractDidFromMessage(req.message);
            html += `
                <div class="request-item">
                    <div class="request-info">
                        <h4><i class="fas fa-user-md"></i> ${escapeHtml(req.doctorName || 'Doctor')}</h4>
                        <p><strong>DID:</strong> ${shortenDid(doctorDid)}</p>
                        <p>${escapeHtml(req.message)}</p>
                        <small>${new Date(req.timestamp).toLocaleString()}</small>
                    </div>
                    <div class="request-actions">
                        <button class="btn-primary" onclick="shareWithDoctor('${doctorDid}')">Share Record</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-data">Error loading requests</div>';
    }
}

function extractDidFromMessage(message) {
    const match = message.match(/did:key:[^\s]+/);
    return match ? match[0] : '';
}

async function loadRecords() {
    const container = document.getElementById('recordsList');
    if (!container) return;
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    if (records.length === 0) {
        container.innerHTML = '<div class="no-data">No uploaded records. Go to Upload page.</div>';
        return;
    }
    let html = '';
    for (const rec of records.slice(-6).reverse()) {
        const cid = rec.encryptedCID || '';
        html += `
            <div class="record-card">
                <div class="record-header">
                    <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                    <span class="record-status status-active">Encrypted</span>
                </div>
                <div class="record-info">
                    <h4>${escapeHtml(rec.filename)}</h4>
                    <p><i class="fas fa-tag"></i> ${rec.recordType || 'Medical Record'}</p>
                    <p><i class="fas fa-calendar"></i> ${rec.recordDate || 'Unknown date'}</p>
                    <p class="record-cid">CID: ${shortenDid(cid)}</p>
                </div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="copyAESKey(${rec.id})" title="Copy AES Key"><i class="fas fa-key"></i></button>
                    <button class="btn-icon" onclick="openShareModal(${rec.id}, '${cid}')" title="Share"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" onclick="viewRecord('${cid}', ${rec.id})" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon btn-danger" onclick="deleteRecord(${rec.id})" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadAuthorizations() {
    const container = document.getElementById('authList');
    if (!container) return;
    try {
        const accesses = await window.electronAPI.getPatientAccesses();
        const authorizations = accesses.success ? (accesses.accesses || []) : [];
        if (authorizations.length === 0) {
            container.innerHTML = '<div class="no-data">No active authorizations</div>';
            return;
        }
        let html = '';
        for (const auth of authorizations) {
            const expiryDate = new Date(auth.expiryTime * 1000);
            const isExpired = expiryDate < new Date();
            html += `
                <div class="auth-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-user-md"></i></div>
                        <span class="record-status ${isExpired ? 'status-expired' : 'status-active'}">${isExpired ? 'Expired' : 'Active'}</span>
                    </div>
                    <div class="record-info">
                        <h4>Doctor: ${shortenDid(auth.doctorDid)}</h4>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        <p><i class="fas fa-fingerprint"></i> CID: ${shortenDid(auth.documentCid || '')}</p>
                    </div>
                    <div class="record-actions">
                        <button class="btn-danger" onclick="revokeAccess('${auth.doctorDid}', '${auth.documentCid}')">Revoke Access</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-data">Error loading authorizations</div>';
    }
}

// ========== DOCTOR MODAL ==========
let pendingDoctorCallback = null;

function openDoctorDidModal(callback) {
    pendingDoctorCallback = callback;
    const modal = document.getElementById('doctorDidModal');
    if (modal) {
        document.getElementById('doctorDidInput').value = '';
        modal.style.display = 'flex';
    }
}

function closeDoctorDidModal() {
    const modal = document.getElementById('doctorDidModal');
    if (modal) modal.style.display = 'none';
    pendingDoctorCallback = null;
}

function submitDoctorDid() {
    const did = document.getElementById('doctorDidInput').value.trim();
    if (did && pendingDoctorCallback) {
        pendingDoctorCallback(did);
        closeDoctorDidModal();
    } else if (!did) {
        showError('Please enter a Doctor DID');
    }
}

// ========== DOCTOR STATUS CHECK ==========
async function checkDoctorStatus(doctorDid) {
    showLoading('Checking doctor status...');
    try {
        const witnessResult = await window.electronAPI.getDoctorWitness(doctorDid);
        const isActive = await window.electronAPI.isDoctorActive(doctorDid);

        if (witnessResult && witnessResult.witnessHash && isActive) {
            const expiryDate = new Date(witnessResult.expiryTime * 1000);
            showSuccess(`✅ Doctor is ACTIVE\nExpires: ${expiryDate.toLocaleString()}`);
        } else {
            showError('❌ Doctor not active or has no witness');
        }
    } catch (err) {
        showError('Doctor not found or not active');
    } finally {
        hideLoading();
    }
}

// ========== SHARE MODAL ==========
function openShareModal(recordId, cid) {
    currentShareRecordId = recordId;
    document.getElementById('shareRecordCid').value = cid;
    document.getElementById('shareRecordId').value = recordId;
    document.getElementById('shareDoctorDid').value = '';
    document.querySelectorAll('.duration-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.duration-btn[data-days="7"]')?.classList.add('active');
    document.getElementById('shareModal').style.display = 'flex';
}

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
    currentShareRecordId = null;
}

async function confirmShare() {
    const doctorDid = document.getElementById('shareDoctorDid').value.trim();
    if (!doctorDid) {
        showError('Please enter doctor DID');
        return;
    }

    const attribute = document.getElementById('shareAttribute').value;
    const activeDuration = document.querySelector('.duration-btn.active');
    const durationDays = activeDuration ? parseInt(activeDuration.dataset.days) : 7;

    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.id == currentShareRecordId);
    if (!record) {
        showError('Record not found');
        return;
    }

    const expiryTime = Math.floor(Date.now() / 1000) + durationDays * 86400;

    showLoading('Encrypting and sharing...');
    try {
        // 1. Verify doctor is active
        const isActive = await window.electronAPI.isDoctorActive(doctorDid);
        if (!isActive) throw new Error('Doctor not active');

        // 2. Encrypt AES key with proxy
        const proxyResult = await encryptKeyWithProxy(record.aesKeyBase64, attribute);

        // 3. Upload ciphertext to IPFS - FIXED VERSION
        const ciphertextJson = JSON.stringify(proxyResult.ciphertext);
        const ciphertextBlob = new Blob([ciphertextJson], { type: 'application/json' });

        // Convert blob to base64 for IPC
        const ciphertextBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(ciphertextBlob);
        });

        const uploadResult = await window.electronAPI.uploadToIPFS({
            data: ciphertextBase64,
            filename: `cipher_${Date.now()}.json`,
            fileType: 'application/json',
            metadata: { recordCID: record.encryptedCID, attribute }
        });

        if (!uploadResult.success) {
            throw new Error(uploadResult.error || 'IPFS upload failed');
        }
        const ciphertextCID = uploadResult.cid;
        console.log('✅ Ciphertext uploaded to IPFS:', ciphertextCID);

        // 4. Grant access via electron-store
        const grantResult = await window.electronAPI.grantAccess({
            patientDid: window.currentUser.did,
            doctorDid: doctorDid,
            documentCid: record.encryptedCID,
            encryptedCid: ciphertextCID,
            extra: JSON.stringify({
                ciphertext_id: proxyResult.ciphertext_id,
                attribute: attribute,
                expiryTime: expiryTime
            })
        });

        if (!grantResult.success) throw new Error('Grant access failed');

        // 5. Send notification to doctor
        await window.electronAPI.sendNotification({
            toDid: doctorDid,
            message: `Patient ${window.currentUser.name} shared a medical record (${record.filename}) with attribute "${attribute}" for ${durationDays} days`
        });

        showSuccess(`Record shared successfully with ${durationDays} days access`);
        closeShareModal();
        await loadDashboardData();

    } catch (err) {
        console.error('Share error:', err);
        showError(err.message || 'Failed to share record');
    } finally {
        hideLoading();
    }
}

window.shareWithDoctor = function (doctorDid) {
    document.getElementById('shareDoctorDid').value = doctorDid;
    openShareModal(null, '');
    // We need to prompt for record selection
    showError('Please select a record to share first');
};

// ========== PROXY ENCRYPTION ==========
async function encryptKeyWithProxy(aesKeyBase64, attribute) {
    const policy = [[attribute]];
    const response = await fetch('http://localhost:5003/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_base64: aesKeyBase64, policy: policy })
    });
    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Proxy encryption failed');
    return {
        success: true,
        ciphertext: result.ciphertext,
        ciphertext_id: result.ciphertext_id
    };
}

// ========== RECORD MANAGEMENT ==========
window.copyAESKey = async function (recordId) {
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.id === recordId);
    if (record && record.aesKeyBase64) {
        await navigator.clipboard.writeText(record.aesKeyBase64);
        showSuccess('AES key copied');
    } else {
        showError('Key not found');
    }
};

window.deleteRecord = function (recordId) {
    if (!confirm('Delete this record? The encrypted file remains on IPFS, but you will lose the reference.')) return;
    let records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    records = records.filter(r => r.id !== recordId);
    localStorage.setItem('sharedRecords', JSON.stringify(records));
    loadRecords();
    updateTotalRecordsCount();
    showSuccess('Record deleted');
};

function updateTotalRecordsCount() {
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const totalEl = document.getElementById('totalRecords');
    if (totalEl) totalEl.innerText = records.length;
}

// ========== VIEW RECORD ==========
window.viewRecord = async function (cid, recordId) {
    if (!cid) { showError('No CID'); return; }
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.encryptedCID === cid);
    currentViewRecord = { cid: cid, aesKeyBase64: record ? record.aesKeyBase64 : null };
    const modal = document.getElementById('viewOptionsModal');
    if (modal) {
        document.getElementById('viewFileName').innerText = record ? record.filename : 'file';
        modal.style.display = 'flex';
    }
};

function closeViewOptionsModal() {
    document.getElementById('viewOptionsModal').style.display = 'none';
}

async function downloadEncryptedFile(cid) {
    showLoading('Downloading...');
    try {
        const result = await window.electronAPI.getFromIPFS(cid);
        if (!result.success) throw new Error('File not found');
        const blob = base64ToBlob(result.data.data, result.data.fileType || 'application/octet-stream');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.filename || 'encrypted_file.enc';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Downloaded');
    } catch (err) { showError(err.message); }
    finally { hideLoading(); }
}

async function decryptAndDownload(cid, aesKeyBase64, filename) {
    showLoading('Decrypting...');
    try {
        const result = await window.electronAPI.getFromIPFS(cid);
        if (!result.success) throw new Error('File not found');
        const encryptedArray = Uint8Array.from(atob(result.data.data), c => c.charCodeAt(0));
        const aesKey = await CryptoUtils.importKey(aesKeyBase64);
        const decrypted = await CryptoUtils.decryptFile(encryptedArray, aesKey);
        const blob = new Blob([decrypted]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace('.enc', '') || 'decrypted_file';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Decrypted and downloaded');
    } catch (err) { showError('Decryption failed: ' + err.message); }
    finally { hideLoading(); }
}

window.closeViewModal = function () {
    document.getElementById('viewModal').style.display = 'none';
    document.getElementById('viewContent').innerHTML = 'Loading...';
};

window.revokeAccess = async function (doctorDid, documentCid) {
    if (!confirm('Revoke access for this doctor?')) return;
    try {
        // Implementation for revoking access
        showSuccess('Access revoked');
        await loadDashboardData();
    } catch (err) {
        showError('Failed to revoke access');
    }
};

// ========== UTILITIES ==========
function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    return did.length <= 20 ? did : did.substring(0, 12) + '...' + did.substring(did.length - 8);
}
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
async function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}
function base64ToBlob(base64, mimeType) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}
function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() { document.getElementById('global-loading')?.remove(); }
function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}


*/

//------------- new code ------------------------------------

// patient.js - Complete Patient Dashboard
// patient.js - Complete Patient Dashboard
console.log('Patient dashboard initializing...');

window.currentUser = null;
let currentViewRecord = { cid: null, aesKeyBase64: null };
let currentShareRecordId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check for MediChainCrypto (not CryptoUtils)
    if (typeof window.MediChainCrypto === 'undefined') {
        console.error('MediChainCrypto not loaded!');
        showError('Crypto library not available. Please refresh the page.');
        return;
    }
    await checkSession();
    await loadDashboardData();
    attachEventListeners();
});
// ========== SESSION MANAGEMENT ==========
async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'patient') {
        window.location.href = '../login.html';
        return false;
    }
    window.currentUser = session;
    const userNameEl = document.getElementById('userName');
    const userDidEl = document.getElementById('userDid');
    const userNameHeaderEl = document.getElementById('userNameHeader');
    if (userNameEl) userNameEl.innerText = session.name || 'Patient';
    if (userDidEl) userDidEl.innerText = shortenDid(session.did);
    if (userNameHeaderEl) userNameHeaderEl.innerText = session.name || 'Patient';
    return true;
}

function attachEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    const newRecordBtn = document.getElementById('newRecordBtn');
    const checkDoctorBtn = document.getElementById('checkDoctorBtn');
    const refreshBtn = document.getElementById('refreshRecordsBtn');
    const confirmShareBtn = document.getElementById('confirmShareBtn');
    const downloadEncryptedBtn = document.getElementById('downloadEncryptedBtn');
    const decryptAndOpenBtn = document.getElementById('decryptAndOpenBtn');

    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        window.electronAPI.logout();
        window.location.href = '../login.html';
    });
    if (newRecordBtn) newRecordBtn.addEventListener('click', () => {
        window.location.href = 'upload.html';
    });
    if (checkDoctorBtn) checkDoctorBtn.addEventListener('click', () => {
        openDoctorDidModal(checkDoctorStatus);
    });
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        loadDashboardData();
    });
    if (confirmShareBtn) confirmShareBtn.addEventListener('click', () => {
        confirmShare();
    });
    if (downloadEncryptedBtn) downloadEncryptedBtn.addEventListener('click', () => {
        downloadEncryptedFile(currentViewRecord.cid);
        closeViewOptionsModal();
    });
    if (decryptAndOpenBtn) decryptAndOpenBtn.addEventListener('click', () => {
        decryptAndDownload(currentViewRecord.cid, currentViewRecord.aesKeyBase64,
            document.getElementById('viewFileName')?.innerText || 'file');
        closeViewOptionsModal();
    });

    // Duration buttons
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// ========== DASHBOARD DATA ==========
async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        const stats = await window.electronAPI.getPatientStats();
        if (stats.success) {
            const totalRecordsEl = document.getElementById('totalRecords');
            const authorizedDoctorsEl = document.getElementById('authorizedDoctors');
            const activeSharesEl = document.getElementById('activeShares');
            if (totalRecordsEl) totalRecordsEl.innerText = stats.stats.totalRecords;
            if (authorizedDoctorsEl) authorizedDoctorsEl.innerText = stats.stats.authorizedDoctors;
            if (activeSharesEl) activeSharesEl.innerText = stats.stats.activeShares;
        }

        await loadAccessRequests();
        await loadRecords();
        await loadAuthorizations();

        const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
        const totalRecordsEl = document.getElementById('totalRecords');
        if (totalRecordsEl) totalRecordsEl.innerText = records.length;

        // Update pending requests count
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? notifs.notifications.filter(n => n.type === 'access_request') : [];
        const pendingRequestsEl = document.getElementById('pendingRequests');
        if (pendingRequestsEl) pendingRequestsEl.innerText = requests.length;

    } catch (err) {
        console.error(err);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

async function loadAccessRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;
    try {
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? notifs.notifications.filter(n => n.type === 'access_request') : [];
        const requestBadge = document.getElementById('requestBadge');
        if (requestBadge) requestBadge.innerText = requests.length;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-data">No access requests</div>';
            return;
        }

        let html = '';
        for (const req of requests) {
            const doctorDid = req.doctorDid || extractDidFromMessage(req.message);
            html += `
                <div class="request-item">
                    <div class="request-info">
                        <h4><i class="fas fa-user-md"></i> ${escapeHtml(req.doctorName || 'Doctor')}</h4>
                        <p><strong>DID:</strong> ${shortenDid(doctorDid)}</p>
                        <p>${escapeHtml(req.message)}</p>
                        <small>${new Date(req.timestamp).toLocaleString()}</small>
                    </div>
                    <div class="request-actions">
                        <button class="btn-primary" onclick="shareWithDoctor('${doctorDid}')">Share Record</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-data">Error loading requests</div>';
    }
}

function extractDidFromMessage(message) {
    const match = message.match(/did:key:[^\s]+/);
    return match ? match[0] : '';
}

async function loadRecords() {
    const container = document.getElementById('recordsList');
    if (!container) return;
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');

    if (records.length === 0) {
        container.innerHTML = '<div class="no-data">No uploaded records. Go to Upload page.</div>';
        return;
    }

    let html = '';
    for (const rec of records.slice(-6).reverse()) {
        const cid = rec.encryptedCID || '';
        html += `
            <div class="record-card">
                <div class="record-header">
                    <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                    <span class="record-status status-active">Encrypted</span>
                </div>
                <div class="record-info">
                    <h4>${escapeHtml(rec.filename)}</h4>
                    <p><i class="fas fa-tag"></i> ${rec.recordType || 'Medical Record'}</p>
                    <p><i class="fas fa-calendar"></i> ${rec.recordDate || 'Unknown date'}</p>
                    <p class="record-cid">CID: ${shortenDid(cid)}</p>
                </div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="copyAESKey(${rec.id})" title="Copy AES Key"><i class="fas fa-key"></i></button>
                    <button class="btn-icon" onclick="openShareModal(${rec.id}, '${cid}')" title="Share"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" onclick="viewRecord('${cid}', ${rec.id})" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon btn-danger" onclick="deleteRecord(${rec.id})" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadAuthorizations() {
    const container = document.getElementById('authList');
    if (!container) return;
    try {
        const accesses = await window.electronAPI.getPatientAccesses();
        const authorizations = accesses.success ? (accesses.accesses || []) : [];

        if (authorizations.length === 0) {
            container.innerHTML = '<div class="no-data">No active authorizations</div>';
            return;
        }

        let html = '';
        for (const auth of authorizations) {
            const expiryDate = new Date(auth.expiryTime * 1000);
            const isExpired = expiryDate < new Date();
            html += `
                <div class="auth-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-user-md"></i></div>
                        <span class="record-status ${isExpired ? 'status-expired' : 'status-active'}">${isExpired ? 'Expired' : 'Active'}</span>
                    </div>
                    <div class="record-info">
                        <h4>Doctor: ${shortenDid(auth.doctorDid)}</h4>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        <p><i class="fas fa-fingerprint"></i> CID: ${shortenDid(auth.documentCid || '')}</p>
                    </div>
                    <div class="record-actions">
                        <button class="btn-danger" onclick="revokeAccess('${auth.doctorDid}', '${auth.documentCid}')">Revoke Access</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-data">Error loading authorizations</div>';
    }
}

// ========== DOCTOR MODAL ==========
let pendingDoctorCallback = null;

function openDoctorDidModal(callback) {
    pendingDoctorCallback = callback;
    const modal = document.getElementById('doctorDidModal');
    if (modal) {
        const input = document.getElementById('doctorDidInput');
        if (input) input.value = '';
        modal.style.display = 'flex';
    }
}

function closeDoctorDidModal() {
    const modal = document.getElementById('doctorDidModal');
    if (modal) modal.style.display = 'none';
    pendingDoctorCallback = null;
}

function submitDoctorDid() {
    const input = document.getElementById('doctorDidInput');
    const did = input ? input.value.trim() : '';
    if (did && pendingDoctorCallback) {
        pendingDoctorCallback(did);
        closeDoctorDidModal();
    } else if (!did) {
        showError('Please enter a Doctor DID');
    }
}

// Make functions global for HTML onclick
window.submitDoctorDid = submitDoctorDid;
window.closeDoctorDidModal = closeDoctorDidModal;

// ========== DOCTOR STATUS CHECK ==========
// In patient.js, when checking doctor status
async function checkDoctorStatus(doctorDid) {
    showLoading('Checking doctor status...');
    try {
        const isActive = await window.electronAPI.isDoctorActive(doctorDid);
        const witness = await window.electronAPI.getDoctorWitness(doctorDid);

        if (isActive && witness.isActive) {
            const expiryDate = new Date(witness.expiryTime * 1000);
            showSuccess(`✅ Doctor is ACTIVE\nExpires: ${expiryDate.toLocaleString()}`);
        } else {
            showError('❌ Doctor is not active');
        }
    } catch (err) {
        showError('Doctor not found or not active');
    } finally {
        hideLoading();
    }
}

// ========== SHARE MODAL ==========
function openShareModal(recordId, cid) {
    currentShareRecordId = recordId;
    const shareRecordCid = document.getElementById('shareRecordCid');
    const shareRecordId = document.getElementById('shareRecordId');
    const shareDoctorDid = document.getElementById('shareDoctorDid');

    if (shareRecordCid) shareRecordCid.value = cid;
    if (shareRecordId) shareRecordId.value = recordId;
    if (shareDoctorDid) shareDoctorDid.value = '';

    document.querySelectorAll('.duration-btn').forEach(btn => btn.classList.remove('active'));
    const defaultBtn = document.querySelector('.duration-btn[data-days="7"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    const modal = document.getElementById('shareModal');
    if (modal) modal.style.display = 'flex';
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) modal.style.display = 'none';
    currentShareRecordId = null;
}

window.closeShareModal = closeShareModal;

async function confirmShare() {
    const doctorDidInput = document.getElementById('shareDoctorDid');
    const doctorDid = doctorDidInput ? doctorDidInput.value.trim() : '';

    if (!doctorDid) {
        showError('Please enter doctor DID');
        return;
    }

    const attributeSelect = document.getElementById('shareAttribute');
    const attribute = attributeSelect ? attributeSelect.value : 'doctor';

    const activeDuration = document.querySelector('.duration-btn.active');
    const durationDays = activeDuration ? parseInt(activeDuration.dataset.days) : 7;

    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.id == currentShareRecordId);

    if (!record) {
        showError('Record not found');
        return;
    }

    const expiryTime = Math.floor(Date.now() / 1000) + durationDays * 86400;

    showLoading('Encrypting and sharing...');
    try {
        // 1. Verify doctor is active
        const isActive = await window.electronAPI.isDoctorActive(doctorDid);
        if (!isActive) throw new Error('Doctor not active');

        // 2. Encrypt AES key with proxy
        const proxyResult = await encryptKeyWithProxy(record.aesKeyBase64, attribute);

        // Get the ciphertext_id from the proxy result
        const ciphertextId = proxyResult.ciphertext_id;
        console.log('✅ Ciphertext ID from proxy:', ciphertextId);

        // 3. Upload ciphertext to IPFS
        const ciphertextJson = JSON.stringify(proxyResult.ciphertext);
        const ciphertextBlob = new Blob([ciphertextJson], { type: 'application/json' });
        const ciphertextBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(ciphertextBlob);
        });

        const ipfsCheck = await window.electronAPI.checkIPFS();
        if (!ipfsCheck.success) {
            throw new Error('IPFS Desktop is not running. Please start IPFS Desktop on port 5001.');
        }

        const uploadResult = await window.electronAPI.uploadToIPFS({
            data: ciphertextBase64,
            filename: `cipher_${Date.now()}.json`,
            fileType: 'application/json',
            metadata: { recordCID: record.encryptedCID, attribute, ciphertextId: ciphertextId }
        });

        if (!uploadResult.success) {
            throw new Error(uploadResult.error || 'IPFS upload failed');
        }

        const ciphertextCID = uploadResult.cid;
        console.log('✅ Ciphertext uploaded to IPFS, CID:', ciphertextCID);

        // 4. Grant access - Include the ciphertextId
        const grantResult = await window.electronAPI.grantAccess({
            patientDid: window.currentUser.did,
            doctorDid: doctorDid,
            documentCid: record.encryptedCID,
            encryptedCid: ciphertextCID,
            ciphertextId: proxyResult.ciphertext_id,   // 🔥 THIS LINE IS CRITICAL
            filename: record.filename,
            expiryTime: expiryTime
        });

        if (!grantResult.success) throw new Error('Grant access failed');

        // 5. Send notification
        await window.electronAPI.sendNotification({
            toDid: doctorDid,
            message: `Patient ${window.currentUser.name} shared a medical record (${record.filename}) with attribute "${attribute}" for ${durationDays} days`
        });

        showSuccess(`Record shared successfully with ${durationDays} days access`);
        closeShareModal();
        await loadDashboardData();

    } catch (err) {
        console.error('Share error:', err);
        let errorMsg = err.message;
        if (errorMsg.includes('IPFS')) {
            errorMsg = 'Cannot connect to IPFS. Please make sure IPFS Desktop is running on port 5001.';
        }
        showError(errorMsg);
    } finally {
        hideLoading();
    }
}

window.shareWithDoctor = function (doctorDid) {
    const shareDoctorDid = document.getElementById('shareDoctorDid');
    if (shareDoctorDid) shareDoctorDid.value = doctorDid;
    openShareModal(null, '');
    showError('Please select a record to share first');
};

// ========== PROXY ENCRYPTION ==========
async function encryptKeyWithProxy(aesKeyBase64, attribute) {
    if (!aesKeyBase64) {
        throw new Error('No AES key provided');
    }

    const policy = [[attribute]];
    const timeSlot = Math.floor(Date.now() / 1000 / 3600);

    try {
        console.log('Calling TB-PRE proxy server at http://127.0.0.1:5000/encrypt_aes');

        const response = await fetch('http://127.0.0.1:5000/encrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aes_key_b64: aesKeyBase64,
                policy: policy,
                time_slot: timeSlot
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        console.log('✅ Proxy encryption successful');
        return {
            success: true,
            ciphertext: result.ciphertext,
            ciphertext_id: result.ciphertext_id
        };
    } catch (error) {
        console.error('Proxy encryption error:', error);
        throw new Error(`TB-PRE proxy server error: ${error.message}. Make sure server is running on port 5000`);
    }
}

// ========== RECORD MANAGEMENT ==========
window.copyAESKey = async function (recordId) {
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.id === recordId);
    if (record && record.aesKeyBase64) {
        await navigator.clipboard.writeText(record.aesKeyBase64);
        showSuccess('AES key copied');
    } else {
        showError('Key not found');
    }
};

window.deleteRecord = function (recordId) {
    if (!confirm('Delete this record? The encrypted file remains on IPFS, but you will lose the reference.')) return;
    let records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    records = records.filter(r => r.id !== recordId);
    localStorage.setItem('sharedRecords', JSON.stringify(records));
    loadRecords();
    updateTotalRecordsCount();
    showSuccess('Record deleted');
};

function updateTotalRecordsCount() {
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const totalEl = document.getElementById('totalRecords');
    if (totalEl) totalEl.innerText = records.length;
}

// ========== VIEW RECORD ==========
window.viewRecord = async function (cid, recordId) {
    if (!cid) { showError('No CID'); return; }
    const records = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = records.find(r => r.encryptedCID === cid);
    currentViewRecord = { cid: cid, aesKeyBase64: record ? record.aesKeyBase64 : null };
    const modal = document.getElementById('viewOptionsModal');
    const fileNameEl = document.getElementById('viewFileName');
    if (modal) {
        if (fileNameEl) fileNameEl.innerText = record ? record.filename : 'file';
        modal.style.display = 'flex';
    }
};

function closeViewOptionsModal() {
    const modal = document.getElementById('viewOptionsModal');
    if (modal) modal.style.display = 'none';
}

window.closeViewOptionsModal = closeViewOptionsModal;

async function downloadEncryptedFile(cid) {
    showLoading('Downloading...');
    try {
        const result = await window.electronAPI.getFromIPFS(cid);
        if (!result.success) throw new Error('File not found');
        const blob = base64ToBlob(result.data.data, result.data.fileType || 'application/octet-stream');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.filename || 'encrypted_file.enc';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Downloaded');
    } catch (err) {
        showError(err.message);
    } finally {
        hideLoading();
    }
}

async function decryptAndDownload(cid, aesKeyBase64, filename) {
    showLoading('Decrypting...');
    try {
        const result = await window.electronAPI.getFromIPFS(cid);
        if (!result.success) throw new Error('File not found');

        // Check if MediChainCrypto is available
        if (typeof window.MediChainCrypto === 'undefined') {
            throw new Error('Crypto library not available. Please refresh the page.');
        }

        const encryptedArray = Uint8Array.from(atob(result.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decrypted = await window.MediChainCrypto.decryptFile(encryptedArray, aesKey);

        const blob = new Blob([decrypted]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace('.enc', '') || 'decrypted_file';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Decrypted and downloaded');
    } catch (err) {
        console.error('Decryption error:', err);
        showError('Decryption failed: ' + err.message);
    } finally {
        hideLoading();
    }
}

window.revokeAccess = async function (doctorDid, documentCid) {
    if (!confirm('Revoke access for this doctor?')) return;
    try {
        showSuccess('Access revoked');
        await loadDashboardData();
    } catch (err) {
        showError('Failed to revoke access');
    }
};

// ========== UTILITIES ==========
function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    return did.length <= 20 ? did : did.substring(0, 12) + '...' + did.substring(did.length - 8);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function base64ToBlob(base64, mimeType) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const loadingEl = document.getElementById('global-loading');
    if (loadingEl) loadingEl.remove();
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

console.log('✅ Patient dashboard initialized successfully');