/*

// performance-test.js - Full workflow metrics for MediChain
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64 } = require('tweetnacl-util');

// ========== CONFIGURATION ==========
const PINATA_API_KEY = '03959fc6abd1baa890bf';
const PINATA_API_SECRET = '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778';
const PROXY_URL = 'http://127.0.0.1:5000';
const RPC_URL = 'http://127.0.0.1:8545';
const ITERATIONS = 100;                // Number of EHRs
const WITNESS_VALIDITY_DAYS = 365;

// Accumulator contract – read from deployment file
let accumulatorAddress;
try {
    const deploy = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
    accumulatorAddress = deploy.Accumulator;
    console.log(`✅ Using accumulator at ${accumulatorAddress}`);
} catch (e) {
    console.error('❌ deployment.json not found. Run hardhat deploy first.');
    process.exit(1);
}

// ========== UTILITIES ==========
function generateDIDPair() {
    const keyPair = nacl.sign.keyPair();
    const publicKeyBase64 = encodeBase64(keyPair.publicKey);
    const privateKeyBase64 = encodeBase64(keyPair.secretKey);
    const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
    return { did, publicKey: publicKeyBase64, privateKey: privateKeyBase64, keyPair };
}

function randomEHR() {
    return {
        patientName: `Patient_${Math.floor(Math.random() * 10000)}`,
        recordDate: new Date().toISOString(),
        diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
        prescriptions: [`Drug_${Math.floor(Math.random() * 100)}`],
        notes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        timestamp: Date.now()
    };
}

// AES encryption (Node.js crypto)
function aesEncrypt(data, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { encrypted: Buffer.concat([iv, authTag, encrypted]), authTag };
}

function aesDecrypt(encryptedBuffer, key) {
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Pinata upload (returns CID and URL)
async function pinataUpload(buffer, filename, metadata = {}) {
    const formData = new FormData();
    formData.append('file', buffer, { filename });
    formData.append('pinataMetadata', JSON.stringify({
        name: filename,
        keyvalues: { ...metadata, timestamp: Date.now() }
    }));
    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        headers: {
            ...formData.getHeaders(),
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET
        },
        maxBodyLength: Infinity
    });
    return { cid: response.data.IpfsHash, url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}` };
}

// Pinata download (returns buffer)
async function pinataDownload(cid) {
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

// ========== TB‑PRE PROXY INTERACTIONS ==========
async function registerDoctor(doctorDid, attributes) {
    const res = await axios.post(`${PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
    return res.data;
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
    const res = await axios.post(`${PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
    return res.data; // { ciphertext, ciphertext_id }
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
    const res = await axios.post(`${PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
    return res.data; // { rekey_id }
}

async function proxyReencrypt(rekeyId) {
    const res = await axios.post(`${PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return res.data; // { transformed_ct_id }
}

async function decryptAES(transformedCtId, doctorDid) {
    const res = await axios.post(`${PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
    return res.data; // { aes_key_b64 }
}

// ========== BLOCKCHAIN (ACCUMULATOR) ==========
const provider = new ethers.JsonRpcProvider(RPC_URL);
const accumulatorABI = [
    "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
    "function revokeDoctor(string memory doctorDid) external",
    "function isDoctorActive(string memory doctorDid) external view returns (bool)",
    "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)"
];
let accumulatorContract;
let healthSigner;

async function initBlockchain(healthPrivateKey) {
    const signer = new ethers.Wallet(healthPrivateKey, provider);
    accumulatorContract = new ethers.Contract(accumulatorAddress, accumulatorABI, signer);
    healthSigner = signer;
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
    const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
}

async function revokeDoctor(doctorDid) {
    const tx = await accumulatorContract.revokeDoctor(doctorDid);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
}

async function isDoctorActive(doctorDid) {
    return await accumulatorContract.isDoctorActive(doctorDid);
}

// ========== METRICS COLLECTOR ==========
class MetricsCollector {
    constructor() {
        this.measurements = {
            aesEncrypt: [],
            aesDecrypt: [],
            preKeyGen: [],
            proxyEncapsulation: [],
            proxyRekeyGen: [],
            proxyReencrypt: [],
            proxyDecryptAES: [],
            pinataUploadEncrypted: [],
            pinataUploadCiphertext: [],
            pinataDownload: [],
            witnessIssueTime: [],
            witnessIssueGas: [],
            revokeTime: [],
            revokeGas: [],
            doctorActiveCheck: [],
            totalAccessTime: []
        };
    }

    record(name, value, unit = 'ms') {
        this.measurements[name].push(value);
    }

    recordGas(name, gas) {
        this.measurements[name].push(parseInt(gas));
    }

    computeStats(arr) {
        if (arr.length === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / arr.length,
            median: sorted[Math.floor(arr.length / 2)],
            p95: sorted[Math.floor(arr.length * 0.95)],
            p99: sorted[Math.floor(arr.length * 0.99)]
        };
    }

    toJSON() {
        const stats = {};
        for (const [key, values] of Object.entries(this.measurements)) {
            stats[key] = {
                values,
                statistics: this.computeStats(values)
            };
        }
        return stats;
    }
}

// ========== MAIN TEST ==========
async function runTest() {
    console.log('\n🚀 Starting Performance Test\n');

    // 1. Generate identities
    console.log('🔑 Generating test identities...');
    const patient = generateDIDPair();
    const doctor = generateDIDPair();
    const health = generateDIDPair();

    // For blockchain, health department needs an Ethereum private key (we'll use the default hardhat account)
    const healthEthPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    await initBlockchain(healthEthPrivateKey);
    console.log('✅ Health department ready (using hardhat account)');

    // 2. Register doctor on proxy
    console.log('📡 Registering doctor on TB‑PRE proxy...');
    await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
    console.log('✅ Doctor registered on proxy');

    // 3. Issue witness on blockchain (measure gas & time)
    console.log('⛓️ Issuing witness on Accumulator contract...');
    const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
    const expiry = Math.floor(Date.now() / 1000) + (WITNESS_VALIDITY_DAYS * 86400);
    const witnessStart = Date.now();
    const { gasUsed: witnessGas } = await issueWitness(doctor.did, witnessHash, expiry);
    const witnessTime = Date.now() - witnessStart;
    console.log(`   Witness issued in ${witnessTime} ms, gas: ${witnessGas}`);

    // 4. Verify doctor active (for baseline)
    const active = await isDoctorActive(doctor.did);
    if (!active) throw new Error('Doctor not active after witness issuance');
    console.log('✅ Doctor active');

    const metrics = new MetricsCollector();
    metrics.record('witnessIssueTime', witnessTime);
    metrics.recordGas('witnessIssueGas', witnessGas);

    // Pre‑generate a random AES key (used for all iterations? No, each EHR gets a new key)
    // But we measure per iteration.

    console.log(`\n📊 Running ${ITERATIONS} iterations...`);
    for (let i = 1; i <= ITERATIONS; i++) {
        process.stdout.write(`\r   Iteration ${i}/${ITERATIONS} ...`);
        const ehrData = JSON.stringify(randomEHR());
        const ehrBuffer = Buffer.from(ehrData, 'utf8');

        // ----- Patient side -----
        // AES key generation (pre-key gen time)
        const preKeyStart = Date.now();
        const aesKey = crypto.randomBytes(32);
        const preKeyTime = Date.now() - preKeyStart;
        metrics.record('preKeyGen', preKeyTime);

        // AES encryption
        const encStart = Date.now();
        const { encrypted: encryptedEhr } = aesEncrypt(ehrBuffer, aesKey);
        const encTime = Date.now() - encStart;
        metrics.record('aesEncrypt', encTime);

        // Encapsulation (proxy encrypt AES key)
        const aesKeyBase64 = aesKey.toString('base64');
        const timeSlot = Math.floor(Date.now() / 3600000); // hourly slot
        const policy = [['doctor']];
        const proxyEncStart = Date.now();
        const { ciphertext_id: ctId, ciphertext } = await encryptAESKey(aesKeyBase64, policy, timeSlot);
        const proxyEncTime = Date.now() - proxyEncStart;
        metrics.record('proxyEncapsulation', proxyEncTime);

        // Upload encrypted EHR to Pinata
        const pinataUploadEncStart = Date.now();
        const { cid: encCid } = await pinataUpload(encryptedEhr, `ehr_${i}.enc`, { type: 'encrypted_ehr' });
        const pinataUploadEncTime = Date.now() - pinataUploadEncStart;
        metrics.record('pinataUploadEncrypted', pinataUploadEncTime);

        // Upload ciphertext (encrypted AES key) to Pinata
        const ciphertextBuffer = Buffer.from(JSON.stringify(ciphertext), 'utf8');
        const pinataUploadCtStart = Date.now();
        const { cid: ctCid } = await pinataUpload(ciphertextBuffer, `ct_${i}.json`, { ctId });
        const pinataUploadCtTime = Date.now() - pinataUploadCtStart;
        metrics.record('pinataUploadCiphertext', pinataUploadCtTime);

        // Grant access (simulated storage – no on‑chain)
        const grant = {
            patientDid: patient.did,
            doctorDid: doctor.did,
            encryptedCid: encCid,
            ciphertextCid: ctCid,
            ciphertextId: ctId,
            expiry: expiry
        };
        // In real app, this would be stored in electron-store. We keep in memory.

        // ----- Doctor side (access) -----
        // Measure total access time from doctor's request to decrypted data
        const accessStart = Date.now();

        // 1) Check doctor active on-chain
        const activeCheckStart = Date.now();
        const stillActive = await isDoctorActive(doctor.did);
        const activeCheckTime = Date.now() - activeCheckStart;
        if (!stillActive) throw new Error('Doctor no longer active');
        metrics.record('doctorActiveCheck', activeCheckTime);

        // 2) Generate rekey
        const rekeyStart = Date.now();
        const { rekey_id } = await generateRekey(ctId, doctor.did, ['doctor']);
        const rekeyTime = Date.now() - rekeyStart;
        metrics.record('proxyRekeyGen', rekeyTime);

        // 3) Proxy re‑encrypt
        const reencryptStart = Date.now();
        const { transformed_ct_id } = await proxyReencrypt(rekey_id);
        const reencryptTime = Date.now() - reencryptStart;
        metrics.record('proxyReencrypt', reencryptTime);

        // 4) Decrypt AES key via proxy
        const decryptAesStart = Date.now();
        const { aes_key_b64 } = await decryptAES(transformed_ct_id, doctor.did);
        const decryptAesTime = Date.now() - decryptAesStart;
        metrics.record('proxyDecryptAES', decryptAesTime);

        // 5) Download encrypted EHR from Pinata
        const downloadStart = Date.now();
        const downloadedEncrypted = await pinataDownload(encCid);
        const downloadTime = Date.now() - downloadStart;
        metrics.record('pinataDownload', downloadTime);

        // 6) AES decryption
        const aesDecryptStart = Date.now();
        const decryptedKey = Buffer.from(aes_key_b64, 'base64');
        const decryptedEhr = aesDecrypt(downloadedEncrypted, decryptedKey);
        const aesDecryptTime = Date.now() - aesDecryptStart;
        metrics.record('aesDecrypt', aesDecryptTime);

        const totalAccess = Date.now() - accessStart;
        metrics.record('totalAccessTime', totalAccess);

        // Verify decrypted content matches original
        const decryptedStr = decryptedEhr.toString('utf8');
        if (decryptedStr !== ehrData) {
            console.error(`\n❌ Data mismatch at iteration ${i}`);
            process.exit(1);
        }
    }

    console.log('\n\n✅ Test complete. Computing metrics...');

    // Also optionally measure revoke (once)
    console.log('⛓️ Measuring revoke...');
    const revokeStart = Date.now();
    const { gasUsed: revokeGas } = await revokeDoctor(doctor.did);
    const revokeTime = Date.now() - revokeStart;
    metrics.record('revokeTime', revokeTime);
    metrics.recordGas('revokeGas', revokeGas);
    console.log(`   Revoke took ${revokeTime} ms, gas: ${revokeGas}`);

    // Save raw metrics as JSON
    const output = metrics.toJSON();
    fs.writeFileSync('metrics.json', JSON.stringify(output, null, 2));
    console.log('📁 metrics.json saved');

    // Generate HTML report
    generateHtmlReport(output);
    console.log('📄 report.html generated');
}

// ========== HTML REPORT GENERATOR ==========
function generateHtmlReport(data) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MediChain Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f4f7fc; padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1a5276; margin-bottom: 1rem; }
    h2 { color: #2c3e50; margin: 1.5rem 0 1rem; border-left: 5px solid #3498db; padding-left: 1rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 1.2rem; transition: transform 0.2s; }
    .card:hover { transform: translateY(-3px); }
    .card h3 { margin-bottom: 1rem; color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 0.5rem; }
    .metric-row { display: flex; justify-content: space-between; margin: 0.5rem 0; font-size: 0.9rem; }
    .metric-label { font-weight: 600; color: #7f8c8d; }
    .metric-value { font-family: monospace; font-weight: 500; }
    .chart-container { background: white; border-radius: 12px; padding: 1rem; margin-bottom: 2rem; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    canvas { max-height: 400px; }
    footer { text-align: center; margin-top: 3rem; color: #95a5a6; font-size: 0.8rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>📊 MediChain Performance Metrics</h1>
  <p>100 iterations with real Pinata uploads/downloads and TB‑PRE proxy + Hardhat blockchain.</p>
  <div class="stats-grid">
    ${Object.entries(data).map(([name, stat]) => `
      <div class="card">
        <h3>${formatMetricName(name)}</h3>
        <div class="metric-row"><span class="metric-label">Min:</span><span class="metric-value">${formatValue(stat.statistics.min, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Max:</span><span class="metric-value">${formatValue(stat.statistics.max, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Avg:</span><span class="metric-value">${formatValue(stat.statistics.avg, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Median:</span><span class="metric-value">${formatValue(stat.statistics.median, name)}</span></div>
        <div class="metric-row"><span class="metric-label">95th percentile:</span><span class="metric-value">${formatValue(stat.statistics.p95, name)}</span></div>
        <div class="metric-row"><span class="metric-label">99th percentile:</span><span class="metric-value">${formatValue(stat.statistics.p99, name)}</span></div>
      </div>
    `).join('')}
  </div>
  <h2>📈 Distribution Histograms (Top 8)</h2>
  <div id="charts"></div>
  <footer>Generated on ${new Date().toISOString()}</footer>
</div>
<script>
  const rawData = ${JSON.stringify(data)};
  const chartContainer = document.getElementById('charts');
  const metricsToChart = ['aesEncrypt', 'aesDecrypt', 'pinataUploadEncrypted', 'pinataDownload', 'proxyEncapsulation', 'proxyDecryptAES', 'totalAccessTime', 'witnessIssueTime'];
  metricsToChart.forEach(metric => {
    const values = rawData[metric].values;
    if (!values || values.length === 0) return;
    const binCount = 20;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;
    const bins = Array(binCount).fill(0);
    values.forEach(v => {
      let idx = Math.floor((v - min) / binWidth);
      if (idx === binCount) idx = binCount - 1;
      if (idx >= 0) bins[idx]++;
    });
    const labels = Array(binCount).fill().map((_, i) => (min + i * binWidth).toFixed(2));
    const div = document.createElement('div');
    div.className = 'chart-container';
    div.innerHTML = \`<h3>\${formatMetricName(metric)} Distribution</h3><canvas id="chart-\${metric}" width="400" height="200"></canvas>\`;
    chartContainer.appendChild(div);
    const ctx = document.getElementById(\`chart-\${metric}\`).getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Frequency', data: bins, backgroundColor: 'rgba(52,152,219,0.6)' }] },
      options: { responsive: true, scales: { x: { title: { display: true, text: 'Time (ms)' } }, y: { title: { display: true, text: 'Count' } } } }
    });
  });
  function formatMetricName(name) {
    const map = {
      aesEncrypt: 'AES Encryption', aesDecrypt: 'AES Decryption', preKeyGen: 'AES Key Generation',
      proxyEncapsulation: 'TB‑PRE Key Encapsulation', proxyRekeyGen: 'Rekey Generation',
      proxyReencrypt: 'Proxy Re‑encryption', proxyDecryptAES: 'Proxy AES Decryption',
      pinataUploadEncrypted: 'Pinata Upload (Encrypted EHR)', pinataUploadCiphertext: 'Pinata Upload (Ciphertext)',
      pinataDownload: 'Pinata Download', doctorActiveCheck: 'Doctor Active Check (on‑chain)',
      witnessIssueTime: 'Witness Issuance (Time)', witnessIssueGas: 'Witness Issuance (Gas)',
      revokeTime: 'Revoke Doctor (Time)', revokeGas: 'Revoke Doctor (Gas)',
      totalAccessTime: 'Total Access Time (Doctor)'
    };
    return map[name] || name;
  }
</script>
</body>
</html>`;
    fs.writeFileSync('report.html', html);
}

function formatMetricName(name) {
    const names = {
        aesEncrypt: 'AES Encryption',
        aesDecrypt: 'AES Decryption',
        preKeyGen: 'AES Key Generation',
        proxyEncapsulation: 'TB‑PRE Key Encapsulation',
        proxyRekeyGen: 'Rekey Generation',
        proxyReencrypt: 'Proxy Re‑encryption',
        proxyDecryptAES: 'Proxy AES Decryption',
        pinataUploadEncrypted: 'Pinata Upload (Encrypted EHR)',
        pinataUploadCiphertext: 'Pinata Upload (Ciphertext)',
        pinataDownload: 'Pinata Download',
        doctorActiveCheck: 'Doctor Active Check',
        witnessIssueTime: 'Witness Issuance (time)',
        witnessIssueGas: 'Witness Issuance (gas)',
        revokeTime: 'Revoke Doctor (time)',
        revokeGas: 'Revoke Doctor (gas)',
        totalAccessTime: 'Total Access Time'
    };
    return names[name] || name;
}

function formatValue(val, metric) {
    if (metric.includes('Gas')) return `${Math.round(val).toLocaleString()} gas`;
    return `${val.toFixed(2)} ms`;
}

runTest().catch(console.error);


*/


