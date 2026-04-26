// patient.js
let currentUser = null;
let allFiles = [];
let pendingDoctorDidCallback = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadDashboardData();
    await loadNotifications();

    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
});

// Modal helpers for entering DID (replaces prompt)
window.openDoctorDidModal = function (callback) {
    pendingDoctorDidCallback = callback;
    const modal = document.getElementById('doctorDidModal');
    if (modal) {
        document.getElementById('doctorDidInput').value = '';
        modal.style.display = 'flex';
    } else {
        console.error('Doctor DID modal missing – add it to dashboard.html');
    }
};
window.closeDoctorDidModal = function () {
    const modal = document.getElementById('doctorDidModal');
    if (modal) modal.style.display = 'none';
    pendingDoctorDidCallback = null;
};
window.submitDoctorDid = function () {
    const did = document.getElementById('doctorDidInput').value.trim();
    if (did && pendingDoctorDidCallback) {
        pendingDoctorDidCallback(did);
    } else if (!did) {
        showError('Please enter a Doctor DID');
        return;
    }
    closeDoctorDidModal();
};

// Enhanced doctor status check with detailed error analysis
window.checkDoctorStatus = function () {
    openDoctorDidModal(async (doctorDid) => {
        showLoading('Checking doctor status...');
        try {
            let witnessResult = null;
            let isActive = false;
            try {
                witnessResult = await window.electronAPI.getDoctorWitness(doctorDid);
                console.log('Witness result:', witnessResult);
            } catch (err) {
                console.error('getDoctorWitness threw:', err);
                witnessResult = { error: err.message };
            }
            try {
                isActive = await window.electronAPI.isDoctorActive(doctorDid);
                console.log('Is active:', isActive);
            } catch (err) {
                console.error('isDoctorActive threw:', err);
            }

            // ✅ Check for witnessHash directly (no success flag)
            if (witnessResult && witnessResult.witnessHash) {
                const expiryDate = new Date(witnessResult.expiryTime * 1000);
                const now = new Date();
                if (expiryDate < now) {
                    showError(`❌ Doctor witness EXPIRED on ${expiryDate.toLocaleString()}. Please ask Health Department to renew.`);
                } else if (isActive) {
                    showSuccess(`✅ Doctor is ACTIVE\nWitness: ${shortenDid(witnessResult.witnessHash)}\nExpires: ${expiryDate.toLocaleString()}`);
                } else {
                    showError(`❌ Doctor is REVOKED or inactive.\nWitness exists but status is inactive.`);
                }
            } else {
                let reason = witnessResult?.error || 'No witness found';
                if (reason.includes('Doctor not found')) {
                    showError('❌ Doctor NOT FOUND: No witness has been issued for this DID.\n\n👉 Solution: Ask Health Department to issue a witness for this doctor on the current blockchain (Hardhat node).');
                } else {
                    showError(`❌ Doctor status unavailable: ${reason}`);
                }
            }
        } catch (err) {
            console.error(err);
            showError(`Error: ${err.message}`);
        } finally {
            hideLoading();
        }
    });
};

// Share record using the same modal
// Inside patient.js, after loadDashboardData, add:

