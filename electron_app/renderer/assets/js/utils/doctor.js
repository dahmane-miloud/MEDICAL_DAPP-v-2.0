/*
// doctor.js - Complete Doctor Dashboard (FIXED)

console.log('Doctor dashboard initializing...');

window.currentUser = null;
let currentDecryptRecord = { cid: null, encryptedCid: null };

document.addEventListener('DOMContentLoaded', async () => {
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        console.error('MediChainCrypto not loaded!');
        showError('Crypto library not available. Please refresh the page.');
        return;
    }

    await checkSession();
    await loadDashboardData();
    attachEventListeners();
    setupNavigation();
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'doctor') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;

        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserDid = document.getElementById('sidebarUserDid');

        if (sidebarUserName) sidebarUserName.innerText = session.name || 'Doctor';
        if (sidebarUserDid) sidebarUserDid.innerText = shortenDid(session.did);

        // Register doctor with ALL possible attributes
        try {
            await fetch('http://127.0.0.1:5000/register_doctor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_did: session.did,
                    attributes: ["doctor", "cardiologist", "neurologist", "pediatrician", "surgeon", "dermatologist", "ophthalmologist", "psychiatrist"]
                })
            });
            console.log("✅ Doctor registered with Proxy memory");
        } catch (e) {
            console.error("❌ Failed to connect to Python Proxy:", e);
        }

        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });

            const pageTitle = document.getElementById('pageTitle');

            if (pageName === 'dashboard') {
                document.getElementById('dashboardPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Dashboard';
                loadDashboardStats();
            } else if (pageName === 'shared') {
                document.getElementById('sharedPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Shared Records';
                loadSharedRecords();
            } else if (pageName === 'requests') {
                document.getElementById('requestsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Access Requests';
                loadAccessRequests();
            } else if (pageName === 'authorizations') {
                document.getElementById('authorizationsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Authorizations';
                loadAuthorizations();
            }
        });
    });
}

function attachEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const sendAccessRequestBtn = document.getElementById('sendAccessRequestBtn');
    const decryptRecordBtn = document.getElementById('decryptRecordBtn');
    const cancelDecryptBtn = document.getElementById('cancelDecryptBtn');
    const closeDecryptModalBtn = document.getElementById('closeDecryptModalBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardData();
            showSuccess('Dashboard refreshed');
        });
    }

    if (sendAccessRequestBtn) {
        sendAccessRequestBtn.addEventListener('click', () => {
            sendAccessRequest();
        });
    }

    if (decryptRecordBtn) {
        decryptRecordBtn.addEventListener('click', () => {
            decryptAndOpenRecord();
        });
    }

    if (cancelDecryptBtn) {
        cancelDecryptBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    if (closeDecryptModalBtn) {
        closeDecryptModalBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('decryptModal');
        if (e.target === modal) closeDecryptModal();
    });

    const deleteAllBtn = document.getElementById('deleteAllBtn');

if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ Delete ALL shared records permanently?\n\nThis action cannot be undone.');
        if (!confirmed) return;
        
        try {
            const session = window.currentUser || await window.electronAPI.getSession();
            if (!session || !session.did) {
                showError('No session found');
                return;
            }
            
            await window.electronAPI.storeSet('doctorAccesses:' + session.did, []);
            localStorage.clear();
            showSuccess('All records deleted successfully!');
            
            // Reload after short delay
            setTimeout(() => location.reload(), 500);
        } catch (err) {
            console.error('Delete error:', err);
            showError('Failed to delete records: ' + err.message);
        }
    });
}
}

async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        await loadSharedRecords();
        await loadDashboardStats();
        await loadAccessRequests();
    } catch (err) {
        console.error('Load dashboard error:', err);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

async function loadDashboardStats() {
    try {
        const records = JSON.parse(localStorage.getItem('sharedWithMe') || '[]');
        const now = Date.now() / 1000;
        const activeAccesses = records.filter(r => r.isActive && Number(r.expiryTime) > now).length;
        const uniquePatients = new Set(records.map(r => r.patientDid)).size;
        const expiringSoon = records.filter(r => {
            const exp = Number(r.expiryTime);
            return exp > now && (exp - now) < 7 * 24 * 3600;
        }).length;

        const totalRecordsEl = document.getElementById('totalRecords');
        const activeAccessesEl = document.getElementById('activeAccesses');
        const totalPatientsEl = document.getElementById('totalPatients');
        const expiringSoonEl = document.getElementById('expiringSoon');
        const sharedBadge = document.getElementById('sharedBadge');

        if (totalRecordsEl) totalRecordsEl.innerText = records.length;
        if (activeAccessesEl) activeAccessesEl.innerText = activeAccesses;
        if (totalPatientsEl) totalPatientsEl.innerText = uniquePatients;
        if (expiringSoonEl) expiringSoonEl.innerText = expiringSoon;
        if (sharedBadge) sharedBadge.innerText = records.length;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function sendAccessRequest() {
    const patientDid = document.getElementById('requestPatientDid')?.value.trim();
    const message = document.getElementById('requestMessageText')?.value.trim();

    if (!patientDid) {
        showError('Please enter Patient DID');
        return;
    }

    showLoading('Sending access request...');
    try {
        const result = await window.electronAPI.sendNotification({
            toDid: patientDid,
            message: message || `Dr. ${window.currentUser.name} requests access to your medical records`,
            doctorName: window.currentUser.name,
            doctorDid: window.currentUser.did,
            type: 'access_request',
            timestamp: new Date().toISOString()
        });

        if (result.success) {
            showSuccess('Access request sent successfully!');
            const patientDidInput = document.getElementById('requestPatientDid');
            const messageText = document.getElementById('requestMessageText');
            if (patientDidInput) patientDidInput.value = '';
            if (messageText) messageText.value = '';
        } else {
            throw new Error(result.error || 'Failed to send request');
        }
    } catch (err) {
        console.error('Send request error:', err);
        showError('Failed to send request: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== LOAD SHARED RECORDS ==========
async function loadSharedRecords() {
    const container = document.getElementById('sharedRecordsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        console.log('Doctor accesses:', result);

        const accesses = result.success ? (result.accesses || []) : [];

        localStorage.setItem('sharedWithMe', JSON.stringify(accesses));

        if (accesses.length === 0) {
            container.innerHTML = '<div class="no-data">No records shared with you yet.</div>';
            return;
        }

        let html = '';
        for (const access of accesses) {
            const expiryTimeSec = Number(access.expiryTime);
            const expiryDate = new Date(expiryTimeSec * 1000);
            const isExpired = expiryDate < new Date();
            const daysLeft = Math.ceil((expiryTimeSec * 1000 - Date.now()) / (1000 * 3600 * 24));

            // Check if storage method is pinata
            const isPinata = access.storageMethod === 'pinata';

            html += `
                <div class="record-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                        <span class="record-status ${isExpired ? 'status-expired' : 'status-active'}">
                            ${isExpired ? 'Expired' : 'Active'}
                        </span>
                        ${isPinata ? '<span class="badge-pinata" style="background:#6c5ce7; color:white; padding:2px 8px; border-radius:12px; font-size:11px;"><i class="fas fa-cloud"></i> Pinata</span>' : ''}
                    </div>
                    <div class="record-info">
                        <h4>${escapeHtml(access.filename || 'Medical Record')}</h4>
                        <p><i class="fas fa-user"></i> Patient: ${shortenDid(access.patientDid)}</p>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        ${!isExpired ? `<p><i class="fas fa-clock"></i> ${daysLeft} days left</p>` : ''}
                       
                    </div>
                    <div class="record-actions" style="display: flex; gap: 0.5rem;">
                       
                        <button class="btn-primary" onclick="window.previewRecordViaPinata('${access.documentCid}', '${access.encryptedCid}')" style="flex: 1; background: #6c5ce7;">
                            <i class="fas fa-cloud-upload-alt"></i> Preview
                        </button>
                        
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        const sharedBadge = document.getElementById('sharedBadge');
        if (sharedBadge) sharedBadge.innerText = accesses.length;
        await loadDashboardStats();
    } catch (err) {
        console.error('Error loading shared records:', err);
        container.innerHTML = '<div class="no-data">Error loading records: ' + err.message + '</div>';
    }
}


// ========== PREVIEW RECORD VIA PINATA (WORKING VERSION) ==========
// ========== PREVIEW RECORD VIA PINATA (WITH ADVANCED FHIR CLINICAL DASHBOARD) ==========
window.previewRecordViaPinata = async function (documentCid, encryptedCid) {
    console.log('🔵 PINATA PREVIEW - START');
    if (!documentCid || !encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Loading from Pinata...');

    try {
        // 1. Fetch access records
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);
        if (!accessRecord) throw new Error('Access record not found');
        if (!accessRecord.ciphertextId) throw new Error('No ciphertextId associated with access');

        console.log('1. Ciphertext ID:', accessRecord.ciphertextId);

        // 2. Request re-encryption key from Proxy Re-Encryption node
        console.log('2. Requesting PRE rekey shares...');
        const rekeyRes = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: accessRecord.ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });
        if (!rekeyRes.ok) throw new Error('Proxy Rekey failed: ' + await rekeyRes.text());
        const rekey = await rekeyRes.json();

        // 3. Perform Proxy Re-Encryption
        console.log('3. Triggering proxy re-encryption transformation...');
        const reencryptRes = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekey.rekey_id })
        });
        if (!reencryptRes.ok) throw new Error('Proxy transformation execution failed');
        const reencrypt = await reencryptRes.json();

        // 4. Decrypt the symmetric AES key using Doctor's Private Keys
        console.log('4. Performing localized AES key decryption...');
        const decryptRes = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: reencrypt.transformed_ct_id,
                doctor_did: window.currentUser.did
            })
        });
        if (!decryptRes.ok) throw new Error('Decryption of symmetric asset key failed');
        const decryptResult = await decryptRes.json();

        const aesKeyBase64 = decryptResult.aes_key_b64;
        console.log('5. Symmetric decipher key loaded safely.');

        // 5. Download payload raw encrypted content from Pinata IPFS gateway
        console.log('6. Downloading payload stream from Pinata IPFS Gateway:', documentCid);
        const fileResult = await window.electronAPI.pinataGet(documentCid);

        if (!fileResult || !fileResult.success) {
            throw new Error('IPFS storage fetch execution failed: ' + (fileResult?.error || 'Empty stream output'));
        }

        // 6. Convert incoming base64 document structure back to raw bytes
        let encryptedBytes;
        try {
            encryptedBytes = Uint8Array.from(atob(fileResult.data.data), c => c.charCodeAt(0));
        } catch (e) {
            encryptedBytes = new Uint8Array(fileResult.data.data.length);
            for (let i = 0; i < fileResult.data.data.length; i++) {
                encryptedBytes[i] = fileResult.data.data.charCodeAt(i);
            }
        }

        // 7. Import raw symmetric cryptographic material natively
        const aesKey = await window.crypto.subtle.importKey(
            'raw',
            Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0)),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        // 8. Isolate initialization vector array sequence and run AES-GCM matrix decryption
        const iv = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            ciphertext
        );
        const decryptedData = new Uint8Array(decryptedBuffer);
        console.log('7. Payload block decrypted successfully. Payload size:', decryptedData.length);

        // 9. Process presentation containers inside the application workspace
        const blob = new Blob([decryptedData]);
        const fileType = fileResult.data.fileType || 'application/octet-stream';
        const fileName = fileResult.data.filename?.replace('.enc', '') || 'medical_record.json';
        
        const url = URL.createObjectURL(blob);
        const previewModal = document.getElementById('previewModal');
        const previewContent = document.getElementById('previewContent');
        const previewTitle = document.getElementById('previewTitle');

        if (!previewModal || !previewContent) {
            throw new Error('Required Document Workspace Modal Components are missing from the DOM.');
        }

        previewTitle.innerText = `Electronic Health Record Viewer: ${fileName}`;
        previewContent.innerHTML = '';

        // Handle Image payloads
        if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            const img = document.createElement('img');
            img.src = url;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '70vh';
            img.style.objectFit = 'contain';
            previewContent.appendChild(img);
        }
        // Handle PDF document payloads
        else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.style.width = '100%';
            iframe.style.height = '70vh';
            iframe.style.border = 'none';
            previewContent.appendChild(iframe);
        }
        // Handle Text/Structured JSON Electronic Health Records (FHIR Engine Integration)
        else {
            const text = await blob.text();
            
            try {
                const fhirBundle = JSON.parse(text);
                
                // Assert structural compatibility with standard FHIR structures
                if (fhirBundle.resourceType === "Bundle" && Array.isArray(fhirBundle.entry)) {
                    
                    // Categorize internal resources efficiently
                    const resources = {
                        Patient: [], Condition: [], Observation: [], AllergyIntolerance: [],
                        MedicationRequest: [], Immunization: [], CarePlan: [], Encounter: []
                    };
                    
                    fhirBundle.entry.forEach(e => {
                        if (e.resource && resources[e.resource.resourceType]) {
                            resources[e.resource.resourceType].push(e.resource);
                        }
                    });

                    const patient = resources.Patient[0] || {};
                    
                    // Helper extraction expressions
                    const nameObj = patient.name?.[0] || {};
                    const patientName = `${(nameObj.given || []).join(' ')} ${nameObj.family || ''}`.trim() || patient.id || 'Anonymous';
                    const dob = patient.birthDate || '—';
                    const gender = patient.gender ? patient.gender.toUpperCase() : '—';
                    const phone = patient.telecom?.find(t => t.system === 'phone')?.value || '—';
                    const email = patient.telecom?.find(t => t.system === 'email')?.value || '—';
                    const marital = patient.maritalStatus?.text || '—';
                    const lang = patient.communication?.[0]?.language?.text || '—';
                    const addressObj = patient.address?.[0] || {};
                    const addressStr = `${addressObj.line ? addressObj.line.join(', ') : ''} ${addressObj.city || ''} ${addressObj.state || ''} ${addressObj.postalCode || ''}`.trim() || '—';

                    // Build Dashboard Framework with Embedded Dashboard Variables
                    const container = document.createElement('div');
                    container.className = 'clinical-dashboard-container';
                    
                    // Inject specific Dashboard Theme Stylesheet into workspace context scoped securely
                    container.innerHTML = `
                        <style>
                            .clinical-dashboard-wrapper {
                                font-family: 'Inter', sans-serif;
                                color: #1a1f36;
                                background-color: #f8fafc;
                                padding: 15px;
                                border-radius: 12px;
                                text-align: left;
                                display: flex;
                                flex-direction: column;
                                gap: 24px;
                            }
                            .dashboard-banner {
                                background: linear-gradient(135deg, #1e293b, #0f172a);
                                border-radius: 16px;
                                padding: 24px;
                                color: #ffffff;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                            }
                            .banner-title h2 { margin: 0; font-size: 1.75rem; font-weight: 900; letter-spacing: -0.025em; }
                            .banner-title p { margin: 6px 0 0 0; color: #94a3b8; font-size: 0.875rem; font-family: monospace; }
                            .banner-metrics { display: flex; gap: 24px; font-size: 0.925rem; }
                            .banner-metric-item { background: rgba(255,255,255,0.06); padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); }
                            .banner-metric-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; font-weight: 600; }
                            .banner-metric-value { font-weight: 600; color: #f8fafc; }
                            
                            .dashboard-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
                            @media (max-width: 1024px) { .dashboard-grid { grid-template-columns: 1fr; } }
                            
                            .dashboard-column { display: flex; flex-direction: column; gap: 24px; }
                            .clinical-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.01); overflow: hidden; }
                            .card-header { padding: 18px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; background: #fafafa; }
                            .card-header h3 { margin: 0; font-size: 1.05rem; font-weight: 600; color: #334155; }
                            .icon-box { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
                            
                            .blue-theme { color: #2563eb; background: #eff6ff; }
                            .red-theme { color: #dc2626; background: #fee2e2; }
                            .green-theme { color: #16a34a; background: #dcfce7; }
                            .purple-theme { color: #7c3aed; background: #f5f3ff; }
                            .amber-theme { color: #d97706; background: #fef9c3; }
                            
                            .card-body { padding: 20px; }
                            .demographics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; font-size: 0.875rem; }
                            .demo-field { border-bottom: 1px dashed #f1f5f9; padding-bottom: 8px; }
                            .demo-label { color: #64748b; font-size: 0.775rem; font-weight: 500; text-transform: uppercase; margin-bottom: 2px; }
                            .demo-value { color: #1e293b; font-weight: 600; }
                            
                            .clinical-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; text-align: left; }
                            .clinical-table th { padding: 10px 12px; color: #64748b; font-weight: 600; border-bottom: 2px solid #f1f5f9; font-size: 0.8rem; text-transform: uppercase; }
                            .clinical-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                            .clinical-table tr:last-child td { border: none; }
                            
                            .clinical-badge { inline-size: max-content; padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; display: inline-block; }
                            .badge-danger { background: #fee2e2; color: #dc2626; }
                            .badge-success { background: #dcfce7; color: #16a34a; }
                            .badge-info { background: #e0f2fe; color: #0369a1; }
                            .badge-neutral { background: #f1f5f9; color: #475569; }
                            
                            .timeline-list { display: flex; flex-direction: column; gap: 14px; }
                            .timeline-item { border-left: 3px solid #cbd5e1; padding-left: 14px; font-size: 0.85rem; position: relative; }
                            .timeline-item.active { border-left-color: #2563eb; }
                            .timeline-item.med { border-left-color: #16a34a; }
                            .timeline-title { font-weight: 600; color: #1e293b; }
                            .timeline-meta { font-size: 0.775rem; color: #64748b; margin-top: 2px; }
                        </style>
                        
                        <div class="clinical-dashboard-wrapper">
                            <div class="dashboard-banner">
                                <div class="banner-title">
                                    <h2>${patientName}</h2>
                                    <p>Resource Bundle UID: ${patient.id || 'N/A'}</p>
                                </div>
                                <div class="banner-metrics">
                                    <div class="banner-metric-item">
                                        <div class="banner-metric-label">Date of Birth</div>
                                        <div class="banner-metric-value">${dob}</div>
                                    </div>
                                    <div class="banner-metric-item">
                                        <div class="banner-metric-label">Administrative Gender</div>
                                        <div class="banner-metric-value">${gender}</div>
                                    </div>
                                </div>
                            </div>

                            <div class="dashboard-grid">
                                
                                <div class="dashboard-column">
                                    
                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box blue-theme">👤</div>
                                            <h3>Demographics & Administration Profile</h3>
                                        </div>
                                        <div class="card-body">
                                            <div class="demographics-grid">
                                                <div class="demo-field"><div class="demo-label">Contact Phone</div><div class="demo-value">${phone}</div></div>
                                                <div class="demo-field"><div class="demo-label">Email Address</div><div class="demo-value">${email}</div></div>
                                                <div class="demo-field"><div class="demo-label">Marital Status</div><div class="demo-value">${marital}</div></div>
                                                <div class="demo-field"><div class="demo-label">Language Preference</div><div class="demo-value">${lang}</div></div>
                                                <div class="demo-field" style="grid-column: span 2;"><div class="demo-label">Residential Address</div><div class="demo-value">${addressStr}</div></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box red-theme">⚠️</div>
                                            <h3>Allergies & Adverse Manifestations (${resources.AllergyIntolerance.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.AllergyIntolerance.length === 0 ? '<span class="clinical-badge badge-success">No Confirmed Healthcare Allergies Found</span>' : `
                                                <table class="clinical-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Substance Allergen</th>
                                                            <th>Criticality Intensity</th>
                                                            <th>Clinical Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${resources.AllergyIntolerance.map(a => `
                                                            <tr>
                                                                <td><strong>${a.substance?.text || a.code?.text || 'Unidentified Compound'}</strong></td>
                                                                <td><span class="clinical-badge badge-danger">${a.criticality || 'UNSPECIFIED'}</span></td>
                                                                <td><span class="clinical-badge badge-neutral">${a.clinicalStatus?.coding?.[0]?.code || 'ACTIVE'}</span></td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            `}
                                        </div>
                                    </div>

                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box amber-theme">📊</div>
                                            <h3>Recent Vital Signs & Lab Metrics (${resources.Observation.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.Observation.length === 0 ? '<p style="color:#64748b; font-size:0.875rem; margin:0;">No tracking observational records stored.</p>' : `
                                                <table class="clinical-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Observation Metric</th>
                                                            <th>Recorded Value</th>
                                                            <th>Assessment Date</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${resources.Observation.slice(0, 10).map(o => {
                                                            const value = o.valueQuantity ? `${o.valueQuantity.value.toFixed(1)} ${o.valueQuantity.unit || ''}` : 
                                                                          (o.valueCodeableConcept?.text || '—');
                                                            return `
                                                                <tr>
                                                                    <td><strong>${o.code?.text || 'Diagnostic Lab Parameter'}</strong></td>
                                                                    <td style="color:#2563eb; font-weight:700;">${value}</td>
                                                                    <td>${o.effectiveDateTime ? o.effectiveDateTime.split('T')[0] : '—'}</td>
                                                                </tr>
                                                            `;
                                                        }).join('')}
                                                    </tbody>
                                                </table>
                                            `}
                                        </div>
                                    </div>
                                </div>

                                <div class="dashboard-column">
                                    
                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box purple-theme">🩺</div>
                                            <h3>Active Health Conditions (${resources.Condition.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.Condition.length === 0 ? '<p style="color:#64748b; font-size:0.875rem; margin:0;">No tracked medical codes present.</p>' : `
                                                <div class="timeline-list">
                                                    ${resources.Condition.map(c => `
                                                        <div class="timeline-item active">
                                                            <div class="timeline-title">${c.code?.text || 'Undocumented Diagnostic Profile'}</div>
                                                            <div class="timeline-meta">Onset Record: ${c.onsetDateTime ? c.onsetDateTime.split('T')[0] : 'Confirmed Clinical Profile'}</div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box green-theme">💊</div>
                                            <h3>Active Prescription Order Track (${resources.MedicationRequest.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.MedicationRequest.length === 0 ? '<p style="color:#64748b; font-size:0.875rem; margin:0;">No pharmacological records.</p>' : `
                                                <div class="timeline-list">
                                                    ${resources.MedicationRequest.slice(0, 8).map(m => `
                                                        <div class="timeline-item med">
                                                            <div class="timeline-title">${m.medicationCodeableConcept?.text || 'Prescription Asset'}</div>
                                                            <div class="timeline-meta">Status Badge: <span class="clinical-badge badge-info" style="font-size:0.65rem; padding:1px 6px;">${m.status || 'ACTIVE'}</span></div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box blue-theme">⏳</div>
                                            <h3>Clinical Encounters Timeline (${resources.Encounter.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.Encounter.length === 0 ? '<p style="color:#64748b; font-size:0.875rem; margin:0;">No recorded tracking logs.</p>' : `
                                                <div class="timeline-list" style="max-height: 280px; overflow-y: auto; padding-right: 4px;">
                                                    ${resources.Encounter.slice(0, 8).map(e => `
                                                        <div class="timeline-item">
                                                            <div class="timeline-title">${e.type?.[0]?.text || e.class?.display || 'Consultation Encounter'}</div>
                                                            <div class="timeline-meta">Session Period: ${e.period?.start ? e.period.start.split('T')[0] : '—'}</div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <div class="clinical-card">
                                        <div class="card-header">
                                            <div class="icon-box green-theme">💉</div>
                                            <h3>Immunization Record Ledger (${resources.Immunization.length})</h3>
                                        </div>
                                        <div class="card-body">
                                            ${resources.Immunization.length === 0 ? '<p style="color:#64748b; font-size:0.875rem; margin:0;">No registered inoculations.</p>' : `
                                                <div class="timeline-list" style="max-height: 250px; overflow-y: auto; padding-right: 4px;">
                                                    ${resources.Immunization.map(i => `
                                                        <div class="timeline-item med">
                                                            <div class="timeline-title">${i.vaccineCode?.text || 'Biomedical Agent Injection'}</div>
                                                            <div class="timeline-meta">Administration: ${i.date ? i.date.split('T')[0] : '—'}</div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    `;
                    
                    previewContent.appendChild(container);
                } else {
                    throw new Error("Target structurally parsed successfully but does not align with FHIR collection layout rules.");
                }
            } catch (err) {
                // Decryption structural fallback option (plain text reader display)
                console.warn('Dashboard rendering engine bypass option routing initialized:', err);
                const pre = document.createElement('pre');
                pre.textContent = text;
                pre.style.maxHeight = '60vh';
                pre.style.overflow = 'auto';
                pre.style.background = '#0f172a';
                pre.style.color = '#38bdf8';
                pre.style.padding = '1.25rem';
                pre.style.borderRadius = '10px';
                pre.style.fontFamily = 'monospace';
                pre.style.whiteSpace = 'pre-wrap';
                previewContent.appendChild(pre);
            }
        }

        // Show layout workspace modal container
        previewModal.style.display = 'flex';
        
        const closeBtn = document.getElementById('closePreviewModalBtn');
        const closeFooterBtn = document.getElementById('closePreviewFooterBtn');

        const cleanup = () => {
            URL.revokeObjectURL(url);
            previewModal.style.display = 'none';
        };

        if (closeBtn) closeBtn.onclick = cleanup;
        if (closeFooterBtn) closeFooterBtn.onclick = cleanup;

        hideLoading();
        showSuccess('Electronic Health Record rendered successfully!');
    } catch (err) {
        console.error('❌ WORKSPACE PREVIEW RENDERING ERROR:', err);
        showError('Execution Framework Interrupted: ' + err.message);
        hideLoading();
    }
};
// Add warning toast function if not exists
function showWarning(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast warning';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ========== LOAD ACCESS REQUESTS ==========
async function loadAccessRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;

    try {
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? (notifs.notifications || []).filter(n => n.type === 'access_request') : [];

        const requestBadge = document.getElementById('requestBadge');
        if (requestBadge) requestBadge.innerText = requests.length;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-data">No pending access requests</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < requests.length; i++) {
            const req = requests[i];
            html += `
                <div class="request-card">
                    <div class="request-info">
                        <h4><i class="fas fa-user"></i> From: ${escapeHtml(req.doctorName || 'Patient')}</h4>
                        <p><i class="fas fa-id-card"></i> DID: ${shortenDid(req.doctorDid || '')}</p>
                        <p><i class="fas fa-envelope"></i> ${escapeHtml(req.message)}</p>
                        <small><i class="fas fa-clock"></i> ${new Date(req.timestamp).toLocaleString()}</small>
                    </div>
                    
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load requests error:', err);
        container.innerHTML = '<div class="no-data">Error loading requests: ' + err.message + '</div>';
    }
}

// ========== LOAD AUTHORIZATIONS ==========
async function loadAuthorizations() {
    const container = document.getElementById('authorizationsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? (result.accesses || []) : [];
        const now = Date.now() / 1000;
        const activeAccesses = accesses.filter(a => a.isActive && Number(a.expiryTime) > now);

        if (activeAccesses.length === 0) {
            container.innerHTML = '<div class="no-data">No active authorizations</div>';
            return;
        }

        let html = '';
        for (const auth of activeAccesses) {
            const expiryDate = new Date(Number(auth.expiryTime) * 1000);
            html += `
                <div class="auth-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-key"></i></div>
                        <span class="record-status status-active">Active</span>
                    </div>
                    <div class="record-info">
                        <h4>Patient: ${shortenDid(auth.patientDid)}</h4>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        <p><i class="fas fa-file"></i> Record CID: ${shortenDid(auth.documentCid)}</p>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load authorizations error:', err);
        container.innerHTML = '<div class="no-data">Error loading authorizations</div>';
    }
}

// ========== RESPOND TO REQUESTS ==========
window.acceptRequest = async function (requestId) {
    showLoading('Accepting request...');
    try {
        showSuccess('Request accepted!');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to accept request');
    } finally {
        hideLoading();
    }
};

window.declineRequest = async function (requestId) {
    showLoading('Declining request...');
    try {
        showSuccess('Request declined');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to decline request');
    } finally {
        hideLoading();
    }
};

// ========== DECRYPT MODAL ==========
window.openDecryptModal = function (documentCid, encryptedCid) {
    currentDecryptRecord = {
        cid: documentCid,
        encryptedCid: encryptedCid
    };
    const modal = document.getElementById('decryptModal');
    const decryptCid = document.getElementById('decryptCid');

    if (decryptCid) decryptCid.innerText = shortenDid(documentCid);
    if (modal) modal.style.display = 'flex';
};

function closeDecryptModal() {
    const modal = document.getElementById('decryptModal');
    if (modal) modal.style.display = 'none';
    currentDecryptRecord = { cid: null, encryptedCid: null };
}

window.closeDecryptModal = closeDecryptModal;

// ========== PREVIEW RECORD ==========
window.previewRecord = async function (documentCid, encryptedCid) {
    if (!documentCid || !encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing preview...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) {
            throw new Error('Access record not found');
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        // Generate rekey
        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        // Proxy re-encrypt
        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        // Decrypt
        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        // Get encrypted file from IPFS
        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        // Decrypt the file
        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        // Display preview
        const blob = new Blob([decryptedData]);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';
        const fileName = encryptedResult.data.filename?.replace('.enc', '') || 'medical_record';

        showPreview(blob, fileType, fileName, documentCid, encryptedCid);

    } catch (err) {
        console.error('Preview error:', err);
        showError('Failed to preview record: ' + err.message);
    } finally {
        hideLoading();
    }
};

// Show preview modal
function showPreview(blob, fileType, fileName, documentCid, encryptedCid) {
    const url = URL.createObjectURL(blob);
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const previewTitle = document.getElementById('previewTitle');

    const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');
    const closePreviewFooterBtn = document.getElementById('closePreviewFooterBtn');
    const downloadFromPreviewBtn = document.getElementById('downloadFromPreviewBtn');

    if (closePreviewModalBtn) {
        closePreviewModalBtn.addEventListener('click', closePreviewModal);
    }
    if (closePreviewFooterBtn) {
        closePreviewFooterBtn.addEventListener('click', closePreviewModal);
    }
    if (downloadFromPreviewBtn) {
        downloadFromPreviewBtn.addEventListener('click', () => {
            const previewModal = document.getElementById('previewModal');
            if (previewModal && previewModal.dataset.documentCid) {
                downloadDecryptedRecord(previewModal.dataset.documentCid, previewModal.dataset.encryptedCid);
            }
        });
    }

    if (!previewModal) {
        console.error('Preview modal not found in HTML');
        return;
    }

    previewTitle.innerText = `Preview: ${fileName}`;
    previewContent.innerHTML = '';

    if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
        img.style.objectFit = 'contain';
        previewContent.appendChild(img);
    }
    else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '70vh';
        iframe.style.border = 'none';
        previewContent.appendChild(iframe);
    }
    else if (fileType.includes('text') || fileName.match(/\.(txt|json|xml|html|css|js)$/i)) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const pre = document.createElement('pre');
            pre.textContent = e.target.result;
            pre.style.maxHeight = '60vh';
            pre.style.overflow = 'auto';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordWrap = 'break-word';
            pre.style.background = '#f5f5f5';
            pre.style.padding = '1rem';
            pre.style.borderRadius = '8px';
            previewContent.appendChild(pre);
        };
        reader.readAsText(blob);
    }
    else {
        previewContent.innerHTML = `
            <div class="preview-info">
                <i class="fas fa-file" style="font-size: 4rem; color: #1a5276;"></i>
                <h3>${escapeHtml(fileName)}</h3>
                <p>File Type: ${fileType}</p>
                <p>File Size: ${formatFileSize(blob.size)}</p>
                <p>This file type cannot be previewed directly.</p>
                <button class="btn-primary" onclick="downloadDecryptedRecord('${documentCid}', '${encryptedCid}')">
                    <i class="fas fa-download"></i> Download File
                </button>
            </div>
        `;
    }

    previewModal.dataset.blobUrl = url;
    previewModal.dataset.documentCid = documentCid;
    previewModal.dataset.encryptedCid = encryptedCid;
    previewModal.style.display = 'flex';
}

// Close preview modal
function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        if (modal.dataset.blobUrl) {
            URL.revokeObjectURL(modal.dataset.blobUrl);
        }
        modal.style.display = 'none';
        const previewContent = document.getElementById('previewContent');
        if (previewContent) previewContent.innerHTML = '';
    }
}

// Download decrypted file from preview
async function downloadDecryptedRecord(documentCid, encryptedCid) {
    showLoading('Preparing download...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) throw new Error('Access record not found');
        if (!accessRecord.ciphertextId) throw new Error('Ciphertext ID not found');

        const ciphertextId = accessRecord.ciphertextId;

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });
        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });
        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });
        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
        a.click();
        URL.revokeObjectURL(url);

        showSuccess('File downloaded successfully!');
        closePreviewModal();

    } catch (err) {
        console.error('Download error:', err);
        showError('Failed to download: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== DECRYPT AND OPEN RECORD ==========
async function decryptAndOpenRecord() {
    if (!currentDecryptRecord.cid || !currentDecryptRecord.encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing decryption...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === currentDecryptRecord.cid);

        if (!accessRecord) {
            throw new Error('Access record not found for CID: ' + currentDecryptRecord.cid);
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) {
            throw new Error('Failed to generate rekey');
        }

        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;
        console.log('✅ Rekey generated:', rekeyId);

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) {
            throw new Error('Failed to proxy re-encrypt');
        }

        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;
        console.log('✅ Proxy re-encrypted:', transformedId);

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) {
            const errorData = await decryptResponse.text();
            console.error('Server side error details:', errorData);
            throw new Error(`Decryption failed with status ${decryptResponse.status}`);
        }

        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;
        console.log('✅ Decryption successful');

        const encryptedResult = await window.electronAPI.getFromIPFS(currentDecryptRecord.cid);
        if (!encryptedResult.success) {
            throw new Error('Failed to download encrypted record');
        }

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';

        if (fileType.includes('text') || fileType.includes('json') || fileType.includes('pdf')) {
            window.open(url, '_blank');
            showSuccess('Record decrypted and opened');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
            a.click();
            URL.revokeObjectURL(url);
            showSuccess('Record decrypted and downloaded');
        }

        closeDecryptModal();

    } catch (err) {
        console.error('Decryption error:', err);
        showError('Failed to decrypt record: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== UTILITIES ==========
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);


}

function hideLoading() {
    const el = document.getElementById('global-loading');
    if (el) el.remove();
}

function showError(msg) {
    showToast(msg, 'error');
}

function showSuccess(msg) {
    showToast(msg, 'success');
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Make functions global for HTML
window.closePreviewModal = closePreviewModal;
window.downloadDecryptedRecord = downloadDecryptedRecord;

console.log('✅ Doctor dashboard initialized successfully');


*/