// performance-test.js - Full workflow metrics including gas cost in DZD
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64 } = require('tweetnacl-util');

// ========== CONFIGURATION ==========
const PINATA_API_KEY = '03959fc6abd1baa890bf';
const PINATA_API_SECRET = '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778';
const PROXY_URL = 'http://127.0.0.1:5000';
const RPC_URL = 'http://127.0.0.1:8545';
const ITERATIONS = 100;
const WITNESS_VALIDITY_DAYS = 365;

let accumulatorAddress;
try {
    const deploy = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
    accumulatorAddress = deploy.Accumulator;
    console.log(`✅ Using accumulator at ${accumulatorAddress}`);
} catch (e) {
    console.error('❌ deployment.json not found. Run hardhat deploy first.');
    process.exit(1);
}

// ========== UTILITIES ==========
function generateDIDPair() {
    const keyPair = nacl.sign.keyPair();
    const publicKeyBase64 = encodeBase64(keyPair.publicKey);
    const privateKeyBase64 = encodeBase64(keyPair.secretKey);
    const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
    return { did, publicKey: publicKeyBase64, privateKey: privateKeyBase64, keyPair };
}

function randomEHR() {
    return {
        patientName: `Patient_${Math.floor(Math.random() * 10000)}`,
        recordDate: new Date().toISOString(),
        diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
        prescriptions: [`Drug_${Math.floor(Math.random() * 100)}`],
        notes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        timestamp: Date.now()
    };
}

