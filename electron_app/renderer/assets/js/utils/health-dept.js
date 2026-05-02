// health-dept.js - Modern Health Department Dashboard (No Validity Period)
console.log('Health Department dashboard initializing...');

let currentUser = null;
let allDoctors = [];

// No validity period - witnesses are valid indefinitely until revoked

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await syncAccumulator();
    await loadDoctors();
    await loadStats();
    attachEventListeners();
    setupNavigation();
    updateSystemStatus();
});

function attachEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const issueWitnessBtn = document.getElementById('issueWitnessBtn');
    const doctorDidInput = document.getElementById('doctorDid');
    const searchInput = document.getElementById('searchDoctors');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDoctors();
            loadStats();
            syncAccumulator();
            showSuccess('Dashboard refreshed');
        });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (issueWitnessBtn) issueWitnessBtn.addEventListener('click', issueWitness);
    if (doctorDidInput) doctorDidInput.addEventListener('input', previewDoctor);
    if (searchInput) searchInput.addEventListener('input', filterDoctors);
}

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
            }
        });
    });
}

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'health') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;

    const userNameEl = document.getElementById('userName');
    const userDidEl = document.getElementById('userDid');
    const userNameHeader = document.getElementById('userNameHeader');

    if (userNameEl) userNameEl.textContent = session.name || 'Health Department';
    if (userDidEl) userDidEl.textContent = shortenDid(session.did);
    if (userNameHeader) userNameHeader.textContent = session.name || 'Health Department';

    return true;
}

async function updateSystemStatus() {
    try {
        const blockchainStatus = document.getElementById('blockchainStatus');
        const ipfsStatus = document.getElementById('ipfsStatus');
        const contractAddress = document.getElementById('contractAddress');

        if (blockchainStatus) {
            try {
                const test = await window.electronAPI.accumulatorGetCurrent();
                blockchainStatus.textContent = test?.success ? 'Connected' : 'Error';
                blockchainStatus.className = `status-badge ${test?.success ? 'success' : 'error'}`;
            } catch {
                blockchainStatus.textContent = 'Disconnected';
                blockchainStatus.className = 'status-badge error';
            }
        }

        if (ipfsStatus) {
            const ipfsCheck = await window.electronAPI.checkIPFS();
            ipfsStatus.textContent = ipfsCheck.success ? 'Connected' : 'Disconnected';
            ipfsStatus.className = `status-badge ${ipfsCheck.success ? 'success' : 'error'}`;
        }

        if (contractAddress) {
            const config = await window.electronAPI.storeGet('contracts.json');
            if (config && config.Accumulator) {
                contractAddress.textContent = config.Accumulator.substring(0, 20) + '...';
            }
        }
    } catch (error) {
        console.error('Status update error:', error);
    }
}

async function syncAccumulator() {
    try {
        if (typeof window.electronAPI.accumulatorGetCurrent !== 'function') {
            console.log('accumulatorGetCurrent not available yet');
            return false;
        }

        const result = await window.electronAPI.accumulatorGetCurrent();
        if (result && result.success) {
            console.log('✅ Accumulator synced at block:', result.blockNumber);
            const accumulatorValueEl = document.getElementById('accumulatorValue');
            const activeWitnessesEl = document.getElementById('activeWitnesses');
            const lastSyncBlockEl = document.getElementById('lastSyncBlock');

            if (accumulatorValueEl) accumulatorValueEl.innerText = result.accumulator.substring(0, 30) + '...';
            if (activeWitnessesEl) activeWitnessesEl.innerText = result.activeCount;
            if (lastSyncBlockEl) lastSyncBlockEl.innerText = result.blockNumber;
            return true;
        }
    } catch (error) {
        console.error('Sync error:', error);
    }
    return false;
}

async function loadDoctors() {
    showLoading('Loading doctors...');
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const doctors = [];

        for (const [did, user] of Object.entries(users)) {
            if (user.type === 'doctor') {
                let isActive = false;
                try {
                    isActive = await window.electronAPI.isDoctorActive(did);
                } catch (err) {
                    // Doctor not on blockchain yet
                }
                doctors.push({
                    did,
                    name: user.name,
                    specialization: user.specialization || 'General Medicine',
                    isActive
                });
            }
        }
        allDoctors = doctors;
        displayDoctorsGrid(doctors);

        const doctorsBadge = document.getElementById('doctorsBadge');
        if (doctorsBadge) doctorsBadge.textContent = doctors.length;

    } catch (err) {
        console.error(err);
        showError('Failed to load doctors');
    } finally {
        hideLoading();
    }
}

