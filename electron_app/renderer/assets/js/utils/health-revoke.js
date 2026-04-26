// health-revoke.js
let currentUser = null;
let contractManager = null;

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await checkSession();
        contractManager = new ContractManager();

        document.getElementById('revokeForm').addEventListener('submit', handleRevoke);
        document.getElementById('refreshBtn').addEventListener('click', loadRevokedList);
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);

        await loadRevokedList();
    } catch (error) {
        console.error('Error initializing revoke page:', error);
        showError('Failed to initialize');
    }
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

async function handleRevoke(e) {
    e.preventDefault();
    const doctorDid = document.getElementById('doctorDid').value.trim();
    if (!doctorDid) {
        showError('Please enter a doctor DID');
        return;
    }

    if (!confirm(`Are you sure you want to revoke doctor ${doctorDid}?`)) return;

    showLoading();
    try {
        const result = await contractManager.revokeDoctor(doctorDid);
        if (result && result.success) {
            showSuccess('Doctor revoked successfully');
            document.getElementById('revokeForm').reset();
            await loadRevokedList();
        } else {
            throw new Error(result?.error || 'Revocation failed');
        }
    } catch (error) {
        console.error('Revoke error:', error);
        showError(error.message || 'Failed to revoke doctor');
    } finally {
        hideLoading();
    }
}

async function loadRevokedList() {
    try {
        const revoked = await window.electronAPI.storeGet('revokedDoctors') || [];
        const users = await window.electronAPI.storeGet('users') || {};
        displayRevokedList(revoked, users);
    } catch (error) {
        console.error('Error loading revoked list:', error);
    }
}

function displayRevokedList(revoked, users) {
    const tbody = document.getElementById('revokedTableBody');
    if (!tbody) return;

    if (revoked.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">No revoked doctors found</td></tr>';
        return;
    }

    // Sort by most recent first
    revoked.sort((a, b) => new Date(b.revokedAt) - new Date(a.revokedAt));

    let html = '';
    for (let i = 0; i < revoked.length; i++) {
        const r = revoked[i];
        const doctor = users[r.did] || { name: 'Unknown' };
        const revokedAt = r.revokedAt ? new Date(r.revokedAt).toLocaleString() : 'N/A';
        const revokedBy = r.revokedBy ? shortenDid(r.revokedBy) : 'N/A';

        html += `
            <tr>
                <td>${shortenDid(r.did)}</td>
                <td>${escapeHtml(doctor.name)}</td>
                <td>${revokedAt}</td>
                <td>${revokedBy}</td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// Utilities (reused from other files)
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

function showLoading() {
    hideLoading();
    var overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'health-loading';
    overlay.innerHTML = '<div class="spinner"></div><p>Processing...</p>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    var overlay = document.getElementById('health-loading');
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