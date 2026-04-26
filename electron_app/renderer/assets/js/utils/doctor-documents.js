// doctor-documents.js
let currentUser = null;
let ipfsManager = null;
let proxyManager = null;
let contractManager = null;
let allAccesses = [];

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await checkSession();

        ipfsManager = new IPFSManager();
        proxyManager = new ProxyManager();
        contractManager = new ContractManager();

        await loadDocuments();

        document.getElementById('refreshBtn')?.addEventListener('click', loadDocuments);
        document.getElementById('applyFilterBtn')?.addEventListener('click', filterDocuments);
        document.getElementById('searchInput')?.addEventListener('keyup', filterDocuments);
        document.getElementById('statusFilter')?.addEventListener('change', filterDocuments);
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    } catch (error) {
        console.error('Error initializing:', error);
        showError('Failed to initialize');
    }
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

async function loadDocuments() {
    showLoading();
    try {
        const accesses = await window.electronAPI.storeGet('doctorAccesses:' + currentUser.did) || [];
        allAccesses = accesses.filter(a => a && a.isActive !== false);
        displayDocuments(allAccesses);
    } catch (error) {
        console.error('Error loading documents:', error);
        showError('Failed to load documents');
    } finally {
        hideLoading();
    }
}

function displayDocuments(accesses) {
    const grid = document.getElementById('documentsGrid');
    if (!grid) return;
    if (accesses.length === 0) {
        grid.innerHTML = '<p class="no-data">No documents found.</p>';
        return;
    }

    let html = '';
    const now = Date.now() / 1000;
    for (let i = 0; i < accesses.length; i++) {
        const acc = accesses[i];
        const isActive = acc.expiryTime && now < acc.expiryTime;
        const statusClass = isActive ? 'active' : 'expired';
        const statusText = isActive ? 'Active' : 'Expired';
        html += `
            <div class="document-card ${statusClass}" data-status="${statusClass}">
                <div class="card-header">
                    <h3>${escapeHtml(acc.documentName || 'Unnamed')}</h3>
                    <span class="status-badge status-${statusClass}">${statusText}</span>
                </div>
                <div class="card-body">
                    <p><strong>Patient:</strong> ${escapeHtml(acc.patientName || 'Unknown')}</p>
                    <p><strong>Granted:</strong> ${acc.grantedAtISO ? new Date(acc.grantedAtISO).toLocaleDateString() : 'N/A'}</p>
                    <p><strong>Expires:</strong> ${acc.expiryTime ? new Date(acc.expiryTime * 1000).toLocaleDateString() : 'N/A'}</p>
                    <p class="cid">CID: ${shortenDid(acc.encryptedCid || '')}</p>
                </div>
                <div class="card-footer">
                    <button class="btn-primary" onclick="accessDocument('${acc.encryptedCid}')" ${!isActive ? 'disabled' : ''}>
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
            </div>
        `;
    }
    grid.innerHTML = html;
}

function filterDocuments() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const now = Date.now() / 1000;

    const filtered = allAccesses.filter(acc => {
        const matchesSearch = (acc.documentName?.toLowerCase().includes(searchTerm) ||
                              acc.patientName?.toLowerCase().includes(searchTerm));
        const isActive = acc.expiryTime && now < acc.expiryTime;
        const matchesStatus = (statusFilter === 'all') ||
                              (statusFilter === 'active' && isActive) ||
                              (statusFilter === 'expired' && !isActive);
        return matchesSearch && matchesStatus;
    });
    displayDocuments(filtered);
}

// ------------------------------------------------------------------
// Accès et déchiffrement d'un document partagé (TB‑PRE)
// ------------------------------------------------------------------
window.accessDocument = async function(encryptedCid) {
    if (!encryptedCid) {
        showError('No document selected');
        return;
    }
    showLoading('Decrypting record...');
    try {
        // 1. Récupérer le ciphertext ré‑encrypté depuis IPFS
        const fileResult = await ipfsManager.getFile(encryptedCid);
        if (!fileResult.success) throw new Error('Failed to fetch ciphertext');
        const reencrypted = JSON.parse(fileResult.data.data);

        // 2. Récupérer le CID original depuis le mapping local (stocké par le patient lors du partage)
        const mapping = await window.electronAPI.storeGet('cidMapping') || {};
        const originalCid = mapping[encryptedCid];
        if (!originalCid) throw new Error('Original CID not found');

        // 3. Déchiffrer via TB‑PRE (le serveur crypto intégré)
        const decryptResult = await window.electronAPI.cryptoDecrypt({
            doctorDid: currentUser.did,
            reencrypted: reencrypted,
            originalCid: originalCid
        });
        if (!decryptResult.success) throw new Error(decryptResult.error);
        const decryptedCid = decryptResult.originalCid; // normalement identique à originalCid

        // 4. Récupérer le fichier JSON EHR depuis IPFS
        const ehrResult = await ipfsManager.getFile(decryptedCid);
        if (!ehrResult.success) throw new Error('Failed to fetch EHR');
        const ehr = JSON.parse(ehrResult.data.data);
        displayEHR(ehr);
    } catch (err) {
        console.error('Access error:', err);
        showError(err.message);
    } finally {
        hideLoading();
    }
};

function displayEHR(ehr) {
    const preview = document.getElementById('documentPreview');
    if (!preview) return;
    preview.innerHTML = `<pre>${JSON.stringify(ehr, null, 2)}</pre>`;
    document.getElementById('accessModal').style.display = 'flex';
}

// Fonction utilitaire pour récupérer le CID original depuis le mapping
async function getOriginalCidFromMapping(encryptedCid) {
    const mapping = await window.electronAPI.storeGet('cidMapping') || {};
    return mapping[encryptedCid];
}

// ------------------------------------------------------------------
window.closeAccessModal = function() {
    document.getElementById('accessModal').style.display = 'none';
    document.getElementById('documentPreview').innerHTML = '<p>Loading document...</p>';
};

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// Utilitaires
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