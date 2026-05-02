// health-dept.js - Complete Health Department Dashboard
console.log('Health Department dashboard initializing...');

let currentUser = null;
let allDoctors = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await refreshAllData();
    attachEventListeners();
    setupNavigation();
    updateSystemStatus();
});

// ========== NAVIGATION ==========
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('pageTitle');
    const userNameHeader = document.getElementById('userNameHeader');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            pages.forEach(page => page.classList.remove('active'));
            if (pageName === 'dashboard') {
                document.getElementById('dashboardPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Dashboard';
                if (userNameHeader && currentUser) userNameHeader.innerText = currentUser.name;
                refreshAllData();
            } else if (pageName === 'doctors') {
                document.getElementById('doctorsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Manage Doctors';
                loadDoctors();
            } else if (pageName === 'witnesses') {
                document.getElementById('witnessesPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Witness Log';
                loadDoctorsTable();
            } else if (pageName === 'settings') {
                document.getElementById('settingsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Settings';
                updateSystemStatus();
            }
        });
    });
}

async function refreshAllData() {
    console.log('🔄 Refreshing all data...');
    try {
        await loadStats();
        await loadDoctors();
        await loadDoctorsTable();
        await updateSystemStatus();
    } catch (error) { console.error('Refresh error:', error); }
}

function attachEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const issueWitnessBtn = document.getElementById('issueWitnessBtn');
    const doctorDidInput = document.getElementById('doctorDid');
    const searchInput = document.getElementById('searchDoctors');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('refreshing');
            await refreshAllData();
            showSuccess('Dashboard refreshed');
            setTimeout(() => refreshBtn.classList.remove('refreshing'), 500);
        });
    }
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (issueWitnessBtn) issueWitnessBtn.addEventListener('click', issueWitness);
    if (doctorDidInput) doctorDidInput.addEventListener('input', previewDoctor);
    if (searchInput) searchInput.addEventListener('input', filterDoctors);
}

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'health') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;
    document.getElementById('userName').textContent = session.name || 'Health Department';
    document.getElementById('userDid').textContent = shortenDid(session.did);
    document.getElementById('userNameHeader').textContent = session.name || 'Health Department';
    return true;
}

async function updateSystemStatus() {
    try {
        const test = await window.electronAPI.accumulatorGetCurrent();
        const blockchainStatus = document.getElementById('blockchainStatus');
        if (blockchainStatus) {
            blockchainStatus.textContent = test?.success ? 'Connected' : 'Error';
            blockchainStatus.className = `status-badge ${test?.success ? 'success' : 'error'}`;
            if (test?.success) {
                const config = await window.electronAPI.storeGet('contracts.json');
                if (config) document.getElementById('blockchainNetwork').textContent = config.network || 'localhost';
                document.getElementById('blockNumber').textContent = test.blockNumber;
            }
        }
        const ipfs = await window.electronAPI.checkIPFS();
        const ipfsStatus = document.getElementById('ipfsStatus');
        if (ipfsStatus) {
            ipfsStatus.textContent = ipfs.success ? 'Connected' : 'Disconnected';
            ipfsStatus.className = `status-badge ${ipfs.success ? 'success' : 'error'}`;
        }
        const config = await window.electronAPI.storeGet('contracts.json');
        const contractAddr = document.getElementById('contractAddress');
        if (contractAddr && config?.Accumulator) contractAddr.textContent = config.Accumulator.substring(0, 20) + '...';
    } catch (error) { console.error('Status update error:', error); }
}

async function syncAccumulator() {
    try {
        if (typeof window.electronAPI.accumulatorGetCurrent !== 'function') return false;
        const result = await window.electronAPI.accumulatorGetCurrent();
        return result?.success || false;
    } catch { return false; }
}

// ========== LOAD DOCTORS ==========
async function loadDoctors() {
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        const doctors = [];
        for (const [did, user] of Object.entries(users)) {
            if (user.type === 'doctor') {
                let isActive = false;
                let isRevoked = revoked.some(r => r.did === did || r === did);
                if (!isRevoked) {
                    try { isActive = await window.electronAPI.isDoctorActive(did); } catch (e) { }
                }
                doctors.push({ did, name: user.name, specialization: user.specialization || user.specialty || 'General Medicine', isActive: isActive && !isRevoked, isRevoked });
            }
        }
        allDoctors = doctors;
        displayDoctorsGrid(doctors);
        document.getElementById('doctorsBadge').textContent = doctors.length;
    } catch (err) { showError('Failed to load doctors'); }
}