function displayDoctorsGrid(doctors) {
    const container = document.getElementById('doctorsList');
    if (!container) return;

    if (doctors.length === 0) {
        container.innerHTML = '<div class="no-data">No doctors registered</div>';
        return;
    }

    let html = '';
    for (const doc of doctors) {
        const statusClass = doc.isActive ? 'active' : 'revoked';
        const statusText = doc.isActive ? 'Active' : 'Inactive';

        html += `
            <div class="doctor-card" data-did="${doc.did}">
                <div class="doctor-header">
                    <div class="doctor-avatar">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="doctor-info">
                    <h4>${escapeHtml(doc.name)}</h4>
                    <p><i class="fas fa-stethoscope"></i> ${escapeHtml(doc.specialization)}</p>
                    <p class="doctor-did"><i class="fas fa-id-card"></i> ${shortenDid(doc.did)}</p>
                </div>
                <div class="doctor-actions">
                    <button class="btn-icon" onclick="viewDoctorDetails('${doc.did}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${doc.isActive ?
                `<button class="btn-icon danger" onclick="revokeDoctor('${doc.did}')">
                            <i class="fas fa-ban"></i> Revoke
                        </button>` :
                `<button class="btn-icon" onclick="issueWitnessForDoctor('${doc.did}')">
                            <i class="fas fa-certificate"></i> Activate
                        </button>`
            }
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadDoctorsTable() {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;

    try {
        const users = await window.electronAPI.storeGet('users') || {};
        let html = '';

        for (const [did, user] of Object.entries(users)) {
            if (user.type === 'doctor') {
                let witnessHash = null, isActive = false, issuedAt = null;
                try {
                    const witness = await window.electronAPI.getDoctorWitness(did);
                    witnessHash = witness.witnessHash;
                    isActive = await window.electronAPI.isDoctorActive(did);
                    issuedAt = witness.issuedAt;
                } catch (err) {
                    // Not on blockchain
                }

                const statusClass = isActive ? 'active' : 'revoked';
                const statusText = isActive ? 'Active' : 'Revoked';
                const issuedDate = issuedAt ? new Date(issuedAt * 1000).toLocaleDateString() : 'N/A';

                html += `
                    <tr>
                        <td>${escapeHtml(user.name)}</td>
                        <td class="did-cell">${shortenDid(did)}</td>
                        <td>${escapeHtml(user.specialization || 'General Medicine')}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td><code>${witnessHash ? witnessHash.substring(0, 20) + '...' : 'None'}</code></td>
                        <td>${issuedDate}</td>
                        <td>
                            <button class="btn-icon" onclick="revokeDoctor('${did}')" title="Revoke">
                                <i class="fas fa-ban"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }
        }

        tbody.innerHTML = html || '<tr><td colspan="7" class="no-data">No doctors found</td></tr>';
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">Error loading data</td></tr>';
    }
}

function filterDoctors() {
    const searchTerm = document.getElementById('searchDoctors')?.value.toLowerCase();
    if (!searchTerm) {
        displayDoctorsGrid(allDoctors);
        return;
    }

    const filtered = allDoctors.filter(doc =>
        doc.name.toLowerCase().includes(searchTerm) ||
        doc.did.toLowerCase().includes(searchTerm)
    );
    displayDoctorsGrid(filtered);
}

async function loadStats() {
    try {
        const stats = await window.electronAPI.getHealthStats();
        if (stats && stats.success) {
            const totalDoctorsEl = document.getElementById('totalDoctors');
            const activeDoctorsEl = document.getElementById('activeDoctors');
            const revokedDoctorsEl = document.getElementById('revokedDoctors');
            const witnessCountEl = document.getElementById('witnessCount');

            if (totalDoctorsEl) totalDoctorsEl.textContent = stats.stats.totalDoctors;
            if (activeDoctorsEl) activeDoctorsEl.textContent = stats.stats.activeDoctors;
            if (revokedDoctorsEl) revokedDoctorsEl.textContent = stats.stats.revokedDoctors;
            if (witnessCountEl && stats.stats.activeDoctors) witnessCountEl.textContent = stats.stats.activeDoctors;
        }
    } catch (err) {
        console.error(err);
    }
}

async function previewDoctor() {
    const did = document.getElementById('doctorDid').value.trim();
    const previewDiv = document.getElementById('doctorPreview');
    if (!did) {
        if (previewDiv) previewDiv.style.display = 'none';
        return;
    }

    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') {
        if (previewDiv) {
            previewDiv.innerHTML = '<p class="error"><i class="fas fa-exclamation-circle"></i> Doctor not found in local database.</p>';
            previewDiv.style.display = 'block';
        }
        return;
    }

    if (previewDiv) {
        previewDiv.innerHTML = `
            <div class="preview-content">
                <i class="fas fa-user-md"></i>
                <div>
                    <strong>${escapeHtml(doctor.name)}</strong>
                    <span>${escapeHtml(doctor.specialization || 'General Medicine')}</span>
                    <small>${shortenDid(did)}</small>
                </div>
            </div>
        `;
        previewDiv.style.display = 'block';
    }
}