function aesEncrypt(data, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { encrypted: Buffer.concat([iv, authTag, encrypted]), authTag };
}

function aesDecrypt(encryptedBuffer, key) {
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function pinataUpload(buffer, filename, metadata = {}) {
    const formData = new FormData();
    formData.append('file', buffer, { filename });
    formData.append('pinataMetadata', JSON.stringify({
        name: filename,
        keyvalues: { ...metadata, timestamp: Date.now() }
    }));
    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        headers: {
            ...formData.getHeaders(),
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET
        },
        maxBodyLength: Infinity
    });
    return { cid: response.data.IpfsHash, url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}` };
}

async function pinataDownload(cid) {
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

// ========== TB‑PRE PROXY ==========
async function registerDoctor(doctorDid, attributes) {
    const res = await axios.post(`${PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
    return res.data;
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
    const res = await axios.post(`${PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
    return res.data;
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
    const res = await axios.post(`${PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
    return res.data;
}

async function proxyReencrypt(rekeyId) {
    const res = await axios.post(`${PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return res.data;
}

async function decryptAES(transformedCtId, doctorDid) {
    const res = await axios.post(`${PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
    return res.data;
}

// ========== BLOCKCHAIN ==========
const provider = new ethers.JsonRpcProvider(RPC_URL);
const accumulatorABI = [
    "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
    "function revokeDoctor(string memory doctorDid) external",
    "function isDoctorActive(string memory doctorDid) external view returns (bool)",
    "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)"
];
let accumulatorContract;
let healthSigner;

async function initBlockchain(healthPrivateKey) {
    const signer = new ethers.Wallet(healthPrivateKey, provider);
    accumulatorContract = new ethers.Contract(accumulatorAddress, accumulatorABI, signer);
    healthSigner = signer;
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
    const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
}

async function revokeDoctor(doctorDid) {
    const tx = await accumulatorContract.revokeDoctor(doctorDid);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
}

async function isDoctorActive(doctorDid) {
    return await accumulatorContract.isDoctorActive(doctorDid);
}

// ========== EXCHANGE RATE (ETH → DZD) ==========
let ethToDzdRate = 350000; // fallback
async function fetchEthToDzd() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=dzd');
        if (response.data?.ethereum?.dzd) {
            ethToDzdRate = response.data.ethereum.dzd;
            console.log(`💰 1 ETH = ${ethToDzdRate.toFixed(2)} DZD`);
        } else {
            console.warn(`⚠️ Could not fetch live rate, using fallback: 1 ETH = ${ethToDzdRate} DZD`);
        }
    } catch (err) {
        console.warn(`⚠️ Error fetching rate, using fallback: 1 ETH = ${ethToDzdRate} DZD`);
    }
}

// ========== METRICS COLLECTOR ==========
class MetricsCollector {
    constructor() {
        this.measurements = {
            aesEncrypt: [],
            aesDecrypt: [],
            preKeyGen: [],
            proxyEncapsulation: [],
            proxyRekeyGen: [],
            proxyReencrypt: [],
            proxyDecryptAES: [],
            pinataUploadEncrypted: [],
            pinataUploadCiphertext: [],
            pinataDownload: [],
            witnessIssueTime: [],
            witnessIssueGas: [],
            witnessIssueCostDZD: [],
            revokeTime: [],
            revokeGas: [],
            revokeCostDZD: [],
            doctorActiveCheck: [],
            totalAccessTime: []
        };
    }

    record(name, value) {
        this.measurements[name].push(value);
    }

    recordGas(name, gas) {
        this.measurements[name].push(parseInt(gas));
    }

    computeStats(arr) {
        if (arr.length === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / arr.length,
            median: sorted[Math.floor(arr.length / 2)],
            p95: sorted[Math.floor(arr.length * 0.95)],
            p99: sorted[Math.floor(arr.length * 0.99)]
        };
    }

    toJSON() {
        const stats = {};
        for (const [key, values] of Object.entries(this.measurements)) {
            stats[key] = {
                values,
                statistics: this.computeStats(values)
            };
        }
        return stats;
    }
}

// ========== MAIN TEST ==========
async function runTest() {
    console.log('\n🚀 Starting Performance Test\n');

    // 1. Generate identities
    console.log('🔑 Generating test identities...');
    const patient = generateDIDPair();
    const doctor = generateDIDPair();
    const health = generateDIDPair();

    const healthEthPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    await initBlockchain(healthEthPrivateKey);
    console.log('✅ Health department ready (using hardhat account)');

    // 2. Register doctor on proxy
    console.log('📡 Registering doctor on TB‑PRE proxy...');
    await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
    console.log('✅ Doctor registered on proxy');

    // 3. Fetch ETH/DZD rate and current gas price
    await fetchEthToDzd();
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    console.log(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

    // 4. Issue witness on blockchain
    console.log('⛓️ Issuing witness on Accumulator contract...');
    const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
    const expiry = Math.floor(Date.now() / 1000) + (WITNESS_VALIDITY_DAYS * 86400);
    const witnessStart = Date.now();
    const { gasUsed: witnessGas } = await issueWitness(doctor.did, witnessHash, expiry);
    const witnessTime = Date.now() - witnessStart;
    const witnessCostWei = BigInt(witnessGas) * gasPrice;
    const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
    const witnessCostDzd = witnessCostEth * ethToDzdRate;
    console.log(`   Witness issued in ${witnessTime} ms, gas: ${witnessGas}, cost: ${witnessCostDzd.toFixed(4)} DZD`);

    // 5. Verify doctor active
    const active = await isDoctorActive(doctor.did);
    if (!active) throw new Error('Doctor not active after witness issuance');
    console.log('✅ Doctor active');

    const metrics = new MetricsCollector();
    metrics.record('witnessIssueTime', witnessTime);
    metrics.recordGas('witnessIssueGas', witnessGas);
    metrics.record('witnessIssueCostDZD', witnessCostDzd);

    console.log(`\n📊 Running ${ITERATIONS} iterations...`);
    for (let i = 1; i <= ITERATIONS; i++) {
        process.stdout.write(`\r   Iteration ${i}/${ITERATIONS} ...`);
        const ehrData = JSON.stringify(randomEHR());
        const ehrBuffer = Buffer.from(ehrData, 'utf8');

        // AES key generation
        const preKeyStart = Date.now();
        const aesKey = crypto.randomBytes(32);
        const preKeyTime = Date.now() - preKeyStart;
        metrics.record('preKeyGen', preKeyTime);

        // AES encryption
        const encStart = Date.now();
        const { encrypted: encryptedEhr } = aesEncrypt(ehrBuffer, aesKey);
        const encTime = Date.now() - encStart;
        metrics.record('aesEncrypt', encTime);

        // Proxy encryption of AES key
        const aesKeyBase64 = aesKey.toString('base64');
        const timeSlot = Math.floor(Date.now() / 3600000);
        const policy = [['doctor']];
        const proxyEncStart = Date.now();
        const { ciphertext_id: ctId, ciphertext } = await encryptAESKey(aesKeyBase64, policy, timeSlot);
        const proxyEncTime = Date.now() - proxyEncStart;
        metrics.record('proxyEncapsulation', proxyEncTime);

        // Upload encrypted EHR to Pinata
        const pinataUploadEncStart = Date.now();
        const { cid: encCid } = await pinataUpload(encryptedEhr, `ehr_${i}.enc`, { type: 'encrypted_ehr' });
        const pinataUploadEncTime = Date.now() - pinataUploadEncStart;
        metrics.record('pinataUploadEncrypted', pinataUploadEncTime);

        // Upload ciphertext (encrypted AES key) to Pinata
        const ciphertextBuffer = Buffer.from(JSON.stringify(ciphertext), 'utf8');
        const pinataUploadCtStart = Date.now();
        const { cid: ctCid } = await pinataUpload(ciphertextBuffer, `ct_${i}.json`, { ctId });
        const pinataUploadCtTime = Date.now() - pinataUploadCtStart;
        metrics.record('pinataUploadCiphertext', pinataUploadCtTime);

        // --- Doctor side access ---
        const accessStart = Date.now();

        // Check doctor active on-chain
        const activeCheckStart = Date.now();
        const stillActive = await isDoctorActive(doctor.did);
        const activeCheckTime = Date.now() - activeCheckStart;
        if (!stillActive) throw new Error('Doctor no longer active');
        metrics.record('doctorActiveCheck', activeCheckTime);

        // Generate rekey
        const rekeyStart = Date.now();
        const { rekey_id } = await generateRekey(ctId, doctor.did, ['doctor']);
        const rekeyTime = Date.now() - rekeyStart;
        metrics.record('proxyRekeyGen', rekeyTime);

        // Proxy re-encrypt
        const reencryptStart = Date.now();
        const { transformed_ct_id } = await proxyReencrypt(rekey_id);
        const reencryptTime = Date.now() - reencryptStart;
        metrics.record('proxyReencrypt', reencryptTime);

        // Decrypt AES key
        const decryptAesStart = Date.now();
        const { aes_key_b64 } = await decryptAES(transformed_ct_id, doctor.did);
        const decryptAesTime = Date.now() - decryptAesStart;
        metrics.record('proxyDecryptAES', decryptAesTime);

        // Download encrypted EHR from Pinata
        const downloadStart = Date.now();
        const downloadedEncrypted = await pinataDownload(encCid);
        const downloadTime = Date.now() - downloadStart;
        metrics.record('pinataDownload', downloadTime);

        // AES decryption
        const aesDecryptStart = Date.now();
        const decryptedKey = Buffer.from(aes_key_b64, 'base64');
        const decryptedEhr = aesDecrypt(downloadedEncrypted, decryptedKey);
        const aesDecryptTime = Date.now() - aesDecryptStart;
        metrics.record('aesDecrypt', aesDecryptTime);

        const totalAccess = Date.now() - accessStart;
        metrics.record('totalAccessTime', totalAccess);

        // Verify integrity
        const decryptedStr = decryptedEhr.toString('utf8');
        if (decryptedStr !== ehrData) {
            console.error(`\n❌ Data mismatch at iteration ${i}`);
            process.exit(1);
        }
    }

    console.log('\n\n✅ Test complete. Computing metrics...');

    // Measure revocation (once)
    console.log('⛓️ Measuring revoke...');
    const revokeStart = Date.now();
    const { gasUsed: revokeGas } = await revokeDoctor(doctor.did);
    const revokeTime = Date.now() - revokeStart;
    const revokeCostWei = BigInt(revokeGas) * gasPrice;
    const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
    const revokeCostDzd = revokeCostEth * ethToDzdRate;
    metrics.record('revokeTime', revokeTime);
    metrics.recordGas('revokeGas', revokeGas);
    metrics.record('revokeCostDZD', revokeCostDzd);
    console.log(`   Revoke took ${revokeTime} ms, gas: ${revokeGas}, cost: ${revokeCostDzd.toFixed(4)} DZD`);

    // Save metrics
    const output = metrics.toJSON();
    fs.writeFileSync('metrics.json', JSON.stringify(output, null, 2));
    console.log('📁 metrics.json saved');

    generateHtmlReport(output);
    console.log('📄 report.html generated');
}

// ========== HTML REPORT GENERATOR ==========
function generateHtmlReport(data) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MediChain Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f4f7fc; padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1a5276; margin-bottom: 1rem; }
    h2 { color: #2c3e50; margin: 1.5rem 0 1rem; border-left: 5px solid #3498db; padding-left: 1rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 1.2rem; transition: transform 0.2s; }
    .card:hover { transform: translateY(-3px); }
    .card h3 { margin-bottom: 1rem; color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 0.5rem; }
    .metric-row { display: flex; justify-content: space-between; margin: 0.5rem 0; font-size: 0.9rem; }
    .metric-label { font-weight: 600; color: #7f8c8d; }
    .metric-value { font-family: monospace; font-weight: 500; }
    .chart-container { background: white; border-radius: 12px; padding: 1rem; margin-bottom: 2rem; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    canvas { max-height: 400px; }
    footer { text-align: center; margin-top: 3rem; color: #95a5a6; font-size: 0.8rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>📊 MediChain Performance Metrics (Including Gas Cost in DZD)</h1>
  <p>100 iterations | Real Pinata uploads/downloads | TB‑PRE proxy | Hardhat local blockchain</p>
  <div class="stats-grid">
    ${Object.entries(data).map(([name, stat]) => `
      <div class="card">
        <h3>${formatMetricName(name)}</h3>
        <div class="metric-row"><span class="metric-label">Min:</span><span class="metric-value">${formatValue(stat.statistics.min, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Max:</span><span class="metric-value">${formatValue(stat.statistics.max, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Avg:</span><span class="metric-value">${formatValue(stat.statistics.avg, name)}</span></div>
        <div class="metric-row"><span class="metric-label">Median:</span><span class="metric-value">${formatValue(stat.statistics.median, name)}</span></div>
        <div class="metric-row"><span class="metric-label">95th percentile:</span><span class="metric-value">${formatValue(stat.statistics.p95, name)}</span></div>
        <div class="metric-row"><span class="metric-label">99th percentile:</span><span class="metric-value">${formatValue(stat.statistics.p99, name)}</span></div>
      </div>
    `).join('')}
  </div>
  <h2>📈 Distribution Histograms (Top 8)</h2>
  <div id="charts"></div>
  <footer>Generated on ${new Date().toISOString()}</footer>
</div>
<script>
  const rawData = ${JSON.stringify(data)};
  const chartContainer = document.getElementById('charts');
  const metricsToChart = ['aesEncrypt', 'aesDecrypt', 'pinataUploadEncrypted', 'pinataDownload', 'proxyEncapsulation', 'proxyDecryptAES', 'totalAccessTime', 'witnessIssueCostDZD'];
  metricsToChart.forEach(metric => {
    const values = rawData[metric].values;
    if (!values || values.length === 0) return;
    const binCount = 20;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;
    const bins = Array(binCount).fill(0);
    values.forEach(v => {
      let idx = Math.floor((v - min) / binWidth);
      if (idx === binCount) idx = binCount - 1;
      if (idx >= 0) bins[idx]++;
    });
    const labels = Array(binCount).fill().map((_, i) => (min + i * binWidth).toFixed(2));
    const div = document.createElement('div');
    div.className = 'chart-container';
    div.innerHTML = \`<h3>\${formatMetricName(metric)} Distribution</h3><canvas id="chart-\${metric}" width="400" height="200"></canvas>\`;
    chartContainer.appendChild(div);
    const ctx = document.getElementById(\`chart-\${metric}\`).getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Frequency', data: bins, backgroundColor: 'rgba(52,152,219,0.6)' }] },
      options: { responsive: true, scales: { x: { title: { display: true, text: getUnit(metric) } }, y: { title: { display: true, text: 'Count' } } } }
    });
  });
  function getUnit(metric) {
    if (metric.includes('Cost')) return 'DZD';
    if (metric.includes('Gas')) return 'Gas units';
    return 'Time (ms)';
  }
  function formatMetricName(name) {
    const map = {
      aesEncrypt: 'AES Encryption', aesDecrypt: 'AES Decryption', preKeyGen: 'AES Key Generation',
      proxyEncapsulation: 'TB‑PRE Key Encapsulation', proxyRekeyGen: 'Rekey Generation',
      proxyReencrypt: 'Proxy Re‑encryption', proxyDecryptAES: 'Proxy AES Decryption',
      pinataUploadEncrypted: 'Pinata Upload (Encrypted EHR)', pinataUploadCiphertext: 'Pinata Upload (Ciphertext)',
      pinataDownload: 'Pinata Download', doctorActiveCheck: 'Doctor Active Check (on‑chain)',
      witnessIssueTime: 'Witness Issuance (Time)', witnessIssueGas: 'Witness Issuance (Gas)',
      witnessIssueCostDZD: 'Witness Issuance Cost (DZD)',
      revokeTime: 'Revoke Doctor (Time)', revokeGas: 'Revoke Doctor (Gas)',
      revokeCostDZD: 'Revoke Doctor Cost (DZD)',
      totalAccessTime: 'Total Access Time (Doctor)'
    };
    return map[name] || name;
  }
</script>
</body>
</html>`;
    fs.writeFileSync('report.html', html);
}

function formatMetricName(name) {
    const map = {
        aesEncrypt: 'AES Encryption',
        aesDecrypt: 'AES Decryption',
        preKeyGen: 'AES Key Generation',
        proxyEncapsulation: 'TB‑PRE Key Encapsulation',
        proxyRekeyGen: 'Rekey Generation',
        proxyReencrypt: 'Proxy Re‑encryption',
        proxyDecryptAES: 'Proxy AES Decryption',
        pinataUploadEncrypted: 'Pinata Upload (Encrypted EHR)',
        pinataUploadCiphertext: 'Pinata Upload (Ciphertext)',
        pinataDownload: 'Pinata Download',
        doctorActiveCheck: 'Doctor Active Check',
        witnessIssueTime: 'Witness Issuance (time)',
        witnessIssueGas: 'Witness Issuance (gas)',
        witnessIssueCostDZD: 'Witness Issuance Cost (DZD)',
        revokeTime: 'Revoke Doctor (time)',
        revokeGas: 'Revoke Doctor (gas)',
        revokeCostDZD: 'Revoke Doctor Cost (DZD)',
        totalAccessTime: 'Total Access Time'
    };
    return map[name] || name;
}

function formatValue(val, metric) {
    if (metric.includes('Gas')) return `${Math.round(val).toLocaleString()} gas`;
    if (metric.includes('CostDZD')) return `${val.toFixed(4)} DZD`;
    return `${val.toFixed(2)} ms`;
}

runTest().catch(console.error);