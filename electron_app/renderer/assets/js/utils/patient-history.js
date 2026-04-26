// patient-history.js

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await checkSession();
        await loadHistoryData();
        initializeEventListeners();
    } catch (error) {
        console.error('Error initializing history page:', error);
        showError('Failed to load history data');
    }
});

let currentUser = null;
let historyData = [];

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'patient') {
            window.location.href = '../login.html';
            return false;
        }
        currentUser = session;

        const userNameEl = document.getElementById('userName');
        const userDidEl = document.getElementById('userDid');

        if (userNameEl) userNameEl.textContent = session.name || 'Patient';
        if (userDidEl) userDidEl.textContent = shortenDid(session.did);

        console.log('Session patient:', session.did); // Debug
        return true;
    } catch (error) {
        console.error('Error checking session:', error);
        window.location.href = '../login.html';
        return false;
    }
}

async function loadHistoryData() {
    showLoading();
    try {
        const accesses = await window.electronAPI.storeGet('accessGrants') || [];
        const users = await window.electronAPI.storeGet('users') || {};

        console.log('All accessGrants:', accesses); // Debug
        console.log('Current user DID:', currentUser?.did);

        if (currentUser && currentUser.did) {
            historyData = accesses.filter(a => a && a.patientDid === currentUser.did);
            console.log('Filtered historyData:', historyData); // Debug
        } else {
            historyData = [];
        }

        // Enrichir avec le nom du médecin
        for (let i = 0; i < historyData.length; i++) {
            const a = historyData[i];
            if (a.doctorDid && users[a.doctorDid]) {
                a.doctorName = users[a.doctorDid].name;
            } else {
                a.doctorName = 'Unknown Doctor';
            }
        }

        updateStats();
        renderTimeline();
        renderTable();
    } catch (error) {
        console.error('Error loading history data:', error);
        showError('Failed to load history data');
    } finally {
        hideLoading();
    }
}

function updateStats() {
    try {
        const now = Date.now() / 1000;

        const totalViews = historyData.filter(a => a && a.viewed).length;
        setElementText('totalViews', totalViews);

        const uniqueDoctors = new Set(historyData.map(a => a.doctorDid).filter(Boolean));
        setElementText('uniqueDoctors', uniqueDoctors.size);

        const viewedItems = historyData.filter(a => a && a.viewed && a.viewedAt)
            .sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0));
        const lastAccess = viewedItems[0];
        setElementText('lastAccess', lastAccess ? new Date(lastAccess.viewedAt * 1000).toLocaleDateString() : 'Never');

        const activeShares = historyData.filter(a => a && a.expiryTime && a.expiryTime > now).length;
        setElementText('activeShares', activeShares);
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

function setElementText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    const activeBtn = document.querySelector('.toggle-btn.active');
    const view = activeBtn ? activeBtn.dataset.view : 'timeline';

    if (historyData.length === 0) {
        container.innerHTML = '<p class="no-data">No access history found</p>';
        return;
    }

    const sorted = [...historyData].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (view === 'timeline') {
        renderTimelineView(sorted, container);
    } else {
        renderGridView(sorted, container);
    }
}

