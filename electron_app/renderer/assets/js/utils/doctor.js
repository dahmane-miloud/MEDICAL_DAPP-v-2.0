// doctor.js - Complete Doctor Dashboard (FIXED)

console.log('Doctor dashboard initializing...');

window.currentUser = null;
let currentDecryptRecord = { cid: null, encryptedCid: null };

document.addEventListener('DOMContentLoaded', async () => {
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        console.error('MediChainCrypto not loaded!');
        showError('Crypto library not available. Please refresh the page.');
        return;
    }

    await checkSession();
    await loadDashboardData();
    attachEventListeners();
    setupNavigation();
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'doctor') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;

        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserDid = document.getElementById('sidebarUserDid');

        if (sidebarUserName) sidebarUserName.innerText = session.name || 'Doctor';
        if (sidebarUserDid) sidebarUserDid.innerText = shortenDid(session.did);

        // Register doctor with ALL possible attributes
        try {
            await fetch('http://127.0.0.1:5000/register_doctor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_did: session.did,
                    attributes: ["doctor", "cardiologist", "neurologist", "pediatrician", "surgeon", "dermatologist", "ophthalmologist", "psychiatrist"]
                })
            });
            console.log("✅ Doctor registered with Proxy memory");
        } catch (e) {
            console.error("❌ Failed to connect to Python Proxy:", e);
        }

        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });

            const pageTitle = document.getElementById('pageTitle');

            if (pageName === 'dashboard') {
                document.getElementById('dashboardPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Dashboard';
                loadDashboardStats();
            } else if (pageName === 'shared') {
                document.getElementById('sharedPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Shared Records';
                loadSharedRecords();
            } else if (pageName === 'requests') {
                document.getElementById('requestsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Access Requests';
                loadAccessRequests();
            } else if (pageName === 'authorizations') {
                document.getElementById('authorizationsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Authorizations';
                loadAuthorizations();
            }
        });
    });
}

function attachEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const sendAccessRequestBtn = document.getElementById('sendAccessRequestBtn');
    const decryptRecordBtn = document.getElementById('decryptRecordBtn');
    const cancelDecryptBtn = document.getElementById('cancelDecryptBtn');
    const closeDecryptModalBtn = document.getElementById('closeDecryptModalBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardData();
            showSuccess('Dashboard refreshed');
        });
    }

    if (sendAccessRequestBtn) {
        sendAccessRequestBtn.addEventListener('click', () => {
            sendAccessRequest();
        });
    }

    if (decryptRecordBtn) {
        decryptRecordBtn.addEventListener('click', () => {
            decryptAndOpenRecord();
        });
    }

    if (cancelDecryptBtn) {
        cancelDecryptBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    if (closeDecryptModalBtn) {
        closeDecryptModalBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('decryptModal');
        if (e.target === modal) closeDecryptModal();
    });
}

