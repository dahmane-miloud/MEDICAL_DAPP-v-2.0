let currentUser = null;
let contractManager = null;
let proxyManager = null;

document.addEventListener('DOMContentLoaded', async function() {
    await checkSession();
    contractManager = new ContractManager();
    await loadDoctors();

    document.getElementById('refreshBtn')?.addEventListener('click', loadDoctors);
    document.getElementById('searchInput')?.addEventListener('keyup', filterDoctors);
    document.getElementById('statusFilter')?.addEventListener('change', filterDoctors);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('closeModal')?.addEventListener('click', closeRegisterModal);
    document.getElementById('cancelRegister')?.addEventListener('click', closeRegisterModal);
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', registerDoctor);
});

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'health') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;
    document.getElementById('userName').textContent = session.name || 'Health Department';
    document.getElementById('userDid').textContent = shortenDid(session.did);
    return true;
}

let allDoctors = [];
let revokedSet = new Set();

async function loadDoctors() {
    showLoading();
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        revokedSet.clear();
        revoked.forEach(r => revokedSet.add(r.did));
        allDoctors = [];
        for (const did in users) {
            if (users[did].type === 'doctor') {
                allDoctors.push({ did, ...users[did], isRevoked: revokedSet.has(did) });
            }
        }
        displayDoctors(allDoctors);
    } catch (err) { showError('Failed to load doctors'); } finally { hideLoading(); }
}

function displayDoctors(doctors) {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;
    if (doctors.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="no-data">No doctors found</td></tr>'; return; }
    let html = '';
    for (let doc of doctors) {
        const statusClass = doc.isRevoked ? 'status-revoked' : 'status-active';
        const statusText = doc.isRevoked ? 'Revoked' : 'Active';
        html += `
            <tr>
                <td>${shortenDid(doc.did)}</td>
                <td>${escapeHtml(doc.name)}</td>
                <td>${escapeHtml(doc.license)}</td>
                <td>${escapeHtml(doc.specialization)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'N/A'}</td>
                <td>${!doc.isRevoked ? `<button class="btn-danger" onclick="revokeDoctor('${doc.did}')">Revoke</button>` : 'Revoked'}</td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function filterDoctors() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
    const filtered = allDoctors.filter(doc => {
        const matchesSearch = (doc.name?.toLowerCase().includes(searchTerm) ||
                              doc.did?.toLowerCase().includes(searchTerm) ||
                              doc.license?.toLowerCase().includes(searchTerm));
        const matchesStatus = (statusFilter === 'all') ||
                              (statusFilter === 'active' && !doc.isRevoked) ||
                              (statusFilter === 'revoked' && doc.isRevoked);
        return matchesSearch && matchesStatus;
    });
    displayDoctors(filtered);
}

function openRegisterModal() { document.getElementById('registerModal').style.display = 'flex'; }
function closeRegisterModal() { document.getElementById('registerModal').style.display = 'none'; document.getElementById('registerForm').reset(); }

// electron_app/renderer/assets/js/health-doctors.js
// (extrait des fonctions modifiées)

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    contractManager = new ContractManager();
    proxyManager = new ProxyManager();
    await proxyManager.setup();
    await loadDoctors();
    // ... écouteurs
});

async function registerDoctor(e) {
    e.preventDefault();
    const name = document.getElementById('doctorName').value.trim();
    const license = document.getElementById('licenseNumber').value.trim();
    const specialization = document.getElementById('specialization').value;

    showLoading('Inscription médecin...');
    try {
        // 1. Création locale (DID, clés)
        const signupResult = await window.electronAPI.signup({
            name, type: 'doctor', license, specialization
        });
        if (!signupResult.success) throw new Error(signupResult.error);
        const newUser = signupResult.user;

        // 2. Enregistrement sur la blockchain
        const regResult = await contractManager.registerDoctor(
            newUser.did, newUser.publicKey, newUser.name, license, specialization
        );
        if (!regResult.success) throw new Error(regResult.error);

        // 3. Enregistrement sur le serveur TB‑PRE
        const proxyReg = await proxyManager.registerUser(newUser.did, [specialization]);
        if (!proxyReg.user_id) throw new Error('TB‑PRE registration failed');

        // 4. Attribution de l’attribut avec une validité temporelle (1 an)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const timeRange = {
            year: expiryDate.getFullYear().toString(),
            month: (expiryDate.getMonth() + 1).toString(),
            day: expiryDate.getDate().toString()
        };
        const attrResult = await proxyManager.assignAttribute(newUser.did, specialization, timeRange);
        if (!attrResult.status) throw new Error('Attribute assignment failed');

        showSuccess('Médecin inscrit avec succès');
        closeRegisterModal();
        await loadDoctors();
    } catch (err) {
        showError(err.message);
    } finally {
        hideLoading();
    }
}
window.revokeDoctor = async function(did) {
    if (!confirm('Revoke this doctor?')) return;
    showLoading();
    try {
        const result = await contractManager.revokeDoctor(did);
        if (result.success) showSuccess('Doctor revoked');
        else throw new Error(result.error);
        await loadDoctors();
    } catch (err) { showError(err.message); } finally { hideLoading(); }
};

window.showRegisterDoctor = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;

async function handleLogout(e) { e.preventDefault(); await window.electronAPI.logout(); window.location.href = '../login.html'; }

function shortenDid(did) { if (!did) return ''; if (did.length <= 20) return did; return did.substring(0,10)+'...'+did.substring(did.length-10); }
function escapeHtml(text) { if (!text) return ''; var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function showLoading(m) { hideLoading(); var overlay = document.createElement('div'); overlay.className='loading-overlay'; overlay.id='health-loading'; overlay.innerHTML=`<div class="spinner"></div><p>${m||'Loading...'}</p>`; document.body.appendChild(overlay); }
function hideLoading() { var overlay = document.getElementById('health-loading'); if(overlay) overlay.remove(); }
function showError(m) { showToast(m,'error'); }
function showSuccess(m) { showToast(m,'success'); }
function showToast(m,t) { /* same as before */ }