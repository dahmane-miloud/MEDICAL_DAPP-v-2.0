// health-dept.js
let currentUser = null;
let allDoctors = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadDoctors();
    await loadStats();

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadDoctors();
        loadStats();
    });
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('issueWitnessBtn')?.addEventListener('click', issueWitness);
    document.getElementById('doctorDid')?.addEventListener('input', previewDoctor);
});

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'health') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;

    const userNameEl = document.getElementById('userName');
    const userDidEl = document.getElementById('userDid');
    if (userNameEl) userNameEl.textContent = session.name || 'Health Department';
    if (userDidEl) userDidEl.textContent = shortenDid(session.did);

    return true;
}

async function loadDoctors() {
    showLoading();
    try {
        const users = await window.electronAPI.storeGet('users') || {};
        const doctors = [];
        for (const did in users) {
            if (users[did].type === 'doctor') {
                const doctor = users[did];
                let witnessHash = null, witnessExpiry = null, isActive = false;
                try {
                    // Use the correct method names
                    const witness = await window.electronAPI.getDoctorWitness(did);
                    witnessHash = witness.witnessHash;
                    witnessExpiry = witness.expiryTime;
                    isActive = await window.electronAPI.isDoctorActive(did);
                    console.log(`✅ Loaded doctor ${doctor.name}: active=${isActive}, witness=${witnessHash?.substring(0, 20)}...`);
                } catch (err) {
                    console.log(`Doctor ${did} not yet on blockchain:`, err.message);
                }
                doctors.push({
                    did,
                    name: doctor.name,
                    specialization: doctor.specialization,
                    witnessHash,
                    witnessExpiry,
                    isActive
                });
            }
        }
        allDoctors = doctors;
        displayDoctors(doctors);
        // Update witness count
        const witnessCount = doctors.filter(d => d.witnessHash).length;
        document.getElementById('witnessCount').textContent = witnessCount;
    } catch (err) {
        console.error(err);
        showError('Failed to load doctors');
    } finally {
        hideLoading();
    }
}

function displayDoctors(doctors) {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;

    if (doctors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No doctors found</td></tr>';
        return;
    }

    let html = '';
    for (const doc of doctors) {
        const statusClass = doc.isActive ? 'status-active' : 'status-revoked';
        const statusText = doc.isActive ? 'Active' : 'Revoked';
        const witnessInfo = doc.witnessHash ? doc.witnessHash.substring(0, 20) + '...' : 'None';
        const expiryDate = doc.witnessExpiry ? new Date(doc.witnessExpiry * 1000).toLocaleDateString() : 'N/A';

        html += `
            <tr>
                <td>${escapeHtml(doc.name)}</td>
                <td class="did-cell">${shortenDid(doc.did)}</td>
                <td>${escapeHtml(doc.specialization)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${witnessInfo}</td>
                <td>${expiryDate}</td>
                <td class="action-buttons">
                    <button class="btn-icon" onclick="revokeDoctor('${doc.did}')" title="Revoke"><i class="fas fa-ban"></i></button>
                </td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

async function loadStats() {
    try {
        const stats = await window.electronAPI.getHealthStats();
        if (stats.success) {
            document.getElementById('totalDoctors').textContent = stats.stats.totalDoctors;
            document.getElementById('activeDoctors').textContent = stats.stats.activeDoctors;
            document.getElementById('revokedDoctors').textContent = stats.stats.revokedDoctors;
        }
    } catch (err) {
        console.error(err);
    }
}

async function previewDoctor() {
    const did = document.getElementById('doctorDid').value.trim();
    const previewDiv = document.getElementById('doctorPreview');
    if (!did) {
        previewDiv.style.display = 'none';
        return;
    }
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') {
        previewDiv.innerHTML = '<p class="error">Doctor not found in local database.</p>';
        previewDiv.style.display = 'block';
        return;
    }
    previewDiv.innerHTML = `
        <p><strong>Name:</strong> ${escapeHtml(doctor.name)}</p>
        <p><strong>Specialization:</strong> ${escapeHtml(doctor.specialization)}</p>
        <p><strong>License:</strong> ${escapeHtml(doctor.license)}</p>
    `;
    previewDiv.style.display = 'block';
}

async function issueWitness() {
    const did = document.getElementById('doctorDid').value.trim();
    if (!did) {
        showError('Please enter a doctor DID');
        return;
    }
    const users = await window.electronAPI.storeGet('users') || {};
    const doctor = users[did];
    if (!doctor || doctor.type !== 'doctor') {
        showError('Doctor not found in local database');
        return;
    }

    const days = parseInt(document.getElementById('witnessDays').value);
    const expiryTime = Math.floor(Date.now() / 1000) + days * 24 * 3600;
    const witnessHash = 'wit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);

    showLoading('Issuing witness on blockchain...');
    try {
        const result = await window.electronAPI.issueWitness({
            did,
            witnessHash,
            expiryTime
        });
        if (result.success) {
            showSuccess('Witness issued successfully! Refreshing data...');
            document.getElementById('doctorDid').value = '';
            document.getElementById('doctorPreview').style.display = 'none';
            // Wait 2 seconds for blockchain to index, then reload
            setTimeout(async () => {
                await loadDoctors();
                await loadStats();
                showSuccess('Dashboard updated with witness data');
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error(err);
        showError(err.message || 'Failed to issue witness');
    } finally {
        hideLoading();
    }
}

// ================== for revoke a doctor ========================
// Make revokeDoctor globally available for onclick
window.revokeDoctor = async function (did) {
    if (!confirm('Are you sure you want to revoke this doctor?')) return;
    showLoading('Revoking...');
    try {
        const result = await window.electronAPI.revokeDoctor({ did });
        console.log('Revoke result:', result);
        if (result.success) {
            showSuccess('Doctor revoked');
            await loadDoctors();
            await loadStats();
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (err) {
        console.error('Revocation error details:', err);
        // Display the actual error message
        let message = err.message || 'Failed to revoke doctor';
        if (message.includes('Doctor not found')) {
            message = 'Cannot revoke: Doctor has no witness or is not registered. Issue a witness first.';
        } else if (message.includes('Only health department')) {
            message = 'Unauthorized: You are not logged in as Health Department.';
        } else if (message.includes('Already revoked')) {
            message = 'Doctor is already revoked.';
        } else if (message.includes('No handler registered')) {
            message = 'Internal error: revocation handler not registered. Restart the app.';
        }
        showError(message);
    } finally {
        hideLoading();
    }
};


//---------------------------------------

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// ========== Utilities ==========
function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    if (did.length <= 20) return did;
    return did.substring(0, 12) + '...' + did.substring(did.length - 8);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'health-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${message || 'Loading...'}</p>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('health-loading');
    if (overlay) overlay.remove();
}

function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

function showToast(message, type) {
    const existing = document.querySelectorAll('.toast');
    if (existing.length > 3) existing[0].remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}