// doctor.js - Complete Doctor Dashboard (FIXED)
// doctor.js - Complete Doctor Dashboard (FIXED)

console.log('Doctor dashboard initializing...');

window.currentUser = null;
let currentDecryptRecord = { cid: null, encryptedCid: null };

document.addEventListener('DOMContentLoaded', async () => {
    let attempts = 0;
    while (typeof window.MediChainCrypto === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof window.MediChainCrypto === 'undefined') {
        console.error('MediChainCrypto not loaded!');
        showError('Crypto library not available. Please refresh the page.');
        return;
    }

    await checkSession();
    await loadDashboardData();
    attachEventListeners();
    setupNavigation();
});

async function checkSession() {
    try {
        const session = await window.electronAPI.getSession();
        if (!session || session.type !== 'doctor') {
            window.location.href = '../login.html';
            return false;
        }
        window.currentUser = session;

        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserDid = document.getElementById('sidebarUserDid');

        if (sidebarUserName) sidebarUserName.innerText = session.name || 'Doctor';
        if (sidebarUserDid) sidebarUserDid.innerText = shortenDid(session.did);

        // Register doctor with ALL possible attributes
        try {
            await fetch('http://127.0.0.1:5000/register_doctor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_did: session.did,
                    attributes: ["doctor", "cardiologist", "neurologist", "pediatrician", "surgeon", "dermatologist", "ophthalmologist", "psychiatrist"]
                })
            });
            console.log("✅ Doctor registered with Proxy memory");
        } catch (e) {
            console.error("❌ Failed to connect to Python Proxy:", e);
        }

        return true;
    } catch (error) {
        console.error('Session check error:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });

            const pageTitle = document.getElementById('pageTitle');

            if (pageName === 'dashboard') {
                document.getElementById('dashboardPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Dashboard';
                loadDashboardStats();
            } else if (pageName === 'shared') {
                document.getElementById('sharedPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Shared Records';
                loadSharedRecords();
            } else if (pageName === 'requests') {
                document.getElementById('requestsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Access Requests';
                loadAccessRequests();
            } else if (pageName === 'authorizations') {
                document.getElementById('authorizationsPage').classList.add('active');
                if (pageTitle) pageTitle.innerText = 'Authorizations';
                loadAuthorizations();
            }
        });
    });
}

function attachEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const sendAccessRequestBtn = document.getElementById('sendAccessRequestBtn');
    const decryptRecordBtn = document.getElementById('decryptRecordBtn');
    const cancelDecryptBtn = document.getElementById('cancelDecryptBtn');
    const closeDecryptModalBtn = document.getElementById('closeDecryptModalBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.electronAPI.logout();
            window.location.href = '../login.html';
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardData();
            showSuccess('Dashboard refreshed');
        });
    }

    if (sendAccessRequestBtn) {
        sendAccessRequestBtn.addEventListener('click', () => {
            sendAccessRequest();
        });
    }

    if (decryptRecordBtn) {
        decryptRecordBtn.addEventListener('click', () => {
            decryptAndOpenRecord();
        });
    }

    if (cancelDecryptBtn) {
        cancelDecryptBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    if (closeDecryptModalBtn) {
        closeDecryptModalBtn.addEventListener('click', () => {
            closeDecryptModal();
        });
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('decryptModal');
        if (e.target === modal) closeDecryptModal();
    });

    const deleteAllBtn = document.getElementById('deleteAllBtn');

if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ Delete ALL shared records permanently?\n\nThis action cannot be undone.');
        if (!confirmed) return;
        
        try {
            const session = window.currentUser || await window.electronAPI.getSession();
            if (!session || !session.did) {
                showError('No session found');
                return;
            }
            
            await window.electronAPI.storeSet('doctorAccesses:' + session.did, []);
            localStorage.clear();
            showSuccess('All records deleted successfully!');
            
            // Reload after short delay
            setTimeout(() => location.reload(), 500);
        } catch (err) {
            console.error('Delete error:', err);
            showError('Failed to delete records: ' + err.message);
        }
    });
}
}