function displayDoctorsGrid(doctors) {
    const container = document.getElementById('doctorsList');
    if (!container) return;
    if (doctors.length === 0) {
        container.innerHTML = `<div class="no-results"><i class="fas fa-user-slash"></i><p>No doctors found</p><small>Try adjusting your search criteria</small></div>`;
        return;
    }
    let html = '';
    for (const doc of doctors) {
        let statusClass = 'inactive', statusText = 'Inactive';
        if (doc.isRevoked) { statusClass = 'revoked'; statusText = 'Revoked'; }
        else if (doc.isActive) { statusClass = 'active'; statusText = 'Active'; }
        html += `
            <div class="doctor-card" data-did="${doc.did}">
                <div class="doctor-header"><div class="doctor-avatar"><i class="fas fa-user-md"></i></div><span class="status-badge ${statusClass}">${statusText}</span></div>
                <div class="doctor-info"><h4>${escapeHtml(doc.name)}</h4><p><i class="fas fa-stethoscope"></i> ${escapeHtml(doc.specialization)}</p><p><i class="fas fa-id-card"></i> <span class="doctor-did">${shortenDid(doc.did)}</span></p></div>
                <div class="doctor-actions">
                    <button class="btn-icon view-btn" onclick="viewDoctorDetails('${doc.did}')"><i class="fas fa-eye"></i> View</button>
                    ${doc.isRevoked ?
                `<button class="btn-icon activate-btn" onclick="reactivateDoctor('${doc.did}')"><i class="fas fa-certificate"></i> Activate</button>` :
                (doc.isActive ?
                    `<button class="btn-icon danger revoke-btn" onclick="revokeDoctor('${doc.did}')"><i class="fas fa-ban"></i> Revoke</button>` :
                    `<button class="btn-icon activate-btn" onclick="issueWitnessForDoctor('${doc.did}')"><i class="fas fa-certificate"></i> Activate</button>`)
            }
                </div>
            </div>`;
    }
    container.innerHTML = html;
}

async function loadDoctorsTable() {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        let html = '';
        for (const [did, user] of Object.entries(users)) {
            if (user.type === 'doctor') {
                let witnessHash = null, isActive = false, issuedAt = null;
                let isRevoked = revoked.some(r => r.did === did || r === did);
                if (!isRevoked) {
                    try {
                        const w = await window.electronAPI.getDoctorWitness(did);
                        witnessHash = w.witnessHash;
                        isActive = await window.electronAPI.isDoctorActive(did);
                        issuedAt = w.expiryTime;
                    } catch (e) { }
                }
                let statusClass = 'inactive', statusText = 'Inactive';
                if (isRevoked) { statusClass = 'revoked'; statusText = 'Revoked'; }
                else if (isActive) { statusClass = 'active'; statusText = 'Active'; }
                const issuedDate = issuedAt ? new Date(issuedAt * 1000).toLocaleDateString() : 'N/A';
                const issuedTime = issuedAt ? new Date(issuedAt * 1000).toLocaleTimeString() : '';
                html += `<tr><td>${escapeHtml(user.name)}</td><td class="did-cell">${shortenDid(did)}</td><td>${escapeHtml(user.specialization || 'General Medicine')}</td><td><span class="status-badge ${statusClass}">${statusText}</span></td><td><code>${witnessHash ? witnessHash.substring(0, 20) + '...' : 'None'}</code></td><td>${issuedDate}<br><small>${issuedTime}</small></td><td>${!isRevoked ? (isActive ? `<button class="btn-icon revoke-btn" onclick="revokeDoctor('${did}')"><i class="fas fa-ban"></i> Revoke</button>` : `<button class="btn-icon activate-btn" onclick="issueWitnessForDoctor('${did}')"><i class="fas fa-certificate"></i> Activate</button>`) : `<button class="btn-icon activate-btn" onclick="reactivateDoctor('${did}')"><i class="fas fa-certificate"></i> Reactivate</button>`}</td></tr>`;
            }
        }
        tbody.innerHTML = html || '<tr><td colspan="7" class="no-data">No doctors found</td></tr>';
    } catch (err) { tbody.innerHTML = '<tr><td colspan="7" class="no-data">Error loading data</td></tr>'; }
}

function filterDoctors() {
    const term = document.getElementById('searchDoctors')?.value.toLowerCase().trim();
    const searchCount = document.getElementById('searchCount');
    if (!term) {
        displayDoctorsGrid(allDoctors);
        if (searchCount) searchCount.textContent = `${allDoctors.length} doctor${allDoctors.length !== 1 ? 's' : ''}`;
        return;
    }
    const filtered = allDoctors.filter(d => d.name.toLowerCase().includes(term) || d.did.toLowerCase().includes(term) || (d.specialization && d.specialization.toLowerCase().includes(term)));
    displayDoctorsGrid(filtered);
    if (searchCount) searchCount.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;
}
window.clearSearch = function () {
    const input = document.getElementById('searchDoctors');
    if (input) { input.value = ''; filterDoctors(); input.focus(); }
};