window.shareRecord = async function (recordId) {
    const sharedRecords = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const record = sharedRecords.find(r => r.id == recordId);
    if (!record) { showError('Record not found'); return; }

    openDoctorDidModal(async (doctorDid) => {
        showLoading('Sharing record...');
        try {
            // Verify doctor is active (has witness)
            const isActive = await window.electronAPI.isDoctorActive(doctorDid);
            if (!isActive) throw new Error('Doctor not active or no witness');

            // Ask for attribute and duration (override from upload or reuse)
            const attribute = record.attribute; // or prompt?
            const durationDays = parseInt(prompt('Access duration in days (1,7,30,365):', '7')) || 7;
            const expiryTime = Math.floor(Date.now() / 1000) + durationDays * 86400;

            // Grant access on smart contract
            const grantResult = await window.electronAPI.grantAccess({
                patientDid: currentUser.did,
                doctorDid: doctorDid,
                documentCid: record.encryptedCID,
                encryptedCid: record.ciphertextCID,
                extra: JSON.stringify({ ciphertext_id: record.ciphertext_id, expiryTime })
            });
            if (!grantResult.success) throw new Error('Contract grant failed');

            // Send notification to doctor
            await window.electronAPI.sendNotification({
                toDid: doctorDid,
                message: `Patient ${currentUser.name} shared a medical record (${record.filename}) with you. Access expires in ${durationDays} days.`
            });
            showSuccess('Record shared successfully');
            loadDashboardData(); // refresh active auth list
        } catch (err) {
            console.error(err);
            showError(err.message);
        } finally {
            hideLoading();
        }
    });
};