async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        await loadSharedRecords();
        await loadDashboardStats();
        await loadAccessRequests();
    } catch (err) {
        console.error('Load dashboard error:', err);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

async function loadDashboardStats() {
    try {
        const records = JSON.parse(localStorage.getItem('sharedWithMe') || '[]');
        const now = Date.now() / 1000;
        const activeAccesses = records.filter(r => r.isActive && Number(r.expiryTime) > now).length;
        const uniquePatients = new Set(records.map(r => r.patientDid)).size;
        const expiringSoon = records.filter(r => {
            const exp = Number(r.expiryTime);
            return exp > now && (exp - now) < 7 * 24 * 3600;
        }).length;

        const totalRecordsEl = document.getElementById('totalRecords');
        const activeAccessesEl = document.getElementById('activeAccesses');
        const totalPatientsEl = document.getElementById('totalPatients');
        const expiringSoonEl = document.getElementById('expiringSoon');
        const sharedBadge = document.getElementById('sharedBadge');

        if (totalRecordsEl) totalRecordsEl.innerText = records.length;
        if (activeAccessesEl) activeAccessesEl.innerText = activeAccesses;
        if (totalPatientsEl) totalPatientsEl.innerText = uniquePatients;
        if (expiringSoonEl) expiringSoonEl.innerText = expiringSoon;
        if (sharedBadge) sharedBadge.innerText = records.length;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function sendAccessRequest() {
    const patientDid = document.getElementById('requestPatientDid')?.value.trim();
    const message = document.getElementById('requestMessageText')?.value.trim();

    if (!patientDid) {
        showError('Please enter Patient DID');
        return;
    }

    showLoading('Sending access request...');
    try {
        const result = await window.electronAPI.sendNotification({
            toDid: patientDid,
            message: message || `Dr. ${window.currentUser.name} requests access to your medical records`,
            doctorName: window.currentUser.name,
            doctorDid: window.currentUser.did,
            type: 'access_request',
            timestamp: new Date().toISOString()
        });

        if (result.success) {
            showSuccess('Access request sent successfully!');
            const patientDidInput = document.getElementById('requestPatientDid');
            const messageText = document.getElementById('requestMessageText');
            if (patientDidInput) patientDidInput.value = '';
            if (messageText) messageText.value = '';
        } else {
            throw new Error(result.error || 'Failed to send request');
        }
    } catch (err) {
        console.error('Send request error:', err);
        showError('Failed to send request: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== LOAD SHARED RECORDS ==========
async function loadSharedRecords() {
    const container = document.getElementById('sharedRecordsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        console.log('Doctor accesses:', result);

        const accesses = result.success ? (result.accesses || []) : [];

        localStorage.setItem('sharedWithMe', JSON.stringify(accesses));

        if (accesses.length === 0) {
            container.innerHTML = '<div class="no-data">No records shared with you yet.</div>';
            return;
        }

        let html = '';
        for (const access of accesses) {
            const expiryTimeSec = Number(access.expiryTime);
            const expiryDate = new Date(expiryTimeSec * 1000);
            const isExpired = expiryDate < new Date();
            const daysLeft = Math.ceil((expiryTimeSec * 1000 - Date.now()) / (1000 * 3600 * 24));

            // Check if storage method is pinata
            const isPinata = access.storageMethod === 'pinata';

            html += `
                <div class="record-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-file-medical-alt"></i></div>
                        <span class="record-status ${isExpired ? 'status-expired' : 'status-active'}">
                            ${isExpired ? 'Expired' : 'Active'}
                        </span>
                        ${isPinata ? '<span class="badge-pinata" style="background:#6c5ce7; color:white; padding:2px 8px; border-radius:12px; font-size:11px;"><i class="fas fa-cloud"></i> Pinata</span>' : ''}
                    </div>
                    <div class="record-info">
                        <h4>${escapeHtml(access.filename || 'Medical Record')}</h4>
                        <p><i class="fas fa-user"></i> Patient: ${shortenDid(access.patientDid)}</p>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        ${!isExpired ? `<p><i class="fas fa-clock"></i> ${daysLeft} days left</p>` : ''}
                       
                    </div>
                    <div class="record-actions" style="display: flex; gap: 0.5rem;">
                       
                        <button class="btn-primary" onclick="window.previewRecordViaPinata('${access.documentCid}', '${access.encryptedCid}')" style="flex: 1; background: #6c5ce7;">
                            <i class="fas fa-cloud-upload-alt"></i> Preview
                        </button>
                        
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        const sharedBadge = document.getElementById('sharedBadge');
        if (sharedBadge) sharedBadge.innerText = accesses.length;
        await loadDashboardStats();
    } catch (err) {
        console.error('Error loading shared records:', err);
        container.innerHTML = '<div class="no-data">Error loading records: ' + err.message + '</div>';
    }
}


// ========== PREVIEW RECORD VIA PINATA (WORKING VERSION) ==========
// ========== PREVIEW RECORD VIA PINATA (WITH ADVANCED FHIR CLINICAL DASHBOARD) ==========
window.previewRecordViaPinata = async function (documentCid, encryptedCid) {
    console.log('🔵 PINATA PREVIEW - START');
    if (!documentCid || !encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Loading from Pinata...');

    try {
        // 1. Fetch access records
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);
        if (!accessRecord) throw new Error('Access record not found');
        if (!accessRecord.ciphertextId) throw new Error('No ciphertextId associated with access');

        console.log('1. Ciphertext ID:', accessRecord.ciphertextId);

        // 2. Request re-encryption key from Proxy Re-Encryption node
        console.log('2. Requesting PRE rekey shares...');
        const rekeyRes = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: accessRecord.ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });
        if (!rekeyRes.ok) throw new Error('Proxy Rekey failed: ' + await rekeyRes.text());
        const rekey = await rekeyRes.json();

        // 3. Perform Proxy Re-Encryption
        console.log('3. Triggering proxy re-encryption transformation...');
        const reencryptRes = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekey.rekey_id })
        });
        if (!reencryptRes.ok) throw new Error('Proxy transformation execution failed');
        const reencrypt = await reencryptRes.json();

        // 4. Decrypt the symmetric AES key using Doctor's Private Keys
        console.log('4. Performing localized AES key decryption...');
        const decryptRes = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: reencrypt.transformed_ct_id,
                doctor_did: window.currentUser.did
            })
        });
        if (!decryptRes.ok) throw new Error('Decryption of symmetric asset key failed');
        const decryptResult = await decryptRes.json();

        const aesKeyBase64 = decryptResult.aes_key_b64;
        console.log('5. Symmetric decipher key loaded safely.');

        // 5. Download payload raw encrypted content from Pinata IPFS gateway
        console.log('6. Downloading payload stream from Pinata IPFS Gateway:', documentCid);
        const fileResult = await window.electronAPI.pinataGet(documentCid);

        if (!fileResult || !fileResult.success) {
            throw new Error('IPFS storage fetch execution failed: ' + (fileResult?.error || 'Empty stream output'));
        }

        // 6. Convert incoming base64 document structure back to raw bytes
        let encryptedBytes;
        try {
            encryptedBytes = Uint8Array.from(atob(fileResult.data.data), c => c.charCodeAt(0));
        } catch (e) {
            encryptedBytes = new Uint8Array(fileResult.data.data.length);
            for (let i = 0; i < fileResult.data.data.length; i++) {
                encryptedBytes[i] = fileResult.data.data.charCodeAt(i);
            }
        }

        // 7. Import raw symmetric cryptographic material natively
        const aesKey = await window.crypto.subtle.importKey(
            'raw',
            Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0)),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        // 8. Isolate initialization vector array sequence and run AES-GCM matrix decryption
        const iv = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            ciphertext
        );
        const decryptedData = new Uint8Array(decryptedBuffer);
        console.log('7. Payload block decrypted successfully. Payload size:', decryptedData.length);

        // 9. Process presentation containers inside the application workspace
        const blob = new Blob([decryptedData]);
        const fileType = fileResult.data.fileType || 'application/octet-stream';
        const fileName = fileResult.data.filename?.replace('.enc', '') || 'medical_record.json';
        
        const url = URL.createObjectURL(blob);
        const previewModal = document.getElementById('previewModal');
        const previewContent = document.getElementById('previewContent');
        const previewTitle = document.getElementById('previewTitle');

        if (!previewModal || !previewContent) {
            throw new Error('Required Document Workspace Modal Components are missing from the DOM.');
        }

        previewTitle.innerText = `Electronic Health Record Viewer: ${fileName}`;
        previewContent.innerHTML = '';

        // Handle Image payloads
        if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            const img = document.createElement('img');
            img.src = url;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '70vh';
            img.style.objectFit = 'contain';
            previewContent.appendChild(img);
        }
        // Handle PDF document payloads
        else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.style.width = '100%';
            iframe.style.height = '70vh';
            iframe.style.border = 'none';
            previewContent.appendChild(iframe);
        }
        // Handle Text/Structured JSON Electronic Health Records (FHIR Engine Integration)
       // =======================================================================
        // DYNAMIC PREVIEW ENGINE (Handles standard files vs. widescreen EHR data)
        // =======================================================================
        // =======================================================================
        // DYNAMIC PATIENT CHART PREVIEW ENGINE (FHIR Parsing & Template Injection)
        // =======================================================================
        // =======================================================================
        // CLINICAL DASHBOARD PREVIEW ENGINE (High-Fidelity EHR Viewer)
        // =======================================================================
        else {
            const text = await blob.text();
            const modalWindow = document.getElementById('previewModal');
            const modalContentBox = modalWindow ? (modalWindow.querySelector('.modal-content') || previewContent.parentElement) : null;
            
            try {
                const fhirBundle = JSON.parse(text);
                
                if (fhirBundle.resourceType === "Bundle" && Array.isArray(fhirBundle.entry)) {
                    
                    // Expand modal frame into a sprawling high-resolution dashboard
                    if (modalContentBox) {
                        modalContentBox.style.setProperty('width', '98%', 'important');
                        modalContentBox.style.setProperty('max-width', '1680px', 'important');
                        modalContentBox.style.setProperty('margin', '1rem auto', 'important');
                        modalContentBox.style.setProperty('border-radius', '16px', 'important');
                        modalContentBox.style.setProperty('transition', 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 'important');
                    }
                    
                    previewContent.style.overflowY = 'auto';
                    previewContent.style.maxHeight = '84vh';
                    previewContent.style.width = '100%';
                    previewContent.style.padding = '0';
                    previewContent.style.background = '#f8fafc';

                    // Parse all comprehensive clinical modules matching read-and-print-ehr.txt
                    const data = {
                        Patient: [], Condition: [], Observation: [], AllergyIntolerance: [],
                        MedicationRequest: [], Encounter: [], Procedure: [], Immunization: [],
                        CarePlan: [], DocumentReference: [], CareTeam: [], Claim: []
                    };
                    
                    fhirBundle.entry.forEach(e => {
                        if (e.resource && data[e.resource.resourceType]) {
                            data[e.resource.resourceType].push(e.resource);
                        }
                    });

                    // Demographic variables handling
                    const patient = data.Patient[0] || {};
                    const nameObj = patient.name?.[0] || {};
                    const ptName = `${(nameObj.given || []).join(' ')} ${nameObj.family || ''}`.trim() || patient.id || 'Unknown Patient';
                    const dob = patient.birthDate || '—';
                    const gender = patient.gender ? patient.gender.toUpperCase() : '—';
                    const mrn = patient.id || '—';
                    
                    const phone = patient.telecom?.find(t => t.system === 'phone')?.value || '—';
                    const email = patient.telecom?.find(t => t.system === 'email')?.value || '—';
                    const marital = patient.maritalStatus?.text || '—';
                    const lang = patient.communication?.[0]?.language?.text || '—';
                    const addrObj = patient.address?.[0] || {};
                    const addressStr = `${addrObj.line ? addrObj.line.join(', ') : ''} ${addrObj.city || ''} ${addrObj.state || ''} ${addrObj.postalCode || ''}`.trim() || '—';
                    
                    const bloodObs = data.Observation.find(o => o.code?.text?.toLowerCase().includes('blood type') || o.code?.text?.toLowerCase().includes('blood group'));
                    const bloodType = bloodObs ? (bloodObs.valueString || bloodObs.valueCodeableConcept?.text || '—') : '—';

                    // Filtering structured observations
                    const vitalsObs = data.Observation.filter(o => o.category?.some(c => c.coding?.some(cd => cd.code === 'vital-signs')) || o.code?.text?.toLowerCase().includes('blood pressure') || o.code?.text?.toLowerCase().includes('body weight'));
                    const labObs = data.Observation.filter(o => o.category?.some(c => c.coding?.some(cd => cd.code === 'laboratory')) || o.code?.text?.toLowerCase().includes('hemoglobin') || o.code?.text?.toLowerCase().includes('cholesterol'));

                    // Render UI Dashboard layout 
                    previewContent.innerHTML = `
                        <style>
                            .ehr-dashboard-container {
                                font-family: 'Inter', -apple-system, sans-serif;
                                color: #0f172a;
                                background: #f8fafc;
                                display: flex;
                                flex-direction: column;
                                gap: 10px;
                                padding: 8px;
                                text-align: left;
                                box-sizing: border-box;
                            }

                            /* Patient Command Bar Header */
                            .clinical-header-banner {
                                background: #ffffff;
                                border: 1px solid #e2e8f0;
                                border-radius: 14px;
                                padding: 24px 28px;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                            }
                            .pt-profile-identity h2 { margin: 0; font-size: 1.6rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
                            .pt-profile-identity p { margin: 6px 0 0 0; color: #64748b; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
                            
                            .banner-vitals-meta { display: flex; align-items: center; gap: 20px; }
                            .clinical-capsule-row { display: flex; gap: 12px; }
                            .clinical-capsule { background: #f1f5f9; padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
                            .capsule-lbl { font-size: 0.65rem; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.04em; }
                            .capsule-val { font-size: 0.95rem; font-weight: 600; color: #0f172a; margin-top: 1px; }

                            .btn-action-print {
                                background: #0f172a; color: #ffffff; border: none; padding: 10px 18px;
                                border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer;
                                display: flex; align-items: center; gap: 8px; transition: all 0.15s ease;
                            }
                            .btn-action-print:hover { background: #1e293b; transform: translateY(-1px); }

                            /* Asymmetric Grid Matrix layout */
                            .dashboard-split-matrix { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; width: 100%; box-sizing: border-box; }
                            .matrix-column { display: flex; flex-direction: column; gap: 24px; }
                            
                            /* Interactive Medical Cards */
                            .medical-section-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.01); overflow: hidden; }
                            .card-clinical-title { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fafafa; display: flex; align-items: center; justify-content: space-between; }
                            .card-clinical-title h3 { margin: 0; font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: flex; align-items: center; gap: 8px; }
                            .card-badge-counter { background: #e2e8f0; color: #475569; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 700; }
                            .card-panel-body { padding: 20px; }

                            /* Demographics Field Distribution matrix */
                            .demographics-data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                            .patient-field-cell { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 14px; border-radius: 8px; }
                            .patient-field-cell.span-all { grid-column: 1 / -1; }
                            .field-lbl { font-size: 0.65rem; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 2px; }
                            .field-val { font-size: 0.88rem; font-weight: 600; color: #0f172a; word-break: break-all; }
                            .text-accent { color: #2563eb; }

                            /* Unified Clean Structured Tables */
                            .clinical-data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
                            .clinical-data-table th { padding: 10px 12px; background: #f8fafc; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
                            .clinical-data-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #334155; }
                            .clinical-data-table tr:last-child td { border-bottom: none; }
                            .clinical-data-table tr:hover td { background: #f8fafc; }

                            /* Color Coded Status Tags */
                            .clinical-status-tag { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; border: 1px solid transparent; }
                            .tag-danger { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
                            .tag-success { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
                            .tag-warning { background: #fffbeb; color: #d97706; border-color: #fef3c7; }
                            .tag-neutral { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }

                            /* Vital Signs Strips Cards widget */
                            .vitals-grid-layout { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
                            .vital-widget-box { border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 8px; padding: 12px; background: #ffffff; }
                            .vital-widget-box.alert-trigger { border-left-color: #dc2626; background: #fef2f2; }
                            .vital-widget-lbl { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748b; }
                            .vital-widget-val { font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 2px 0; letter-spacing: -0.01em; }
                            .vital-widget-time { font-size: 0.65rem; color: #94a3b8; }

                            /* Flow Timelines nodes styles */
                            .clinical-timeline-flow { display: flex; flex-direction: column; gap: 14px; }
                            .timeline-clinical-node { border-left: 3px solid #e2e8f0; padding-left: 14px; position: relative; }
                            .timeline-clinical-node.condition-node { border-left-color: #dc2626; }
                            .timeline-clinical-node.medication-node { border-left-color: #16a34a; }
                            .timeline-clinical-node.encounter-node { border-left-color: #0284c7; }
                            .node-main-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
                            .node-meta-desc { font-size: 0.75rem; color: #64748b; margin-top: 3px; font-family: monospace; }

                            /* ======================================================= */
                            /* PROFESSIONAL PRINT ARCHITECTURE                       */
                            /* ======================================================= */
                            @media print {
                                body * { visibility: hidden !important; }
                                #previewModal, #previewModal *, .ehr-dashboard-container, .ehr-dashboard-container * { visibility: visible !important; }
                                #previewModal { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
                                .modal-content { border: none !important; box-shadow: none !important; width: 100% !important; max-width: 100% !important; }
                                .btn-action-print, .modal-footer, [id*="close"] { display: none !important; }
                                .dashboard-split-matrix { display: grid !important; grid-template-columns: 1.4fr 1fr !important; gap: 16px !important; width: 100% !important; }
                                .medical-section-card { page-break-inside: avoid !important; border: 1px solid #cbd5e1 !important; }
                            }
                        </style>

                        <div class="ehr-dashboard-container">
                            
                            <!-- Master Profile Banner Strip -->
                            <div class="clinical-header-banner">
                                <div class="pt-profile-identity">
                                    <h2>${ptName}</h2>
                                    <p>FHIR Medical Record Number (MRN): ${mrn}</p>
                                </div>
                                <div class="banner-vitals-meta">
                                    <div class="clinical-capsule-row">
                                        <div class="clinical-capsule">
                                            <div class="capsule-lbl">Date of Birth </div>
                                            <div class="capsule-val">${dob}</div>
                                        </div>
                                        <div class="clinical-capsule">
                                            <div class="capsule-lbl">Gender Identity </div>
                                            <div class="capsule-val">${gender}</div>
                                        </div>
                                        <div class="clinical-capsule">
                                            <div class="capsule-lbl">Blood Group </div>
                                            <div class="capsule-val" style="color:#dc2626; font-weight:800;">${bloodType}</div>
                                        </div>
                                    </div>
                                   
                                </div>
                            </div>

                            <!-- Dashboard Workspace Layout System  -->
                            <div class="dashboard-split-matrix">
                                
                                <!-- LEFT MAIN STREAM COLUMN  -->
                                <div class="matrix-column">
                                    
                                    <!-- Demographics Section Module  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                                Administrative & Demographics Records 
                                            </h3>
                                        </div>
                                        <div class="card-panel-body">
                                            <div class="demographics-data-grid">
                                                <div class="patient-field-cell"><div class="field-lbl">Legal Full Name </div><div class="field-val text-accent">${ptName}</div></div>
                                                <div class="patient-field-cell"><div class="field-lbl">Primary Telecom </div><div class="field-val">${phone}</div></div>
                                                <div class="patient-field-cell"><div class="field-lbl">Secure Email Account </div><div class="field-val">${email}</div></div>
                                                <div class="patient-field-cell"><div class="field-lbl">Marital Profile </div><div class="field-val">${marital}</div></div>
                                                <div class="patient-field-cell"><div class="field-lbl">Preferred Language </div><div class="field-val">${lang}</div></div>
                                                <div class="patient-field-cell"><div class="field-lbl">Internal Patient Identifier </div><div class="field-val" style="font-family:monospace; font-size:0.75rem;">${mrn}</div></div>
                                                <div class="patient-field-cell span-all"><div class="field-lbl">Confirmed Residential Address </div><div class="field-val">${addressStr}</div></div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Allergies Section Module  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#dc2626;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
                                                Allergies & Adverse Hypersensitivities 
                                            </h3>
                                            <span class="card-badge-counter" style="background:#fee2e2; color:#dc2626;">${data.AllergyIntolerance.length} Alerts</span> 
                                        </div>
                                        <div class="card-panel-body" style="padding:0;">
                                            ${data.AllergyIntolerance.length === 0 ? '<div style="padding:20px; color:#16a34a; font-weight:600; font-size:0.85rem;">No recordable allergen sensitivities captured </div>' : `
                                                <table class="clinical-data-table">
                                                    <thead><tr><th>Allergen Substance </th><th>Severity Impact </th><th>Verification </th><th>Recorded Date </th></tr></thead>
                                                    <tbody>
                                                        ${data.AllergyIntolerance.map(a => `
                                                            <tr>
                                                                <td><strong style="color:#dc2626;">${a.code?.coding?.[0]?.display || a.code?.text || 'Unspecified Compound'}</strong></td>
                                                                <td><span class="clinical-status-tag tag-danger">${a.reaction?.[0]?.severity || 'unknown'}</span></td>
                                                                <td><span class="clinical-status-tag tag-neutral">${a.clinicalStatus?.coding?.[0]?.code || 'active'}</span></td>
                                                                <td>${a.recordedDate ? a.recordedDate.split('T')[0] : '—'}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            `}
                                        </div>
                                    </div>

                                    <!-- Vital Signs Metrics Grid  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#16a34a;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                                Physiological Vital Signs (Latest Measurements) 
                                            </h3>
                                        </div>
                                        <div class="card-panel-body">
                                            <div class="vitals-grid-layout">
                                                ${vitalsObs.slice(0, 12).map(v => {
                                                    const name = v.code?.coding?.[0]?.display || v.code?.text || 'Vital Metric';
                                                    let reading = '—';
                                                    if (v.valueQuantity) reading = `${parseFloat(v.valueQuantity.value).toFixed(1)} ${v.valueQuantity.unit || ''}`;
                                                    else if (v.component) reading = v.component.map(c => parseFloat(c.valueQuantity?.value || 0).toFixed(0)).join('/');
                                                    
                                                    return `
                                                        <div class="vital-widget-box">
                                                            <div class="vital-widget-lbl">${name}</div>
                                                            <div class="vital-widget-val">${reading}</div>
                                                            <div class="vital-widget-time">${v.effectiveDateTime ? v.effectiveDateTime.split('T')[0] : '—'}</div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Lab Results Block  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#d97706;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                                Laboratory Diagnostic Findings 
                                            </h3>
                                            <span class="card-badge-counter" style="background:#fef3c7; color:#d97706;">${labObs.length} Tests</span> 
                                        </div>
                                        <div class="card-panel-body" style="padding:0;">
                                            <table class="clinical-data-table">
                                                <thead><tr><th>Diagnostic Evaluation </th><th>Observed Quant </th><th>Evaluation Flag </th><th>Timestamp </th></tr></thead>
                                                <tbody>
                                                    ${labObs.slice(0, 10).map(l => {
                                                        const name = l.code?.coding?.[0]?.display || l.code?.text || 'Lab Metric';
                                                        const val = l.valueQuantity ? `${parseFloat(l.valueQuantity.value).toFixed(2)} ${l.valueQuantity.unit || ''}` : '—';
                                                        const interp = l.interpretation?.[0]?.coding?.[0]?.code || 'N';
                                                        const isAbnormal = interp !== 'N';
                                                        return `<tr>
                                                            <td><strong>${name}</strong></td>
                                                            <td style="font-weight:700; ${isAbnormal ? 'color:#dc2626;' : 'color:#16a34a;'}">${val}</td>
                                                            <td><span class="clinical-status-tag ${isAbnormal ? 'tag-danger' : 'tag-success'}">${isAbnormal ? 'Abnormal' : 'Normal'}</span></td>
                                                            <td>${l.effectiveDateTime ? l.effectiveDateTime.split('T')[0] : '—'}</td>
                                                        </tr>`;
                                                    }).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <!-- Care Plan Directive Section  -->
                                    ${data.CarePlan.length === 0 ? '' : `
                                        <div class="medical-section-card">
                                            <div class="card-clinical-title">
                                                <h3>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                                    Active Coordinated Care Framework 
                                                </h3>
                                            </div>
                                            <div class="card-panel-body">
                                                ${data.CarePlan.map(cp => `
                                                    <div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:8px; margin-bottom:10px;">
                                                        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                                            <strong style="color:#0f172a;">${cp.category?.[0]?.coding?.[0]?.display || 'General Care Strategy'}</strong>
                                                            <span class="clinical-status-tag tag-success">${cp.status || 'active'}</span>
                                                        </div>
                                                        <div style="font-size:0.8rem; color:#475569; line-height:1.5;">
                                                            ${cp.activity?.map(a => `• ${a.detail?.code?.coding?.[0]?.display || a.detail?.code?.text || 'Plan Target Action'}`).join('<br>') || 'No targeted plan objectives declared.'}
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `}
                                </div>

                                <!-- RIGHT FOCUS-TRACKING SIDE COLUMN  -->
                                <div class="matrix-column">
                                    
                                    <!-- Active Conditions Problem Ledger  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#dc2626;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                                Active Conditions & Problems Ledger 
                                            </h3>
                                        </div>
                                        <div class="card-panel-body">
                                            <div class="clinical-timeline-flow">
                                                ${data.Condition.length === 0 ? '<p style="color:#64748b; margin:0;">No clinically mapped pathologies tracked.</p>' : data.Condition.map(c => `
                                                    <div class="timeline-clinical-node condition-node">
                                                        <div class="node-main-title">${c.code?.coding?.[0]?.display || c.code?.text || 'Unrecognized Disease Code'}</div>
                                                        <div class="node-meta-desc">Onset Verification: ${c.onsetDateTime ? c.onsetDateTime.split('T')[0] : 'Active Diagnoses'}</div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Outpatient Pharmacotherapy Orders  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#16a34a;"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
                                                Active Outpatient Prescriptions Ledger 
                                            </h3>
                                        </div>
                                        <div class="card-panel-body">
                                            <div class="clinical-timeline-flow">
                                                ${data.MedicationRequest.length === 0 ? '<p style="color:#64748b; margin:0;">No active medication requirements deployed.</p>' : data.MedicationRequest.map(m => `
                                                    <div class="timeline-clinical-node medication-node">
                                                        <div class="node-main-title">${m.medicationCodeableConcept?.coding?.[0]?.display || m.medicationCodeableConcept?.text || 'Prescribed Compound'}</div>
                                                        <div class="node-meta-desc">Dosage Regimen: ${m.dosageInstruction?.[0]?.text || 'As clinically requested'}</div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Encounters/Historical Visits Ledger  -->
                                    <div class="medical-section-card">
                                        <div class="card-clinical-title">
                                            <h3>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                                Historical Clinical Encounters 
                                            </h3>
                                        </div>
                                        <div class="card-panel-body" style="padding:0;">
                                            <table class="clinical-data-table">
                                                <thead><tr><th>Encounter </th><th>Date </th><th>Primary Reason </th></tr></thead>
                                                <tbody>
                                                    ${data.Encounter.slice(0, 5).map(e => `
                                                        <tr>
                                                            <td><strong style="text-transform:capitalize;">${e.class?.code || 'Outpatient'}</strong></td>
                                                            <td>${e.period?.start ? e.period.start.split('T')[0] : '—'}</td>
                                                            <td style="color:#64748b; font-size:0.78rem;">${e.reasonCode?.[0]?.coding?.[0]?.display || 'Routine Checkup'}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <!-- Procedures Executed Module  -->
                                    ${data.Procedure.length === 0 ? '' : `
                                        <div class="medical-section-card">
                                            <div class="card-clinical-title"><h3>🔧 Procedures & Interventions </h3></div>
                                            <div class="card-panel-body" style="padding:0;">
                                                <table class="clinical-data-table">
                                                    <thead><tr><th>Procedure </th><th>Execution Date </th></tr></thead>
                                                    <tbody>
                                                        ${data.Procedure.slice(0, 4).map(p => `
                                                            <tr>
                                                                <td><strong>${p.code?.coding?.[0]?.display || p.code?.text}</strong></td>
                                                                <td>${p.performedPeriod?.start ? p.performedPeriod.start.split('T')[0] : '—'}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    `}
                                </div>

                            </div>
                        </div>
                    `;
                } else {
                    throw new Error("Target file structural template does not contain a standard FHIR array layout.");
                }
            } catch (err) {
                // Fallback architecture to reset standard non-EHR configuration sizes gracefully
                if (modalContentBox) {
                    modalContentBox.style.setProperty('width', '550px', 'important');
                    modalContentBox.style.setProperty('max-width', '90%', 'important');
                    modalContentBox.style.setProperty('margin', '4rem auto', 'important');
                }
                
                const pre = document.createElement('pre');
                pre.textContent = text;
                pre.style.cssText = "max-height:60vh; overflow:auto; background:#1e293b; color:#38bdf8; padding:16px; border-radius:8px; text-align:left; font-family:monospace; font-size:0.85rem;";
                previewContent.appendChild(pre);
            }
        }
        // Show layout workspace modal container
        previewModal.style.display = 'flex';
        
        const closeBtn = document.getElementById('closePreviewModalBtn');
        const closeFooterBtn = document.getElementById('closePreviewFooterBtn');

        const cleanup = () => {
            URL.revokeObjectURL(url);
            previewModal.style.display = 'none';
        };

        if (closeBtn) closeBtn.onclick = cleanup;
        if (closeFooterBtn) closeFooterBtn.onclick = cleanup;

        hideLoading();
        showSuccess('Electronic Health Record rendered successfully!');
    } catch (err) {
        console.error('❌ WORKSPACE PREVIEW RENDERING ERROR:', err);
        showError('Execution Framework Interrupted: ' + err.message);
        hideLoading();
    }
};
// Add warning toast function if not exists
function showWarning(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast warning';
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ========== LOAD ACCESS REQUESTS ==========
async function loadAccessRequests() {
    const container = document.getElementById('requestsList');
    if (!container) return;

    try {
        const notifs = await window.electronAPI.getNotifications();
        const requests = notifs.success ? (notifs.notifications || []).filter(n => n.type === 'access_request') : [];

        const requestBadge = document.getElementById('requestBadge');
        if (requestBadge) requestBadge.innerText = requests.length;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-data">No pending access requests</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < requests.length; i++) {
            const req = requests[i];
            html += `
                <div class="request-card">
                    <div class="request-info">
                        <h4><i class="fas fa-user"></i> From: ${escapeHtml(req.doctorName || 'Patient')}</h4>
                        <p><i class="fas fa-id-card"></i> DID: ${shortenDid(req.doctorDid || '')}</p>
                        <p><i class="fas fa-envelope"></i> ${escapeHtml(req.message)}</p>
                        <small><i class="fas fa-clock"></i> ${new Date(req.timestamp).toLocaleString()}</small>
                    </div>
                    
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load requests error:', err);
        container.innerHTML = '<div class="no-data">Error loading requests: ' + err.message + '</div>';
    }
}

// ========== LOAD AUTHORIZATIONS ==========
async function loadAuthorizations() {
    const container = document.getElementById('authorizationsList');
    if (!container) return;

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? (result.accesses || []) : [];
        const now = Date.now() / 1000;
        const activeAccesses = accesses.filter(a => a.isActive && Number(a.expiryTime) > now);

        if (activeAccesses.length === 0) {
            container.innerHTML = '<div class="no-data">No active authorizations</div>';
            return;
        }

        let html = '';
        for (const auth of activeAccesses) {
            const expiryDate = new Date(Number(auth.expiryTime) * 1000);
            html += `
                <div class="auth-card">
                    <div class="record-header">
                        <div class="record-icon"><i class="fas fa-key"></i></div>
                        <span class="record-status status-active">Active</span>
                    </div>
                    <div class="record-info">
                        <h4>Patient: ${shortenDid(auth.patientDid)}</h4>
                        <p><i class="fas fa-calendar"></i> Expires: ${expiryDate.toLocaleString()}</p>
                        <p><i class="fas fa-file"></i> Record CID: ${shortenDid(auth.documentCid)}</p>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Load authorizations error:', err);
        container.innerHTML = '<div class="no-data">Error loading authorizations</div>';
    }
}

// ========== RESPOND TO REQUESTS ==========
window.acceptRequest = async function (requestId) {
    showLoading('Accepting request...');
    try {
        showSuccess('Request accepted!');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to accept request');
    } finally {
        hideLoading();
    }
};

window.declineRequest = async function (requestId) {
    showLoading('Declining request...');
    try {
        showSuccess('Request declined');
        await loadAccessRequests();
    } catch (err) {
        showError('Failed to decline request');
    } finally {
        hideLoading();
    }
};

// ========== DECRYPT MODAL ==========
window.openDecryptModal = function (documentCid, encryptedCid) {
    currentDecryptRecord = {
        cid: documentCid,
        encryptedCid: encryptedCid
    };
    const modal = document.getElementById('decryptModal');
    const decryptCid = document.getElementById('decryptCid');

    if (decryptCid) decryptCid.innerText = shortenDid(documentCid);
    if (modal) modal.style.display = 'flex';
};

function closeDecryptModal() {
    const modal = document.getElementById('decryptModal');
    if (modal) modal.style.display = 'none';
    currentDecryptRecord = { cid: null, encryptedCid: null };
}

window.closeDecryptModal = closeDecryptModal;

// ========== PREVIEW RECORD ==========
window.previewRecord = async function (documentCid, encryptedCid) {
    if (!documentCid || !encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing preview...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) {
            throw new Error('Access record not found');
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        // Generate rekey
        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        // Proxy re-encrypt
        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        // Decrypt
        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        // Get encrypted file from IPFS
        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        // Decrypt the file
        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        // Display preview
        const blob = new Blob([decryptedData]);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';
        const fileName = encryptedResult.data.filename?.replace('.enc', '') || 'medical_record';

        showPreview(blob, fileType, fileName, documentCid, encryptedCid);

    } catch (err) {
        console.error('Preview error:', err);
        showError('Failed to preview record: ' + err.message);
    } finally {
        hideLoading();
    }
};

// Show preview modal
function showPreview(blob, fileType, fileName, documentCid, encryptedCid) {
    const url = URL.createObjectURL(blob);
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const previewTitle = document.getElementById('previewTitle');

    const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');
    const closePreviewFooterBtn = document.getElementById('closePreviewFooterBtn');
    const downloadFromPreviewBtn = document.getElementById('downloadFromPreviewBtn');

    if (closePreviewModalBtn) {
        closePreviewModalBtn.addEventListener('click', closePreviewModal);
    }
    if (closePreviewFooterBtn) {
        closePreviewFooterBtn.addEventListener('click', closePreviewModal);
    }
    if (downloadFromPreviewBtn) {
        downloadFromPreviewBtn.addEventListener('click', () => {
            const previewModal = document.getElementById('previewModal');
            if (previewModal && previewModal.dataset.documentCid) {
                downloadDecryptedRecord(previewModal.dataset.documentCid, previewModal.dataset.encryptedCid);
            }
        });
    }

    if (!previewModal) {
        console.error('Preview modal not found in HTML');
        return;
    }

    previewTitle.innerText = `Preview: ${fileName}`;
    previewContent.innerHTML = '';

    if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
        img.style.objectFit = 'contain';
        previewContent.appendChild(img);
    }
    else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '70vh';
        iframe.style.border = 'none';
        previewContent.appendChild(iframe);
    }
    else if (fileType.includes('text') || fileName.match(/\.(txt|json|xml|html|css|js)$/i)) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const pre = document.createElement('pre');
            pre.textContent = e.target.result;
            pre.style.maxHeight = '60vh';
            pre.style.overflow = 'auto';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordWrap = 'break-word';
            pre.style.background = '#f5f5f5';
            pre.style.padding = '1rem';
            pre.style.borderRadius = '8px';
            previewContent.appendChild(pre);
        };
        reader.readAsText(blob);
    }
    else {
        previewContent.innerHTML = `
            <div class="preview-info">
                <i class="fas fa-file" style="font-size: 4rem; color: #1a5276;"></i>
                <h3>${escapeHtml(fileName)}</h3>
                <p>File Type: ${fileType}</p>
                <p>File Size: ${formatFileSize(blob.size)}</p>
                <p>This file type cannot be previewed directly.</p>
                <button class="btn-primary" onclick="downloadDecryptedRecord('${documentCid}', '${encryptedCid}')">
                    <i class="fas fa-download"></i> Download File
                </button>
            </div>
        `;
    }

    previewModal.dataset.blobUrl = url;
    previewModal.dataset.documentCid = documentCid;
    previewModal.dataset.encryptedCid = encryptedCid;
    previewModal.style.display = 'flex';
}

// Close preview modal
function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        if (modal.dataset.blobUrl) {
            URL.revokeObjectURL(modal.dataset.blobUrl);
        }
        modal.style.display = 'none';
        const previewContent = document.getElementById('previewContent');
        if (previewContent) previewContent.innerHTML = '';
    }
}

// Download decrypted file from preview
async function downloadDecryptedRecord(documentCid, encryptedCid) {
    showLoading('Preparing download...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === documentCid);

        if (!accessRecord) throw new Error('Access record not found');
        if (!accessRecord.ciphertextId) throw new Error('Ciphertext ID not found');

        const ciphertextId = accessRecord.ciphertextId;

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });
        if (!rekeyResponse.ok) throw new Error('Failed to generate rekey');
        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });
        if (!reencryptResponse.ok) throw new Error('Failed to proxy re-encrypt');
        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });
        if (!decryptResponse.ok) throw new Error('Decryption failed');
        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;

        const encryptedResult = await window.electronAPI.getFromIPFS(documentCid);
        if (!encryptedResult.success) throw new Error('Failed to download encrypted record');

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
        a.click();
        URL.revokeObjectURL(url);

        showSuccess('File downloaded successfully!');
        closePreviewModal();

    } catch (err) {
        console.error('Download error:', err);
        showError('Failed to download: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== DECRYPT AND OPEN RECORD ==========
async function decryptAndOpenRecord() {
    if (!currentDecryptRecord.cid || !currentDecryptRecord.encryptedCid) {
        showError('No record selected');
        return;
    }

    showLoading('Preparing decryption...');

    try {
        const result = await window.electronAPI.getDoctorAccesses();
        const accesses = result.success ? result.accesses : [];
        const accessRecord = accesses.find(a => a.documentCid === currentDecryptRecord.cid);

        if (!accessRecord) {
            throw new Error('Access record not found for CID: ' + currentDecryptRecord.cid);
        }

        if (!accessRecord.ciphertextId) {
            throw new Error('Ciphertext ID not found. Please re-share the record.');
        }

        const ciphertextId = accessRecord.ciphertextId;
        console.log('✅ Using ciphertext ID:', ciphertextId);

        const rekeyResponse = await fetch('http://127.0.0.1:5000/generate_rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ct_id: ciphertextId,
                delegatee_did: window.currentUser.did,
                delegatee_attrs: ["doctor"]
            })
        });

        if (!rekeyResponse.ok) {
            throw new Error('Failed to generate rekey');
        }

        const rekeyResult = await rekeyResponse.json();
        const rekeyId = rekeyResult.rekey_id;
        console.log('✅ Rekey generated:', rekeyId);

        const reencryptResponse = await fetch('http://127.0.0.1:5000/proxy_reencrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });

        if (!reencryptResponse.ok) {
            throw new Error('Failed to proxy re-encrypt');
        }

        const reencryptResult = await reencryptResponse.json();
        const transformedId = reencryptResult.transformed_ct_id;
        console.log('✅ Proxy re-encrypted:', transformedId);

        const decryptResponse = await fetch('http://127.0.0.1:5000/decrypt_aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transformed_ct_id: transformedId,
                doctor_did: window.currentUser.did
            })
        });

        if (!decryptResponse.ok) {
            const errorData = await decryptResponse.text();
            console.error('Server side error details:', errorData);
            throw new Error(`Decryption failed with status ${decryptResponse.status}`);
        }

        const decryptResult = await decryptResponse.json();
        const aesKeyBase64 = decryptResult.aes_key_b64;
        console.log('✅ Decryption successful');

        const encryptedResult = await window.electronAPI.getFromIPFS(currentDecryptRecord.cid);
        if (!encryptedResult.success) {
            throw new Error('Failed to download encrypted record');
        }

        const encryptedData = Uint8Array.from(atob(encryptedResult.data.data), c => c.charCodeAt(0));
        const aesKey = await window.MediChainCrypto.importKey(aesKeyBase64);
        const decryptedData = await window.MediChainCrypto.decryptFile(encryptedData, aesKey);

        const blob = new Blob([decryptedData]);
        const url = URL.createObjectURL(blob);
        const fileType = encryptedResult.data.fileType || 'application/octet-stream';

        if (fileType.includes('text') || fileType.includes('json') || fileType.includes('pdf')) {
            window.open(url, '_blank');
            showSuccess('Record decrypted and opened');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = encryptedResult.data.filename?.replace('.enc', '') || 'decrypted_record';
            a.click();
            URL.revokeObjectURL(url);
            showSuccess('Record decrypted and downloaded');
        }

        closeDecryptModal();

    } catch (err) {
        console.error('Decryption error:', err);
        showError('Failed to decrypt record: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ========== UTILITIES ==========
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showLoading(msg) {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);


}

function hideLoading() {
    const el = document.getElementById('global-loading');
    if (el) el.remove();
}

function showError(msg) {
    showToast(msg, 'error');
}

function showSuccess(msg) {
    showToast(msg, 'success');
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Make functions global for HTML
window.closePreviewModal = closePreviewModal;
window.downloadDecryptedRecord = downloadDecryptedRecord;

console.log('✅ Doctor dashboard initialized successfully');