async function loadStats() {
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        let total = 0, active = 0;
        for (const [did, user] of Object.entries(users)) {
            if (user.type === 'doctor') {
                total++;
                const isRevoked = revoked.some(r => r.did === did || r === did);
                if (!isRevoked) {
                    try { if (await window.electronAPI.isDoctorActive(did)) active++; } catch (e) { }
                }
            }
        }
        document.getElementById('totalDoctors').textContent = total;
        document.getElementById('activeDoctors').textContent = active;
        document.getElementById('revokedDoctors').textContent = revoked.length;
        document.getElementById('witnessCount').textContent = active;
    } catch (e) { console.error(e); }
}

async function previewDoctor() {
    const did = document.getElementById('doctorDid').value.trim();
    const preview = document.getElementById('doctorPreview');
    if (!did) { if (preview) preview.style.display = 'none'; return; }
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') {
        if (preview) { preview.innerHTML = '<p class="error">Doctor not found.</p>'; preview.style.display = 'block'; }
        return;
    }
    if (preview) {
        preview.innerHTML = `<div class="preview-content"><i class="fas fa-user-md"></i><div><strong>${escapeHtml(doctor.name)}</strong><span>${escapeHtml(doctor.specialization || 'General Medicine')}</span><small>${shortenDid(did)}</small></div></div>`;
        preview.style.display = 'block';
    }
}

async function issueWitness() {
    const did = document.getElementById('doctorDid').value.trim();
    if (!did) { showError('Please enter a doctor DID'); return; }
    try {
        const test = await window.electronAPI.accumulatorGetCurrent();
        if (!test?.success) { showError('Accumulator contract not configured'); return; }
    } catch (e) { showError('Cannot connect to blockchain'); return; }
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') { showError('Doctor not found'); return; }
    const expiryTime = Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 3600);
    const witnessHash = 'wit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    showLoading(`Issuing witness for ${doctor.name}...`);
    try {
        const result = await window.electronAPI.issueWitness({ did, witnessHash, expiryTime });
        if (result?.success) {
            showSuccess(`✅ Witness issued for ${doctor.name}`);
            document.getElementById('doctorDid').value = '';
            const preview = document.getElementById('doctorPreview');
            if (preview) preview.style.display = 'none';
            // Remove from revoked list if present
            const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
            const updated = revoked.filter(r => (r.did !== did && r !== did));
            await window.electronAPI.storeSet('revokedDoctors', updated);
            await refreshAllData();
        } else throw new Error(result?.error);
    } catch (err) { showError(err.message); }
    finally { hideLoading(); }
}

window.issueWitnessForDoctor = async function (did) {
    document.getElementById('doctorDid').value = did;
    await previewDoctor();
    document.getElementById('issueWitnessBtn')?.click();
};

window.reactivateDoctor = async function (did) {
    const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
    const updated = revoked.filter(r => (r.did !== did && r !== did));
    await window.electronAPI.storeSet('revokedDoctors', updated);
    await issueWitnessForDoctor(did);
};

window.revokeDoctor = async function (did) {
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!confirm(`⚠️ Revoke ${doctor?.name || 'this doctor'}? They will lose access.`)) return;
    showLoading(`Revoking ${doctor?.name}...`);
    try {
        const result = await window.electronAPI.revokeDoctor({ did });
        if (result?.success) {
            const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
            if (!revoked.some(r => r.did === did || r === did)) {
                revoked.push({ did, revokedAt: Date.now(), name: doctor?.name });
                await window.electronAPI.storeSet('revokedDoctors', revoked);
            }
            showSuccess(`✅ ${doctor?.name} revoked`);
            await refreshAllData();
        } else throw new Error(result?.error);
    } catch (err) { showError(err.message); }
    finally { hideLoading(); }
};