async function issueWitness() {
    const did = document.getElementById('doctorDid').value.trim();
    if (!did) {
        showError('Please enter a doctor DID');
        return;
    }

    try {
        const testAcc = await window.electronAPI.accumulatorGetCurrent();
        if (!testAcc || !testAcc.success) {
            showError('Accumulator contract not configured. Please check contract deployment.');
            return;
        }
    } catch (err) {
        showError('Cannot connect to blockchain. Make sure Hardhat node is running.');
        return;
    }

    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') {
        showError('Doctor not found in local database');
        return;
    }

    // No validity period - using a very long expiry (100 years)
    // This effectively means no expiry (witness valid until revoked)
    const expiryTime = Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 3600);
    const witnessHash = 'wit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);

    showLoading(`Issuing witness for ${doctor.name}...`);
    try {
        const result = await window.electronAPI.issueWitness({
            did: did,
            witnessHash: witnessHash,
            expiryTime: expiryTime
        });

        if (result && result.success) {
            showSuccess(`✅ Witness issued successfully for ${doctor.name}`);
            document.getElementById('doctorDid').value = '';
            const previewDiv = document.getElementById('doctorPreview');
            if (previewDiv) previewDiv.style.display = 'none';

            setTimeout(async () => {
                await syncAccumulator();
                await loadDoctors();
                await loadStats();
                await loadDoctorsTable();
                showSuccess('Dashboard updated with witness data');
            }, 2000);
        } else {
            throw new Error(result?.error || 'Failed to issue witness');
        }
    } catch (err) {
        console.error(err);
        showError(err.message || 'Failed to issue witness');
    } finally {
        hideLoading();
    }
}

window.issueWitnessForDoctor = async function (did) {
    const doctorDidInput = document.getElementById('doctorDid');
    if (doctorDidInput) doctorDidInput.value = did;
    await previewDoctor();
    document.getElementById('issueWitnessBtn')?.click();
};

window.viewDoctorDetails = async function (did) {
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (doctor) {
        showToast(`
            Name: ${doctor.name}
            Specialization: ${doctor.specialization || 'General Medicine'}
            DID: ${shortenDid(did)}
        `, 'info');
    }
};

window.revokeDoctor = async function (did) {
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!confirm(`Are you sure you want to revoke ${doctor?.name || 'this doctor'}?`)) return;

    showLoading(`Revoking ${doctor?.name || 'doctor'}...`);
    try {
        const result = await window.electronAPI.revokeDoctor({ did });
        if (result && result.success) {
            showSuccess(`✅ ${doctor?.name || 'Doctor'} revoked successfully`);
            await syncAccumulator();
            await loadDoctors();
            await loadStats();
            await loadDoctorsTable();
        } else {
            throw new Error(result?.error || 'Unknown error');
        }
    } catch (err) {
        console.error('Revocation error:', err);
        showError(err.message || 'Failed to revoke doctor');
    } finally {
        hideLoading();
    }
};

window.testConnection = async function () {
    showLoading('Testing connections...');
    try {
        const blockchain = await window.electronAPI.accumulatorGetCurrent();
        const ipfs = await window.electronAPI.checkIPFS();

        console.log('Blockchain:', blockchain);
        console.log('IPFS:', ipfs);

        if (blockchain?.success && ipfs?.success) {
            showSuccess('All systems connected!');
        } else if (!blockchain?.success) {
            showError('Blockchain connection failed');
        } else if (!ipfs?.success) {
            showError('IPFS connection failed');
        }
        await updateSystemStatus();
    } catch (err) {
        showError('Connection test failed: ' + err.message);
    } finally {
        hideLoading();
    }
};

window.copyAccumulator = function () {
    const value = document.getElementById('accumulatorValue')?.innerText;
    if (value) {
        navigator.clipboard.writeText(value);
        showSuccess('Accumulator hash copied');
    }
};

window.copyContractAddress = async function () {
    const config = await window.electronAPI.storeGet('contracts.json');
    if (config && config.Accumulator) {
        navigator.clipboard.writeText(config.Accumulator);
        showSuccess('Contract address copied');
    }
};

async function handleLogout(e) {
    if (e) e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// ========== Utilities ==========
function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    if (did.length <= 20) return did;
    return did.substring(0, 14) + '...' + did.substring(did.length - 10);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message = 'Loading...') {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'health-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(message)}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('health-loading');
    if (overlay) overlay.remove();
}

function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || (() => {
        const div = document.createElement('div');
        div.id = 'toastContainer';
        div.className = 'toast-container';
        document.body.appendChild(div);
        return div;
    })();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon} ${type}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

console.log('✅ Health Department dashboard initialized successfully');