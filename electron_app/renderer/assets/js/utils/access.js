// access.js
let currentUser = null;
let allAccesses = [];

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await checkSession();
        await loadAccessHistory();
        document.getElementById('refreshBtn')?.addEventListener('click', loadAccessHistory);
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

async function loadAccessHistory() {
    showLoading();
    try {
        const accesses = await window.electronAPI.storeGet('doctorAccesses:' + currentUser.did) || [];
        allAccesses = accesses.filter(a => a); // keep all
        displayAccessTable(allAccesses);
    } catch (error) {
        console.error('Error loading access history:', error);
        showError('Failed to load history');
    } finally {
        hideLoading();
    }
}

function displayAccessTable(accesses) {
    const tbody = document.getElementById('accessTableBody');
    if (!tbody) return;
    if (accesses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No access history</td></tr>';
        return;
    }

    let html = '';
    const now = Date.now() / 1000;
    for (let i = 0; i < accesses.length; i++) {
        const a = accesses[i];
        const isActive = a.expiryTime && now < a.expiryTime;
        const statusClass = isActive ? 'active' : 'expired';
        const statusText = isActive ? 'Active' : 'Expired';
        const grantedDate = a.grantedAtISO ? new Date(a.grantedAtISO).toLocaleString() : 'N/A';
        const expiryDate = a.expiryTime ? new Date(a.expiryTime * 1000).toLocaleDateString() : 'N/A';

        html += `
            <tr>
                <td>${escapeHtml(a.patientName || 'Unknown')}</td>
                <td>${escapeHtml(a.documentName || 'Unnamed')}</td>
                <td>${grantedDate}</td>
                <td>${expiryDate}</td>
                <td><span class="status-badge status-${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn-icon" onclick="viewDocument('${a.encryptedCid}')" ${!isActive ? 'disabled' : ''}>
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

window.viewDocument = async function(encryptedCid) {
    // Reuse same logic as in documents page, maybe open the same modal
    // For simplicity, we can redirect to documents.html with the CID or open modal
    // We'll just redirect to documents.html and let the user find it? Or implement modal here.
    // To keep it simple, we'll open the same modal as in documents page.
    if (!encryptedCid) return;
    // We'll reuse the function from doctor-documents.js if it's global
    if (window.accessDocument) {
        window.accessDocument(encryptedCid);
    } else {
        // Fallback: redirect to documents.html
        window.location.href = 'documents.html';
    }
};

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// Utilities (same as above)
function shortenDid(did) { /* ... */ }
function escapeHtml(text) { /* ... */ }
function showLoading() { /* ... */ }
function hideLoading() { /* ... */ }
function showError(message) { showToast(message, 'error'); }
function showToast(message, type) { /* ... */ }