async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        await loadSharedRecords();
        await loadDashboardStats();
        await loadAccessRequests();
    } catch (err) {
        console.error('Load dashboard error:', err);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

async function loadDashboardStats() {
    try {
        const records = JSON.parse(localStorage.getItem('sharedWithMe') || '[]');
        const now = Date.now() / 1000;
        const activeAccesses = records.filter(r => r.isActive && Number(r.expiryTime) > now).length;
        const uniquePatients = new Set(records.map(r => r.patientDid)).size;
        const expiringSoon = records.filter(r => {
            const exp = Number(r.expiryTime);
            return exp > now && (exp - now) < 7 * 24 * 3600;
        }).length;

        const totalRecordsEl = document.getElementById('totalRecords');
        const activeAccessesEl = document.getElementById('activeAccesses');
        const totalPatientsEl = document.getElementById('totalPatients');
        const expiringSoonEl = document.getElementById('expiringSoon');
        const sharedBadge = document.getElementById('sharedBadge');

        if (totalRecordsEl) totalRecordsEl.innerText = records.length;
        if (activeAccessesEl) activeAccessesEl.innerText = activeAccesses;
        if (totalPatientsEl) totalPatientsEl.innerText = uniquePatients;
        if (expiringSoonEl) expiringSoonEl.innerText = expiringSoon;
        if (sharedBadge) sharedBadge.innerText = records.length;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function sendAccessRequest() {
    const patientDid = document.getElementById('requestPatientDid')?.value.trim();
    const message = document.getElementById('requestMessageText')?.value.trim();

    if (!patientDid) {
        showError('Please enter Patient DID');
        return;
    }

    showLoading('Sending access request...');
    try {
        const result = await window.electronAPI.sendNotification({
            toDid: patientDid,
            message: message || `Dr. ${window.currentUser.name} requests access to your medical records`,
            doctorName: window.currentUser.name,
            doctorDid: window.currentUser.did,
            type: 'access_request',
            timestamp: new Date().toISOString()
        });

        if (result.success) {
            showSuccess('Access request sent successfully!');
            const patientDidInput = document.getElementById('requestPatientDid');
            const messageText = document.getElementById('requestMessageText');
            if (patientDidInput) patientDidInput.value = '';
            if (messageText) messageText.value = '';
        } else {
            throw new Error(result.error || 'Failed to send request');
        }
    } catch (err) {
        console.error('Send request error:', err);
        showError('Failed to send request: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== LOAD SHARED RECORDS ==========
async function loadSharedRecords() {
    const container = document.getElementById('sharedRecordsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        console.log('Doctor accesses:', result);

        const accesses = result.success ? (result.accesses || []) : [];

        localStorage.setItem('sharedWithMe', JSON.stringify(accesses));

        if (accesses.length === 0) {
            container.innerHTML = '<div class="no-data">No records shared with you yet.</div>';
            return;
        }

        let html = '';
        for (const access of accesses) {
            const expiryTimeSec = Number(access.expiryTime);
            const expiryDate = new Date(expiryTimeSec * 1000);
            const isExpired = expiryDate < new Date();
            const daysLeft = Math.ceil((expiryTimeSec * 1000 - Date.now()) / (1000 * 3600 * 24));

            html += `
                <div class="record-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                        <span class="record-status ${isExpired ? 'status-expired' : 'status-active'}">
                            ${isExpired ? 'Expired' : 'Active'}
                        </span>
                    </div>
                    <div class="record-info">
                        <h4>${escapeHtml(access.filename || 'Medical Record')}</h4>
                        <p><i class="fas fa-user"></i> Patient: ${shortenDid(access.patientDid)}</p>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        ${!isExpired ? `<p><i class="fas fa-clock"></i> ${daysLeft} days left</p>` : ''}
                    </div>
                    <div class="record-actions" style="display: flex; gap: 0.5rem;">
                        <button class="btn-primary" onclick="window.previewRecord('${access.documentCid}', '${access.encryptedCid}')" style="flex: 1;">
                            <i class="fas fa-eye"></i> Preview
                        </button>
                        <button class="btn-primary" onclick="window.openDecryptModal('${access.documentCid}', '${access.encryptedCid}')" style="flex: 1;">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        const sharedBadge = document.getElementById('sharedBadge');
        if (sharedBadge) sharedBadge.innerText = accesses.length;
        await loadDashboardStats();
    } catch (err) {
        console.error('Error loading shared records:', err);
        container.innerHTML = '<div class="no-data">Error loading records: ' + err.message + '</div>';
    }
}

// ========== LOAD ACCESS REQUESTS ==========
async function loadAccessRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;

    try {
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? (notifs.notifications || []).filter(n => n.type === 'access_request') : [];

        const requestBadge = document.getElementById('requestBadge');
        if (requestBadge) requestBadge.innerText = requests.length;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-data">No pending access requests</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < requests.length; i++) {
            const req = requests[i];
            html += `
                <div class="request-card">
                    <div class="request-info">
                        <h4><i class="fas fa-user"></i> From: ${escapeHtml(req.doctorName || 'Patient')}</h4>
                        <p><i class="fas fa-id-card"></i> DID: ${shortenDid(req.doctorDid || '')}</p>
                        <p><i class="fas fa-envelope"></i> ${escapeHtml(req.message)}</p>
                        <small><i class="fas fa-clock"></i> ${new Date(req.timestamp).toLocaleString()}</small>
                    </div>
                    <div class="request-actions">
                        <button class="btn-success" onclick="window.acceptRequest(${i})">
                            <i class="fas fa-check"></i> Accept
                        </button>
                        <button class="btn-danger" onclick="window.declineRequest(${i})">
                            <i class="fas fa-times"></i> Decline
                        </button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load requests error:', err);
        container.innerHTML = '<div class="no-data">Error loading requests: ' + err.message + '</div>';
    }
}

// ========== LOAD AUTHORIZATIONS ==========
async function loadAuthorizations() {
    const container = document.getElementById('authorizationsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? (result.accesses || []) : [];
        const now = Date.now() / 1000;
        const activeAccesses = accesses.filter(a => a.isActive && Number(a.expiryTime) > now);

        if (activeAccesses.length === 0) {
            container.innerHTML = '<div class="no-data">No active authorizations</div>';
            return;
        }

        let html = '';
        for (const auth of activeAccesses) {
            const expiryDate = new Date(Number(auth.expiryTime) * 1000);
            html += `
                <div class="auth-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-key"></i></div>
                        <span class="record-status status-active">Active</span>
                    </div>
                    <div class="record-info">
                        <h4>Patient: ${shortenDid(auth.patientDid)}</h4>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        <p><i class="fas fa-file"></i> Record CID: ${shortenDid(auth.documentCid)}</p>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load authorizations error:', err);
        container.innerHTML = '<div class="no-data">Error loading authorizations</div>';
    }
}

// ========== RESPOND TO REQUESTS ==========
window.acceptRequest = async function (requestId) {
    showLoading('Accepting request...');
    try {
        showSuccess('Request accepted!');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to accept request');
    } finally {
        hideLoading();
    }
};

window.declineRequest = async function (requestId) {
    showLoading('Declining request...');
    try {
        showSuccess('Request declined');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to decline request');
    } finally {
        hideLoading();
    }
};

// ========== DECRYPT MODAL ==========
window.openDecryptModal = function (documentCid, encryptedCid) {
    currentDecryptRecord = {
        cid: documentCid,
        encryptedCid: encryptedCid
    };
    const modal = document.getElementById('decryptModal');
    const decryptCid = document.getElementById('decryptCid');

    if (decryptCid) decryptCid.innerText = shortenDid(documentCid);
    if (modal) modal.style.display = 'flex';
};

function closeDecryptModal() {
    const modal = document.getElementById('decryptModal');
    if (modal) modal.style.display = 'none';
    currentDecryptRecord = { cid: null, encryptedCid: null };
}

window.closeDecryptModal = closeDecryptModal;

// ========== PREVIEW RECORD ==========
window.previewRecord = async function (documentCid, encryptedCid) {
    if (!documentCid || !encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing preview...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) {
            throw new Error('Access record not found');
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        // Generate rekey
        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        // Proxy re-encrypt
        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        // Decrypt
        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        // Get encrypted file from IPFS
        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        // Decrypt the file
        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        // Display preview
        const blob = new Blob([decryptedData]);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';
        const fileName = encryptedResult.data.filename?.replace('.enc', '') || 'medical_record';

        showPreview(blob, fileType, fileName, documentCid, encryptedCid);

    } catch (err) {
        console.error('Preview error:', err);
        showError('Failed to preview record: ' + err.message);
    } finally {
        hideLoading();
    }
};

// Show preview modal
function showPreview(blob, fileType, fileName, documentCid, encryptedCid) {
    const url = URL.createObjectURL(blob);
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const previewTitle = document.getElementById('previewTitle');

    const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');
    const closePreviewFooterBtn = document.getElementById('closePreviewFooterBtn');
    const downloadFromPreviewBtn = document.getElementById('downloadFromPreviewBtn');

    if (closePreviewModalBtn) {
        closePreviewModalBtn.addEventListener('click', closePreviewModal);
    }
    if (closePreviewFooterBtn) {
        closePreviewFooterBtn.addEventListener('click', closePreviewModal);
    }
    if (downloadFromPreviewBtn) {
        downloadFromPreviewBtn.addEventListener('click', () => {
            const previewModal = document.getElementById('previewModal');
            if (previewModal && previewModal.dataset.documentCid) {
                downloadDecryptedRecord(previewModal.dataset.documentCid, previewModal.dataset.encryptedCid);
            }
        });
    }

    if (!previewModal) {
        console.error('Preview modal not found in HTML');
        return;
    }

    previewTitle.innerText = `Preview: ${fileName}`;
    previewContent.innerHTML = '';

    if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
        img.style.objectFit = 'contain';
        previewContent.appendChild(img);
    }
    else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '70vh';
        iframe.style.border = 'none';
        previewContent.appendChild(iframe);
    }
    else if (fileType.includes('text') || fileName.match(/\.(txt|json|xml|html|css|js)$/i)) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const pre = document.createElement('pre');
            pre.textContent = e.target.result;
            pre.style.maxHeight = '60vh';
            pre.style.overflow = 'auto';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordWrap = 'break-word';
            pre.style.background = '#f5f5f5';
            pre.style.padding = '1rem';
            pre.style.borderRadius = '8px';
            previewContent.appendChild(pre);
        };
        reader.readAsText(blob);
    }
    else {
        previewContent.innerHTML = `
            <div class="preview-info">
                <i class="fas fa-file" style="font-size: 4rem; color: #1a5276;"></i>
                <h3>${escapeHtml(fileName)}</h3>
                <p>File Type: ${fileType}</p>
                <p>File Size: ${formatFileSize(blob.size)}</p>
                <p>This file type cannot be previewed directly.</p>
                <button class="btn-primary" onclick="downloadDecryptedRecord('${documentCid}', '${encryptedCid}')">
                    <i class="fas fa-download"></i> Download File
                </button>
            </div>
        `;
    }

    previewModal.dataset.blobUrl = url;
    previewModal.dataset.documentCid = documentCid;
    previewModal.dataset.encryptedCid = encryptedCid;
    previewModal.style.display = 'flex';
}

// Close preview modal
function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        if (modal.dataset.blobUrl) {
            URL.revokeObjectURL(modal.dataset.blobUrl);
        }
        modal.style.display = 'none';
        const previewContent = document.getElementById('previewContent');
        if (previewContent) previewContent.innerHTML = '';
    }
}

// Download decrypted file from preview
async function downloadDecryptedRecord(documentCid, encryptedCid) {
    showLoading('Preparing download...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) throw new Error('Access record not found');
        if (!accessRecord.ciphertextId) throw new Error('Ciphertext ID not found');

        const ciphertextId = accessRecord.ciphertextId;

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });
        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });
        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });
        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
        a.click();
        URL.revokeObjectURL(url);

        showSuccess('File downloaded successfully!');
        closePreviewModal();

    } catch (err) {
        console.error('Download error:', err);
        showError('Failed to download: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== DECRYPT AND OPEN RECORD ==========
async function decryptAndOpenRecord() {
    if (!currentDecryptRecord.cid || !currentDecryptRecord.encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing decryption...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === currentDecryptRecord.cid);

        if (!accessRecord) {
            throw new Error('Access record not found for CID: ' + currentDecryptRecord.cid);
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) {
            throw new Error('Failed to generate rekey');
        }

        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;
        console.log('✅ Rekey generated:', rekeyId);

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) {
            throw new Error('Failed to proxy re-encrypt');
        }

        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;
        console.log('✅ Proxy re-encrypted:', transformedId);

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) {
            const errorData = await decryptResponse.text();
            console.error('Server side error details:', errorData);
            throw new Error(`Decryption failed with status ${decryptResponse.status}`);
        }

        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;
        console.log('✅ Decryption successful');

        const encryptedResult = await window.electronAPI.getFromIPFS(currentDecryptRecord.cid);
        if (!encryptedResult.success) {
            throw new Error('Failed to download encrypted record');
        }

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';

        if (fileType.includes('text') || fileType.includes('json') || fileType.includes('pdf')) {
            window.open(url, '_blank');
            showSuccess('Record decrypted and opened');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
            a.click();
            URL.revokeObjectURL(url);
            showSuccess('Record decrypted and downloaded');
        }

        closeDecryptModal();

    } catch (err) {
        console.error('Decryption error:', err);
        showError('Failed to decrypt record: ' + err.message);
    } finally {
        hideLoading();
    }
}

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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    const el = document.getElementById('global-loading');
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

// Make functions global for HTML
window.closePreviewModal = closePreviewModal;
window.downloadDecryptedRecord = downloadDecryptedRecord;

console.log('✅ Doctor dashboard initialized successfully');