// Modify displayRecentRecords to show uploaded records with share button
function displayRecentRecords(records) {
    const container = document.getElementById('recentRecords');
    if (!container) return;
    const sharedRecords = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    const recent = sharedRecords.slice(-5);
    if (recent.length === 0) {
        container.innerHTML = '<p class="no-data">No uploaded records</p>';
        return;
    }
    let html = '';
    for (let rec of recent) {
        html += `
            <div class="record-item">
                <div class="record-icon"><i class="fas fa-file-medical"></i></div>
                <div class="record-info">
                    <h4>${escapeHtml(rec.filename)}</h4>
                    <p>Type: ${rec.recordType} | Date: ${rec.recordDate}</p>
                    <p class="record-cid">CID: ${shortenDid(rec.encryptedCID)}</p>
                </div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="shareRecord(${rec.id})" title="Share"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" onclick="viewRecord('${rec.encryptedCID}')" title="View"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}
//---------------------- share wityh a server  ----------------------

window.shareRecord = async function (encryptedCID, ciphertextCID, ciphertext_id, expiryTime) {
    openDoctorDidModal(async (doctorDid) => {
        showLoading('Sharing record...');
        try {
            const isActive = await window.electronAPI.isDoctorActive(doctorDid);
            if (!isActive) throw new Error('Doctor not active or no witness');

            // Grant access on smart contract
            const grantResult = await window.electronAPI.grantAccess({
                patientDid: currentUser.did,
                doctorDid: doctorDid,
                documentCid: record.encryptedCID,
                encryptedCid: record.ciphertextCID,
                expiryTime: expiryTime
            });
            if (!grantResult.success) throw new Error('Contract call failed');

            // Send notification to doctor
            await window.electronAPI.sendNotification({
                toDid: doctorDid,
                message: `Patient ${currentUser.name} shared a medical record with you. Access expires in ${new Date(expiryTime * 1000).toLocaleString()}`
            });
            showSuccess('Record shared successfully');
            await loadDashboardData(); // refresh active auth
        } catch (err) {
            console.error(err);
            showError(err.message);
        } finally {
            hideLoading();
        }
    });
};

//---------------------------------------------------------------------
// View record
window.viewRecord = async function (cid) {
    try {
        const result = await window.electronAPI.getFromIPFS(cid);
        if (result.success) {
            const modal = document.getElementById('viewModal');
            document.getElementById('viewContent').textContent = atob(result.data.data);
            modal.style.display = 'flex';
        } else {
            showError('Failed to load record');
        }
    } catch (err) {
        showError(err.message);
    }
};

//---------------------------------

function displayUploadedRecords() {
    const container = document.getElementById('recentRecords');
    if (!container) return;
    const sharedRecords = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
    if (sharedRecords.length === 0) {
        container.innerHTML = '<p class="no-data">No uploaded records</p>';
        return;
    }
    let html = '';
    for (let rec of sharedRecords.slice(-5)) {
        html += `
            <div class="record-item">
                <div class="record-icon"><i class="fas fa-file-medical"></i></div>
                <div class="record-info">
                    <h4>${escapeHtml(rec.filename)}</h4>
                    <p>Type: ${rec.recordType} | Date: ${rec.recordDate}</p>
                    <p class="record-cid">CID: ${shortenDid(rec.encryptedCID)}</p>
                </div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="shareRecord(${rec.id})" title="Share"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" onclick="viewRecord('${rec.encryptedCID}')" title="View"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}
//-------------------------------------

// Dashboard data loading
async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'patient') {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session;
    document.getElementById('userName').textContent = session.name || 'Patient';
    document.getElementById('userDid').textContent = shortenDid(session.did);
    return true;
}

async function loadDashboardData() {
    showLoading();
    try {
        const stats = await window.electronAPI.getPatientStats();
        if (stats.success) {
            document.getElementById('totalRecords').textContent = stats.stats.totalRecords;
            document.getElementById('authorizedDoctors').textContent = stats.stats.authorizedDoctors;
            document.getElementById('activeShares').textContent = stats.stats.activeShares;
        }
        const filesResult = await window.electronAPI.getUserFiles();
        if (filesResult.success) {
            allFiles = filesResult.files || [];
            displayRecentRecords(allFiles.slice(0, 5));
        }
        const accesses = await window.electronAPI.getPatientAccesses();
        if (accesses.success) {
            displayActiveAuth(accesses.accesses || []);
        }
    } catch (err) {
        console.error(err);
        showError('Failed to load dashboard data');
    } finally {
        hideLoading();
    }
}

function displayRecentRecords(records) {
    const container = document.getElementById('recentRecords');
    if (!container) return;
    if (records.length === 0) {
        container.innerHTML = '<p class="no-data">No records found</p>';
        return;
    }
    let html = '';
    for (const rec of records) {
        html += `
            <div class="record-item">
                <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                <div class="record-info">
                    <h4>${escapeHtml(rec.filename)}</h4>
                    <p>Uploaded: ${new Date(rec.uploadedAt).toLocaleDateString()}</p>
                    <p class="record-cid">CID: ${shortenDid(rec.cid)}</p>
                </div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="shareRecord('${rec.cid}')" title="Share"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" onclick="viewRecord('${rec.cid}')" title="View"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function displayActiveAuth(authorizations) {
    const container = document.getElementById('activeAuth');
    if (!container) return;
    if (authorizations.length === 0) {
        container.innerHTML = '<p class="no-data">No active authorizations</p>';
        return;
    }
    let html = '';
    for (const auth of authorizations) {
        html += `
            <div class="auth-item">
                <div class="auth-info">
                    <h4>Doctor: ${shortenDid(auth.doctorDid)}</h4>
                    <p>Expires: ${new Date(auth.expiryTime * 1000).toLocaleDateString()}</p>
                </div>
                <button class="btn-danger" onclick="revokeAccess('${auth.doctorDid}', '${auth.documentCid}')">Revoke</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadNotifications() {
    try {
        const notifs = await window.electronAPI.getNotifications();
        const container = document.getElementById('notificationsList');
        if (!container) return;
        if (!notifs.success || notifs.notifications.length === 0) {
            container.innerHTML = '<p class="no-data">No access requests</p>';
            return;
        }
        let html = '';
        for (const n of notifs.notifications) {
            html += `<div class="notification-item">${escapeHtml(n.message)}<br><small>${new Date(n.timestamp).toLocaleString()}</small></div>`;
        }
        container.innerHTML = html;
    } catch (err) { console.error(err); }
}

function closeShareModal() { document.getElementById('shareModal').style.display = 'none'; }
function closeViewModal() { document.getElementById('viewModal').style.display = 'none'; }
function closeVerifyModal() { document.getElementById('verifyDoctorModal').style.display = 'none'; }

async function handleLogout(e) {
    e.preventDefault();
    await window.electronAPI.logout();
    window.location.href = '../login.html';
}

// Utilities
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
function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'patient-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${msg || 'Loading...'}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() { document.getElementById('patient-loading')?.remove(); }
function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}