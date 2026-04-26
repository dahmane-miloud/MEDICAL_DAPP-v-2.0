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

function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => e.preventDefault());
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            addFiles(Array.from(e.dataTransfer.files));
        });
    }
    if (browseBtn) browseBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => addFiles(Array.from(e.target.files)));
    if (uploadBtn) uploadBtn.addEventListener('click', startUpload);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelUpload);

    window.removeFile = removeFile;
    window.copyAESKey = copyAESKey;
    window.closeKeyModal = () => document.getElementById('keyModal').style.display = 'none';
}

function addFiles(files) {
    const maxSize = 10 * 1024 * 1024; // 10 MB
    for (let f of files) {
        if (f.size <= maxSize) selectedFiles.push(f);
        else alert(`${f.name} exceeds 10MB limit`);
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
    return (bytes / 1048576).toFixed(1) + ' MB';
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
        alert('Please fill record type and date');
        return;
    }

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
            // 1. Generate AES-256 key (local)
            const aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const exported = await crypto.subtle.exportKey('raw', aesKey);
            const aesKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));

            // 2. Encrypt file with AES-GCM
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const fileData = await file.arrayBuffer();
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv }, aesKey, fileData
            );
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);
            const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });

            // 3. Upload encrypted file to IPFS
            const encResult = await window.electronAPI.uploadToIPFS({
                data: await blobToBase64(encryptedBlob),
                filename: file.name + '.enc',
                fileType: 'application/octet-stream',
                metadata: { originalName: file.name, recordType, recordDate }
            });
            if (!encResult.success) throw new Error('IPFS upload failed');
            const encryptedCID = encResult.cid;

            // 4. Save record in localStorage for later sharing
            const sharedRecords = JSON.parse(localStorage.getItem('sharedRecords') || '[]');
            const record = {
                id: Date.now(),
                filename: file.name,
                encryptedCID,
                aesKeyBase64,
                recordType,
                recordDate,
                uploadedAt: new Date().toISOString()
            };
            sharedRecords.push(record);
            localStorage.setItem('sharedRecords', JSON.stringify(sharedRecords));

            // 5. Show AES key to patient
            showAESKey(aesKeyBase64);
            alert(`✅ Uploaded ${file.name}`);
        } catch (err) {
            console.error(err);
            alert(`Upload failed for ${file.name}: ${err.message}`);
        }
    }
    progressDiv.style.display = 'none';
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('cancelBtn').style.display = 'none';
    resetUpload();
}

function showAESKey(key) {
    document.getElementById('aesKeyDisplay').innerText = key;
    document.getElementById('keyModal').style.display = 'flex';
}
function copyAESKey() {
    const key = document.getElementById('aesKeyDisplay').innerText;
    navigator.clipboard.writeText(key);
    alert('AES key copied to clipboard');
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

async function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
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