// ========== DOCTOR DETAILS MODAL (WORKING) ==========
window.viewDoctorDetails = async function (did) {
    showLoading('Loading doctor details...');
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        const doctor = users[did];
        if (!doctor || doctor.type !== 'doctor') { showError('Doctor not found'); return; }
        let isRevoked = revoked.some(r => r.did === did || r === did);
        let witnessHash = null, isActive = false, expiryTime = null, issuedAt = null;
        if (!isRevoked) {
            try {
                const w = await window.electronAPI.getDoctorWitness(did);
                witnessHash = w.witnessHash;
                isActive = await window.electronAPI.isDoctorActive(did);
                expiryTime = w.expiryTime;
                issuedAt = w.issuedAt;
            } catch (e) { }
        }
        const accesses = await window.electronAPI.storeGet('accessGrants') || [];
        const doctorAccesses = accesses.filter(a => a.doctorDid === did);
        const activeAccesses = doctorAccesses.filter(a => a.isActive && a.expiryTime > Date.now() / 1000);
        const statusText = isRevoked ? 'REVOKED' : (isActive ? 'ACTIVE' : 'INACTIVE');
        const statusClass = isRevoked ? 'revoked' : (isActive ? 'active' : 'inactive');
        const modalHtml = `
            <div class="detail-section"><div class="detail-section-title">📋 Basic Information</div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Full Name:</div><div class="doctor-detail-value"><strong>${escapeHtml(doctor.name)}</strong></div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">DID:</div><div class="doctor-detail-value"><code style="font-size:11px;word-break:break-all;">${did}</code></div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Registered:</div><div class="doctor-detail-value">${doctor.createdAt ? new Date(doctor.createdAt).toLocaleString() : 'N/A'}</div></div></div>
            <div class="detail-section"><div class="detail-section-title">🎓 Professional Information</div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Specialization:</div><div class="doctor-detail-value">${escapeHtml(doctor.specialization || 'General Medicine')}</div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">License:</div><div class="doctor-detail-value">${doctor.license || 'N/A'}</div></div></div>
            <div class="detail-section"><div class="detail-section-title">🔐 Witness & Status</div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Status:</div><div class="doctor-detail-value"><span class="status-badge ${statusClass}">${statusText}</span></div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Witness Hash:</div><div class="doctor-detail-value"><code>${witnessHash || 'None'}</code></div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Issued:</div><div class="doctor-detail-value">${issuedAt ? new Date(issuedAt * 1000).toLocaleString() : 'N/A'}</div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Expires:</div><div class="doctor-detail-value">${expiryTime ? new Date(expiryTime * 1000).toLocaleString() : 'No expiry'}</div></div></div>
            <div class="detail-section"><div class="detail-section-title">🔄 Authorizations</div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Total:</div><div class="doctor-detail-value">${doctorAccesses.length}</div></div>
            <div class="doctor-detail-row"><div class="doctor-detail-label">Active:</div><div class="doctor-detail-value">${activeAccesses.length}</div></div></div>
        `;
        const modal = document.getElementById('doctorDetailsModal');
        const content = document.getElementById('doctorDetailsContent');
        if (modal && content) {
            content.innerHTML = modalHtml;
            modal.style.display = 'flex';
        } else {
            alert(`Doctor: ${doctor.name}\nStatus: ${statusText}\nSpecialization: ${doctor.specialization}\nWitness: ${witnessHash || 'None'}`);
        }
    } catch (err) { showError('Failed to load details'); }
    finally { hideLoading(); }
};

function closeDoctorDetailsModal() {
    const modal = document.getElementById('doctorDetailsModal');
    if (modal) modal.style.display = 'none';
}
window.closeDoctorDetailsModal = closeDoctorDetailsModal;

// ========== TEST & SETTINGS ==========
window.testConnection = async function () {
    showLoading('Testing connections...');
    try {
        const blockchain = await window.electronAPI.accumulatorGetCurrent();
        const ipfs = await window.electronAPI.checkIPFS();
        if (blockchain?.success && ipfs.success) showSuccess('All systems connected!');
        else showError('Connection failed');
        await refreshAllData();
    } catch (err) { showError('Test failed'); }
    finally { hideLoading(); }
};
window.testIPFS = async function () {
    showLoading('Testing IPFS...');
    try {
        const ipfs = await window.electronAPI.checkIPFS();
        if (ipfs.success) showSuccess('IPFS connected');
        else showError('IPFS connection failed');
    } catch (err) { showError('IPFS test failed'); }
    finally { hideLoading(); }
};
window.viewContract = async function () {
    const config = await window.electronAPI.storeGet('contracts.json');
    if (config?.Accumulator) {
        const addr = config.Accumulator;
        if (config.network === 'sepolia') window.open(`https://sepolia.etherscan.io/address/${addr}`, '_blank');
        else if (config.network === 'mumbai') window.open(`https://mumbai.polygonscan.com/address/${addr}`, '_blank');
        else showToast(`Contract: ${addr}`, 'info');
    } else showError('Contract address not found');
};
window.confirmReset = function () {
    if (confirm('Clear all local cached data? This will refresh the page.')) {
        localStorage.clear(); sessionStorage.clear();
        showSuccess('Cache cleared. Refreshing...');
        setTimeout(() => location.reload(), 1500);
    }
};
window.copyContractAddress = async function () {
    const config = await window.electronAPI.storeGet('contracts.json');
    if (config?.Accumulator) { navigator.clipboard.writeText(config.Accumulator); showSuccess('Address copied'); }
    else showError('No address');
};

async function handleLogout(e) {
    if (e) e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// ========== UTILITIES ==========
function shortenDid(did) {
    if (!did) return '';
    return did.length <= 20 ? did : did.substring(0, 14) + '...' + did.substring(did.length - 10);
}
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'health-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() { document.getElementById('health-loading')?.remove(); }
function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

console.log('✅ Health Department dashboard ready');