function renderTimelineView(data, container) {
    let html = '';
    for (const item of data) {
        if (!item) continue;
        const date = item.createdAt ? new Date(item.createdAt * 1000) : new Date();
        const status = getStatus(item);
        html += `
            <div class="timeline-item ${status.class}">
                <div class="timeline-time">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                <div class="timeline-content">
                    <h4>${status.icon} ${status.text}</h4>
                    <p><strong>Doctor:</strong> ${escapeHtml(item.doctorName || 'Unknown')}</p>
                    <p><strong>Record:</strong> ${escapeHtml(item.documentName || 'Medical Record')}</p>
                    <p><strong>Duration:</strong> ${formatDuration(item.expiryTime)}</p>
                    <span class="cid">${shortenDid(item.documentCid)}</span>
                    <span class="timeline-badge badge-${status.badge}">${status.label}</span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function renderGridView(data, container) {
    container.className = 'timeline-grid';
    let html = '';
    for (const item of data) {
        if (!item) continue;
        const status = getStatus(item);
        const date = item.createdAt ? new Date(item.createdAt * 1000) : new Date();
        html += `
            <div class="grid-item ${status.class}">
                <div class="grid-header">
                    <span class="timeline-badge badge-${status.badge}">${status.label}</span>
                    <small>${date.toLocaleDateString()}</small>
                </div>
                <h4>${escapeHtml(item.documentName || 'Medical Record')}</h4>
                <p><i class="fas fa-user-md"></i> ${escapeHtml(item.doctorName || 'Unknown')}</p>
                <p><small>CID: ${shortenDid(item.documentCid)}</small></p>
                <p><small>Expires: ${item.expiryTime ? new Date(item.expiryTime * 1000).toLocaleDateString() : 'N/A'}</small></p>
            </div>
        `;
    }
    container.innerHTML = html;
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    if (historyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No access records found</td></tr>';
        return;
    }

    let html = '';
    const now = Date.now() / 1000;
    for (const item of historyData) {
        if (!item) continue;
        const date = item.createdAt ? new Date(item.createdAt * 1000) : new Date();
        const status = getStatus(item);
        const isActive = now < (item.expiryTime || 0);
        html += `
            <tr>
                <td>${date.toLocaleString()}</td>
                <td>${escapeHtml(item.doctorName || 'Unknown')}</td>
                <td>${escapeHtml(item.documentName || 'Medical Record')}</td>
                <td><span class="status-badge status-${status.badge}">${status.label}</span></td>
                <td>${formatDuration(item.expiryTime)}</td>
                <td><span class="cid">${shortenDid(item.documentCid)}</span></td>
                <td><span class="status-badge ${isActive ? 'status-active' : 'status-expired'}">${isActive ? 'Active' : 'Expired'}</span></td>
                <td><button class="action-btn" onclick="viewDetails('${item.id}')"><i class="fas fa-eye"></i></button></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function getStatus(item) {
    if (!item) return defaultStatus;
    if (item.revoked) {
        return { class: 'access-revoked', badge: 'danger', label: 'Revoked', icon: '🔴', text: 'Access Revoked' };
    } else if (item.viewed) {
        return { class: 'record-viewed', badge: 'info', label: 'Viewed', icon: '👁️', text: 'Record Viewed' };
    } else {
        return { class: 'access-granted', badge: 'success', label: 'Granted', icon: '✅', text: 'Access Granted' };
    }
}

function formatDuration(expiryTime) {
    if (!expiryTime) return 'Unknown';
    const now = Date.now() / 1000;
    if (now > expiryTime) return 'Expired';
    const days = Math.ceil((expiryTime - now) / (24 * 60 * 60));
    return `${days} day${days > 1 ? 's' : ''}`;
}

function shortenDid(did) {
    if (!did || typeof did !== 'string') return '';
    if (did.length <= 20) return did;
    return did.substring(0, 10) + '...' + did.substring(did.length - 10);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Filtres (à implémenter)
function applyFilters() {
    console.log('Applying filters...');
    loadHistoryData(); // Recharge avec les filtres (à personnaliser)
}

function setView(viewType) {
    const buttons = document.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    const target = Array.from(buttons).find(btn => btn.dataset.view === viewType);
    if (target) target.classList.add('active');
    renderTimeline();
}
window.setView = setView;

function viewDetails(id) {
    const item = historyData.find(i => i.id === id);
    if (!item) return;

    const modal = document.getElementById('accessDetailsModal');
    const details = document.getElementById('accessDetails');
    if (!modal || !details) return;

    const grantedDate = item.createdAt ? new Date(item.createdAt * 1000).toLocaleString() : 'Unknown';
    const expiryDate = item.expiryTime ? new Date(item.expiryTime * 1000).toLocaleString() : 'Unknown';
    const viewedDate = item.viewedAt ? new Date(item.viewedAt * 1000).toLocaleString() : null;

    details.innerHTML = `
        <div class="details-grid">
            <div class="detail-item"><label>Access ID</label><p>${item.id || 'N/A'}</p></div>
            <div class="detail-item"><label>Doctor DID</label><p>${item.doctorDid || 'N/A'}</p></div>
            <div class="detail-item"><label>Doctor Name</label><p>${item.doctorName || 'Unknown'}</p></div>
            <div class="detail-item"><label>Record CID</label><p class="cid">${item.documentCid || 'N/A'}</p></div>
            <div class="detail-item"><label>Granted At</label><p>${grantedDate}</p></div>
            <div class="detail-item"><label>Expires At</label><p>${expiryDate}</p></div>
            <div class="detail-item"><label>Status</label><p><span class="status-badge ${item.revoked ? 'status-expired' : 'status-active'}">${item.revoked ? 'Revoked' : 'Active'}</span></p></div>
            ${viewedDate ? `<div class="detail-item"><label>Last Viewed</label><p>${viewedDate}</p></div>` : ''}
        </div>
    `;
    modal.style.display = 'flex';
}
window.viewDetails = viewDetails;

function closeDetailsModal() {
    const modal = document.getElementById('accessDetailsModal');
    if (modal) modal.style.display = 'none';
}
window.closeDetailsModal = closeDetailsModal;

function exportHistory() {
    try {
        const dataStr = JSON.stringify(historyData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `access-history-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('History exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting history:', error);
        showToast('Failed to export history', 'error');
    }
}
window.exportHistory = exportHistory;

function initializeEventListeners() {
    const applyFilterBtn = document.querySelector('.btn-primary');
    if (applyFilterBtn) applyFilterBtn.addEventListener('click', applyFilters);
    const dateRange = document.getElementById('dateRange');
    if (dateRange) dateRange.addEventListener('change', applyFilters);
    const recordType = document.getElementById('recordType');
    if (recordType) recordType.addEventListener('change', applyFilters);
    const accessType = document.getElementById('accessType');
    if (accessType) accessType.addEventListener('change', applyFilters);
}

// Fonctions d'interface utilisateur
function showLoading() {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div><p>Loading history...</p>';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showError(message) {
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    const existing = document.querySelectorAll('.toast');
    if (existing.length > 3) existing[0].remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Styles CSS (déjà inclus dans la page, mais on peut les ajouter ici si nécessaire)
function addStyles() {
    if (document.getElementById('history-styles')) return;
    const style = document.createElement('style');
    style.id = 'history-styles';
    style.textContent = `
        .loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; z-index: 9999;
        }
        .spinner {
            width: 50px; height: 50px;
            border: 5px solid #f3f3f3; border-top: 5px solid #667eea;
            border-radius: 50%; animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .toast {
            position: fixed; top: 20px; right: 20px;
            padding: 12px 24px; background: white; border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            display: flex; align-items: center; gap: 10px;
            z-index: 10000; animation: slideIn 0.3s ease;
        }
        .toast.success { background: #d4edda; color: #155724; border-left: 4px solid #28a745; }
        .toast.error { background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545; }
        .toast.info { background: #d1ecf1; color: #0c5460; border-left: 4px solid #17a2b8; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .error { color: #dc3545; text-align: center; padding: 20px; }
        .no-data { color: #666; text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; margin: 10px 0; }
    `;
    document.head.appendChild(style);
}
addStyles();