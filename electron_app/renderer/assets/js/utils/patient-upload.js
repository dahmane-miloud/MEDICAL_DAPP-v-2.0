// patient-upload.js
let currentUser = null;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    setupEventListeners();
});

async function checkSession() {
    const session = await window.electronAPI.getSession();
    if (!session || session.type !== 'patient') {
        window.location.href = '../login.html';
        return;
    }
    currentUser = session;
    document.getElementById('userName').innerText = session.name || 'Patient';
    document.getElementById('userDid').innerText = shortenDid(session.did);
}

// Check if IPFS Desktop is running via HTTP API (using localhost)
async function isIPFSRunning() {
    try {
        const response = await fetch('http://localhost:5001/api/v0/id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            return data.ID && data.ID.length > 0;
        }
        return false;
    } catch (error) {
        console.error('IPFS check failed:', error);
        return false;
    }
}

// Upload file to IPFS using HTTP API (using localhost)
async function uploadToIPFS(fileBlob, filename) {
    const formData = new FormData();
    formData.append('file', fileBlob, filename);

    const response = await fetch('http://localhost:5001/api/v0/add', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`IPFS error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    if (!result.Hash) {
        throw new Error('No CID returned from IPFS');
    }
    return result.Hash;
}

function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => e.preventDefault());
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            addFiles(Array.from(e.dataTransfer.files));
        });
    }
    if (browseBtn) browseBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => addFiles(Array.from(e.target.files)));
    if (uploadBtn) uploadBtn.addEventListener('click', startUpload);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelUpload);

    window.removeFile = removeFile;
    window.copyCID = copyCID;
    window.copyKey = copyKey;
    window.closeSuccessModal = () => document.getElementById('successModal').style.display = 'none';
    window.uploadAnother = uploadAnother;
    window.goToDashboard = goToDashboard;
}

function addFiles(files) {
    for (let f of files) {
        selectedFiles.push(f);
    }
    updateFileList();
    if (selectedFiles.length) {
        document.getElementById('fileList').style.display = 'block';
        document.getElementById('recordInfoSection').style.display = 'block';
        document.getElementById('uploadBtn').disabled = false;
    }
}

function updateFileList() {
    const container = document.getElementById('selectedFiles');
    if (!container) return;
    let html = '';
    selectedFiles.forEach((f, idx) => {
        html += `<div class="file-item">
            <i class="fas ${getFileIcon(f.type)}"></i>
            <span>${escapeHtml(f.name)} (${formatFileSize(f.size)})</span>
            <i class="fas fa-times" onclick="removeFile(${idx})"></i>
        </div>`;
    });
    container.innerHTML = html;
}

function getFileIcon(type) {
    if (type.includes('pdf')) return 'fa-file-pdf';
    if (type.includes('image')) return 'fa-file-image';
    return 'fa-file';
}
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
}
function removeFile(idx) {
    selectedFiles.splice(idx, 1);
    updateFileList();
    if (!selectedFiles.length) {
        document.getElementById('fileList').style.display = 'none';
        document.getElementById('recordInfoSection').style.display = 'none';
        document.getElementById('uploadBtn').disabled = true;
    }
}

async function startUpload() {
    if (!selectedFiles.length) return;
    const recordType = document.getElementById('recordType').value;
    const recordDate = document.getElementById('recordDate').value;
    if (!recordType || !recordDate) {
        showError('Please fill record type and date');
        return;
    }

    // Check if IPFS Desktop is running
    showLoading('Checking IPFS connection...');
    const ipfsRunning = await isIPFSRunning();
    if (!ipfsRunning) {
        showError('❌ IPFS Desktop is NOT running. Please start IPFS Desktop and try again.');
        hideLoading();
        return;
    }
    showSuccess('✅ IPFS Desktop connected');
    hideLoading();

    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressStatus = document.getElementById('progressStatus');
    progressDiv.style.display = 'block';
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('cancelBtn').style.display = 'inline-block';

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        progressFill.style.width = `${(i / selectedFiles.length) * 100}%`;
        progressStatus.innerText = `Encrypting & uploading ${file.name}...`;

        try {
            // 1. Generate AES-256 key
            const aesKey = await CryptoUtils.generateAESKey();
            const aesKeyBase64 = await CryptoUtils.exportKey(aesKey);

            // 2. Encrypt file
            const encryptedData = await CryptoUtils.encryptFile(file, aesKey);
            const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

            // 3. Upload to IPFS Desktop using HTTP API
            const encryptedCID = await uploadToIPFS(encryptedBlob, file.name + '.enc');
            console.log('✅ Uploaded to IPFS, CID:', encryptedCID);

            // 4. Save record in localStorage
            const sharedRecords = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
            sharedRecords.push({
                id: Date.now(),
                filename: file.name,
                encryptedCID,
                aesKeyBase64,
                recordType,
                recordDate,
                uploadedAt: new Date().toISOString()
            });
            localStorage.setItem('sharedRecords', JSON.stringify(sharedRecords));

            showSuccessModal(encryptedCID, aesKeyBase64);
        } catch (err) {
            console.error(err);
            showError(`Upload failed for ${file.name}: ${err.message}`);
        }
    }
    progressDiv.style.display = 'none';
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('cancelBtn').style.display = 'none';
    resetUpload();
}

function showSuccessModal(cid, key) {
    document.getElementById('uploadedCid').innerText = cid;
    document.getElementById('uploadedKey').innerText = key;
    document.getElementById('successModal').style.display = 'flex';
}
function copyCID() {
    const cid = document.getElementById('uploadedCid').innerText;
    navigator.clipboard.writeText(cid).then(() => showSuccess('CID copied'));
}
function copyKey() {
    const key = document.getElementById('uploadedKey').innerText;
    navigator.clipboard.writeText(key).then(() => showSuccess('AES key copied'));
}
function resetUpload() {
    selectedFiles = [];
    updateFileList();
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('recordInfoSection').style.display = 'none';
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('recordType').value = '';
    document.getElementById('recordDate').value = '';
}
function cancelUpload() {
    if (confirm('Cancel upload? Progress will be lost.')) {
        resetUpload();
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('cancelBtn').style.display = 'none';
    }
}
function uploadAnother() {
    closeSuccessModal();
    resetUpload();
}
function goToDashboard() {
    window.location.href = 'dashboard.html';
}
function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}
function shortenDid(did) {
    if (!did) return '';
    return did.length > 20 ? did.slice(0, 10) + '...' + did.slice(-10) : did;
}
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
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
    document.getElementById('global-loading')?.remove();
}
function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }
function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}