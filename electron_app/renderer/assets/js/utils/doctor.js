// doctor.js
let currentUser = null;
let ipfsManager = null;
let proxyManager = null;
let contractManager = null;

document.addEventListener('DOMContentLoaded', async function () {
    await checkSession();
    ipfsManager = new IPFSManager();
    proxyManager = new ProxyManager();
    contractManager = new ContractManager();

    await loadDashboardData();

    const requestForm = document.getElementById('requestForm');
    if (requestForm) requestForm.addEventListener('submit', handleRequest);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('refreshBtn')?.addEventListener('click', loadDashboardData);
});

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'doctor') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;
    document.getElementById('userName').textContent = session.name || 'Doctor';
    document.getElementById('userDid').textContent = shortenDid(session.did);
    return true;
}

// Send access request to patient
async function handleRequest(e) {
    e.preventDefault();
    const patientDid = document.getElementById('patientDid').value.trim();
    const attribute = document.getElementById('requestAttribute').value;
    if (!patientDid) {
        showError('Patient DID is required');
        return;
    }
    await window.electronAPI.sendNotification({
        toDid: patientDid,
        message: `Doctor ${currentUser.name} requests access to your records`,
        type: 'access_request',
        doctorDid: currentUser.did,
        doctorName: currentUser.name,
        attribute: attribute
    });
    showSuccess('Request sent.');
    document.getElementById('patientDid').value = '';
}

async function loadDashboardData() {
    showLoading();
    try {
        const stats = await loadStats();
        updateStats(stats);
        await loadRecentAccess();
    } catch (err) {
        console.error('Dashboard load error:', err);
        showError('Failed to load dashboard data');
    } finally {
        hideLoading();
    }
}

async function loadStats() {
    const accesses = await window.electronAPI.storeGet('doctorAccesses:' + currentUser.did) || [];
    const now = Date.now() / 1000;
    let totalPatients = new Set();
    let activeAccesses = 0, expiringSoon = 0;
    for (let a of accesses) {
        if (a.patientDid) totalPatients.add(a.patientDid);
        if (a.expiryTime && a.expiryTime > now) {
            activeAccesses++;
            if (a.expiryTime - now < 7 * 24 * 60 * 60) expiringSoon++;
        }
    }
    return {
        totalPatients: totalPatients.size,
        availableRecords: accesses.length,
        activeAccesses,
        expiringSoon
    };
}

function updateStats(stats) {
    const setText = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    };
    setText('totalPatients', stats.totalPatients);
    setText('availableRecords', stats.availableRecords);
    setText('activeAccesses', stats.activeAccesses);
    setText('expiringSoon', stats.expiringSoon);
}

async function loadRecentAccess() {
    const container = document.getElementById('recentAccess');
    if (!container) return;
    const accesses = await window.electronAPI.storeGet('doctorAccesses:' + currentUser.did) || [];
    const now = Date.now() / 1000;
    const active = accesses.filter(a => a && a.expiryTime && a.expiryTime > now);
    active.sort((a, b) => (a.expiryTime || 0) - (b.expiryTime || 0));
    if (active.length === 0) {
        container.innerHTML = '<p class="no-data">No active accesses</p>';
        return;
    }
    const users = await window.electronAPI.storeGet('users') || {};
    let html = '';
    for (let a of active.slice(0, 10)) {
        const patient = users[a.patientDid] || { name: 'Unknown' };
        const expiryDate = new Date(a.expiryTime * 1000).toLocaleDateString();
        html += `
            <div class="access-card">
                <h4>${escapeHtml(a.documentName || 'Medical Record')}</h4>
                <p><strong>Patient:</strong> ${escapeHtml(patient.name)}</p>
                <p><strong>Expires:</strong> ${expiryDate}</p>
                <button onclick="accessDocument('${a.encryptedCid}')">View</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

// This is the main function to access a shared record using the proxy manager
window.accessDocument = async function (encryptedCID, ciphertextCID, ciphertext_id) {
    showLoading('Retrieving record...');
    try {
        // 1. Fetch ciphertext from IPFS
        const ctResult = await window.electronAPI.getFromIPFS(ciphertextCID);
        if (!ctResult.success) throw new Error('Ciphertext not found');
        const ciphertext = JSON.parse(atob(ctResult.data.data));

        // 2. Re‑encrypt for current date
        const now = new Date();
        const currentDate = {
            year: now.getFullYear().toString(),
            month: (now.getMonth() + 1).toString(),
            day: now.getDate().toString()
        };
        const reencRes = await fetch('http://localhost:5000/reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ciphertext, current_date: currentDate })
        });
        const reencData = await reencRes.json();
        if (!reencData.success) throw new Error('Re‑encryption failed');

        // 3. Decrypt to get original AES key
        const decryptRes = await fetch('http://localhost:5000/decrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reencrypted_ciphertext: reencData.reencrypted_ciphertext,
                doctor_did: currentUser.did,
                ciphertext_id: ciphertext_id
            })
        });
        const decryptData = await decryptRes.json();
        if (!decryptData.success) throw new Error('Decryption failed');
        const aesKeyBase64 = decryptData.original_key_base64;

        // 4. Import AES key and decrypt file
        const rawKey = Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0));
        const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', true, ['decrypt']);

        const fileRes = await window.electronAPI.getFromIPFS(encryptedCID);
        if (!fileRes.success) throw new Error('Encrypted file not found');
        const encryptedData = Uint8Array.from(atob(fileRes.data.data), c => c.charCodeAt(0));
        const iv = encryptedData.slice(0, 12);
        const ciphertextData = encryptedData.slice(12);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            ciphertextData
        );
        const blob = new Blob([decrypted]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileRes.data.filename?.replace('.enc', '') || 'document';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Record decrypted and downloaded');
    } catch (err) {
        console.error(err);
        showError(err.message);
    } finally {
        hideLoading();
    }
};


//---------------- access requestr -------------------

// doctor.js
// Inside doctor.js, add this function
async function requestAccess() {
    const patientDid = document.getElementById('patientDid')?.value.trim();
    if (!patientDid) { showError('Enter patient DID'); return; }
    try {
        await window.electronAPI.sendNotification({
            toDid: patientDid,
            message: `Doctor ${currentUser.name} (${shortenDid(currentUser.did)}) requests access to your medical records. Please share via your dashboard.`,
            type: 'access_request'
        });
        showSuccess('Request sent to patient');
        document.getElementById('patientDid').value = '';
    } catch (err) {
        showError('Failed to send request');
    }
}
//--------------------------------------------------------

async function importAESKey(base64Key) {
    const raw = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['decrypt']);
}

window.closeAccessModal = function () {
    const modal = document.getElementById('accessModal');
    if (modal) modal.style.display = 'none';
    const preview = document.getElementById('documentPreview');
    if (preview) preview.innerHTML = 'Loading...';
};

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// ========== Utilities ==========
function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    if (did.length <= 20) return did;
    return did.substring(0, 10) + '...' + did.substring(did.length - 10);
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    hideLoading();
    var overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'doctor-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${message || 'Loading...'}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    var overlay = document.getElementById('doctor-loading');
    if (overlay) overlay.remove();
}

function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

function showToast(message, type) {
    var existing = document.querySelectorAll('.toast');
    if (existing.length > 3) existing[0].remove();
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    var icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = '<i class="fas fa-' + icon + '"></i><span>' + message + '</span>';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}