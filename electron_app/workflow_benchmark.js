/*

const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
    PINATA_API_KEY: '03959fc6abd1baa890bf',
    PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',
    WITNESS_VALIDITY_DAYS: 365,
};

// ==================== UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const privB64 = encodeBase64(keyPair.secretKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: privB64, keyPair };
}

function generateEHR() {
    return JSON.stringify({
        patient: "John Doe", diagnosis: "Hypertension",
        medications: ["Lisinopril"], timestamp: new Date().toISOString()
    });
}

function aesEncrypt(plaintextBuffer, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function aesDecrypt(encryptedBuffer, key) {
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ct = encryptedBuffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function pinataUpload(buffer, filename) {
    const fd = new FormData();
    fd.append('file', buffer, { filename });
    fd.append('pinataMetadata', JSON.stringify({ name: filename }));
    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
        headers: { ...fd.getHeaders(), pinata_api_key: CONFIG.PINATA_API_KEY, pinata_secret_api_key: CONFIG.PINATA_API_SECRET },
        maxBodyLength: Infinity,
    });
    return res.data.IpfsHash;
}

async function pinataDownload(cid) {
    for (const gw of ['https://gateway.pinata.cloud/ipfs', 'https://ipfs.io/ipfs', 'https://cloudflare-ipfs.com/ipfs']) {
        try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(res.data);
        } catch (e) { }
    }
    throw new Error('All gateways failed');
}

// ==================== BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const wallet = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
const acc = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, [
    "function setDoctorWitness(string, bytes32, uint64) external",
    "function revokeDoctor(string) external",
    "function isDoctorActive(string) view returns (bool)",
], wallet);

// ==================== PROXY HELPERS ====================
async function proxyRegisterDoctor(did) {
    console.log('   → POST /register_doctor with DID:', did.substring(0, 30) + '...');
    try {
        const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, {
            doctor_did: did, attributes: ["doctor"]
        });
        console.log('   ✅ Registered on proxy – status:', res.status, res.data);
    } catch (e) {
        console.error('   ❌ Proxy registration failed:', e.response?.status, e.response?.data);
        throw e;
    }
}

async function proxyEncryptAES(keyB64, policy, slot) {
    const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, {
        aes_key_b64: keyB64, policy, time_slot: slot
    });
    return res.data;
}

async function proxyRekey(ctId, did, attrs) {
    const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, {
        ct_id: ctId, delegatee_did: did, delegatee_attrs: attrs
    });
    return res.data.rekey_id;
}

async function proxyReenc(rId) {
    const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rId });
    return res.data.transformed_ct_id;
}

async function proxyDecryptAES(tId, did) {
    const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, {
        transformed_ct_id: tId, doctor_did: did
    });
    return res.data.aes_key_b64;
}

// ==================== TIMER ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== MAIN ====================
async function main() {
    const T = {};

    console.log('👤 Patient SSI...');
    let t = n(); const patient = generateSSI(); T.patientSSI = ms(t);
    console.log(`   ${patient.did} (${T.patientSSI.toFixed(1)} ms)`);

    console.log('📄 Encrypt EHR...');
    const ehr = Buffer.from(generateEHR(), 'utf-8');
    const aesKey = crypto.randomBytes(32);
    t = n(); const encEHR = aesEncrypt(ehr, aesKey); T.aesEncrypt = ms(t);
    console.log(`   ${T.aesEncrypt.toFixed(1)} ms`);

    console.log('☁️  Upload Pinata...');
    t = n(); const cid = await pinataUpload(encEHR, 'ehr.enc'); T.pinataUpload = ms(t);
    console.log(`   CID: ${cid} (${T.pinataUpload.toFixed(0)} ms)`);

    console.log('👨‍⚕️  Doctor SSI...');
    t = n(); const doctor = generateSSI(); T.doctorSSI = ms(t);
    console.log(`   ${doctor.did} (${T.doctorSSI.toFixed(1)} ms)`);

    // ★★★ REGISTER DOCTOR ON PROXY (THE FIX)
    console.log('🔑 Register doctor on proxy...');
    t = n(); await proxyRegisterDoctor(doctor.did); T.proxyReg = ms(t);

    console.log('🏥 Issue witness...');
    const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
    const wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
    t = n(); const tx = await acc.setDoctorWitness(doctor.did, wh, exp);
    const r = await tx.wait(); T.witness = ms(t);
    console.log(`   gas: ${r.gasUsed} (${T.witness.toFixed(0)} ms)`);

    console.log('🔍 Check active...');
    t = n(); const active = await acc.isDoctorActive(doctor.did); T.check = ms(t);
    console.log(`   ${active} (${T.check.toFixed(0)} ms)`);

    console.log('🔑 Proxy encrypt AES...');
    const slot = Math.floor(Date.now() / 3600000);
    t = n(); const encRes = await proxyEncryptAES(aesKey.toString('base64'), [["doctor"]], slot);
    T.proxyEnc = ms(t);
    console.log(`   ct_id: ${encRes.ciphertext_id} (${T.proxyEnc.toFixed(1)} ms)`);

    console.log('📨 Rekey...');
    t = n(); const rkId = await proxyRekey(encRes.ciphertext_id, doctor.did, ['doctor']);
    T.rekey = ms(t);
    console.log(`   rekey: ${rkId} (${T.rekey.toFixed(1)} ms)`);

    console.log('🔄 Reencrypt...');
    t = n(); const tId = await proxyReenc(rkId); T.reenc = ms(t);

    console.log('🔓 Decrypt key...');
    t = n(); const keyB64 = await proxyDecryptAES(tId, doctor.did); T.decKey = ms(t);

    console.log('⬇️  Download...');
    t = n(); const encData = await pinataDownload(cid); T.download = ms(t);

    console.log('📄 Decrypt EHR...');
    t = n(); aesDecrypt(encData, Buffer.from(keyB64, 'base64')); T.decEHR = ms(t);

    const total = T.rekey + T.reenc + T.decKey + T.download + T.decEHR;
    console.log(`\n⏱️  TOTAL ACCESS: ${total.toFixed(0)} ms`);

    console.log('🚫 Revoke...');
    t = n(); const rx = await acc.revokeDoctor(doctor.did);
    const rr = await rx.wait(); T.revoke = ms(t);
    console.log(`   gas: ${rr.gasUsed}`);

    // ---- REPORT ----
    fs.writeFileSync('workflow_report.json', JSON.stringify({
        patientDID: patient.did, doctorDID: doctor.did, ehrCID: cid,
        times: T, totalAccessMs: total,
        gas: { witness: Number(r.gasUsed), revoke: Number(rr.gasUsed) }
    }, null, 2));

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>MediChain Workflow</title>
<style>body { font-family: Arial; margin: 2rem; background: #f4f6fb; }
.container { max-width: 800px; margin: auto; background: white; padding: 2rem; border-radius: 10px; }
h1 { color: #1a5276; } th { background: #2c3e50; color: white; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th, td { padding: 10px; border: 1px solid #ddd; } .v { color: #27ae60; font-weight: bold; }</style></head>
<body><div class="container"><h1>🔐 MediChain Workflow</h1>
<p>Patient: ${patient.did}</p><p>Doctor: ${doctor.did}</p><p>CID: ${cid}</p>
<h2>Timings (ms)</h2><table><tr><th>Step</th><th>Time</th></tr>
${Object.entries(T).map(([k, v]) => `<tr><td>${k}</td><td class="v">${v.toFixed(2)}</td></tr>`).join('')}
</table><h2>Total Access: ${total.toFixed(2)} ms</h2>
<h2>Gas</h2><p>Witness: ${r.gasUsed} | Revoke: ${rr.gasUsed}</p></div></body></html>`;
    fs.writeFileSync('full_workflow_report.html', html);
    console.log('📊 Reports saved.');
}

main().catch(e => console.error('❌', e.message));

*/


const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    PINATA_API_KEY: '03959fc6abd1baa890bf',
    PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // Benchmark parameters
    EHR_SIZES_KB: [50, 100, 200, 400, 800, 1600],   // different file sizes
    ITERATIONS_PER_SIZE: 3,                           // total 18 runs, adjust as needed
};

// ==================== UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: encodeBase64(keyPair.secretKey) };
}

function generateEHR(sizeKB) {
    let base = { patient: "John Doe", diagnosis: "Hypertension", timestamp: new Date().toISOString() };
    let str = JSON.stringify(base);
    let need = sizeKB * 1024 - Buffer.byteLength(str, 'utf8');
    if (need > 0) {
        base._padding = "X".repeat(need);
        str = JSON.stringify(base);
    }
    return Buffer.from(str, 'utf8');
}

function aesEncrypt(plain, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function aesDecrypt(encBuffer, key) {
    const iv = encBuffer.subarray(0, 12);
    const tag = encBuffer.subarray(12, 28);
    const ct = encBuffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function pinataUpload(buffer, filename) {
    const fd = new FormData();
    fd.append('file', buffer, { filename });
    fd.append('pinataMetadata', JSON.stringify({ name: filename }));
    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
        headers: {
            ...fd.getHeaders(),
            pinata_api_key: CONFIG.PINATA_API_KEY,
            pinata_secret_api_key: CONFIG.PINATA_API_SECRET
        },
        maxBodyLength: Infinity
    });
    return res.data.IpfsHash;
}

async function pinataDownload(cid) {
    for (const gw of ['https://gateway.pinata.cloud/ipfs', 'https://ipfs.io/ipfs', 'https://cloudflare-ipfs.com/ipfs']) {
        try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(res.data);
        } catch (e) { }
    }
    throw new Error('Pinata download failed');
}

// ==================== BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const wallet = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
const acc = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, [
    "function setDoctorWitness(string, bytes32, uint64) external",
    "function revokeDoctor(string) external",
    "function isDoctorActive(string) view returns (bool)",
], wallet);

// ==================== PROXY HELPERS ====================
async function proxyRegisterDoctor(did) {
    await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, {
        doctor_did: did, attributes: ["doctor"]
    });
}

async function proxyEncryptAES(keyB64, policy, timeSlot) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, {
        aes_key_b64: keyB64, policy, time_slot: timeSlot
    });
    return data; // { ciphertext_id, ciphertext }
}

async function proxyRekey(ctId, did, attrs) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, {
        ct_id: ctId, delegatee_did: did, delegatee_attrs: attrs
    });
    return data.rekey_id;
}

async function proxyReencrypt(rekeyId) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return data.transformed_ct_id;
}

async function proxyDecryptAES(transformedCtId, doctorDid) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, {
        transformed_ct_id: transformedCtId, doctor_did: doctorDid
    });
    return data.aes_key_b64;
}

// ==================== TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== SINGLE FULL WORKFLOW ====================
async function runSingleWorkflow(sizeKB, iteration) {
    const metrics = {};
    console.log(`\n--- Iteration ${iteration + 1} (${sizeKB} KB) ---`);

    // Patient SSI
    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    // AES encrypt
    const ehr = generateEHR(sizeKB);
    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehr, aesKey);
    metrics.aesEncrypt = ms(t);

    // Upload
    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${sizeKB}_${iteration}.enc`);
    metrics.pinataUpload = ms(t);

    // Doctor SSI
    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    // Register doctor on proxy (FIX)
    t = n();
    await proxyRegisterDoctor(doctor.did);
    metrics.proxyReg = ms(t);

    // Witness issuing
    const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
    const wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
    t = n();
    const tx = await acc.setDoctorWitness(doctor.did, wh, exp);
    const receipt = await tx.wait();
    metrics.setDoctorWitness = ms(t);
    metrics.gasWitness = Number(receipt.gasUsed);

    // Check active
    t = n();
    await acc.isDoctorActive(doctor.did);
    metrics.checkActive = ms(t);

    // Proxy encrypt AES
    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), [["doctor"]], slot);
    metrics.proxyEncrypt = ms(t);
    const ctId = encRes.ciphertext_id;

    // Rekey
    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, ['doctor']);
    metrics.proxyRekey = ms(t);

    // Reencrypt
    t = n();
    const tId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    // Decrypt key
    t = n();
    const keyB64 = await proxyDecryptAES(tId, doctor.did);
    metrics.proxyDecryptAES = ms(t);

    // Download
    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    // Decrypt EHR
    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecrypt = ms(t);

    // Total access time (doctor side)
    metrics.totalAccess = metrics.proxyRekey + metrics.proxyReencrypt +
        metrics.proxyDecryptAES + metrics.pinataDownload + metrics.aesDecrypt;

    // Revoke doctor
    t = n();
    const rvTx = await acc.revokeDoctor(doctor.did);
    const rvRcpt = await rvTx.wait();
    metrics.revokeDoctor = ms(t);
    metrics.gasRevoke = Number(rvRcpt.gasUsed);

    return { sizeKB, iteration, ...metrics };
}

// ==================== MAIN BENCHMARK LOOP ====================
async function runBenchmark() {
    console.log('🚀 Starting full benchmark on Sepolia...\n');
    const allResults = [];

    for (const sizeKB of CONFIG.EHR_SIZES_KB) {
        for (let i = 0; i < CONFIG.ITERATIONS_PER_SIZE; i++) {
            try {
                const res = await runSingleWorkflow(sizeKB, i);
                allResults.push(res);
            } catch (err) {
                console.error(`❌ Failed run (${sizeKB}KB, iter ${i}):`, err.message);
            }
        }
    }

    // Save raw JSON
    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));

    // Generate HTML report
    generateHTML(allResults);
    console.log('\n✅ Benchmark complete. Reports saved.');
}

// ==================== HTML REPORT GENERATION ====================
function generateHTML(results) {
    const sizes = CONFIG.EHR_SIZES_KB;
    const timeKeys = ['patientSSI', 'aesEncrypt', 'pinataUpload', 'doctorSSI', 'proxyReg',
        'setDoctorWitness', 'checkActive', 'proxyEncrypt', 'proxyRekey', 'proxyReencrypt',
        'proxyDecryptAES', 'pinataDownload', 'aesDecrypt', 'totalAccess', 'revokeDoctor'];
    const gasKeys = ['gasWitness', 'gasRevoke'];

    // Aggregate per size
    const agg = {};
    sizes.forEach(s => {
        const runs = results.filter(r => r.sizeKB === s);
        if (runs.length === 0) return;
        const avg = k => runs.reduce((a, b) => a + (b[k] || 0), 0) / runs.length;
        agg[s] = {};
        timeKeys.forEach(k => agg[s][k] = avg(k));
        gasKeys.forEach(k => agg[s][k] = Math.round(avg(k)));
    });

    // Build tables
    let timeTable = '<tr><th>Size (KB)</th>' + timeKeys.map(k => `<th>${k}</th>`).join('') + '</tr>';
    sizes.forEach(s => {
        if (!agg[s]) return;
        timeTable += `<tr><td>${s}</td>${timeKeys.map(k => `<td>${agg[s][k].toFixed(1)}</td>`).join('')}</tr>`;
    });
    let gasTable = '<tr><th>Size (KB)</th>' + gasKeys.map(k => `<th>${k}</th>`).join('') + '</tr>';
    sizes.forEach(s => {
        if (!agg[s]) return;
        gasTable += `<tr><td>${s}</td>${gasKeys.map(k => `<td>${agg[s][k]}</td>`).join('')}</tr>`;
    });

    // Chart data
    const chartData = JSON.stringify({
        labels: sizes,
        datasets: [{
            label: 'Total Access (ms)',
            data: sizes.map(s => agg[s] ? agg[s].totalAccess : 0),
            backgroundColor: 'rgba(79, 70, 229, 0.7)',
            borderColor: '#4f46e5',
            borderWidth: 1
        }]
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MediChain Full Benchmark - Sepolia</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f4f6fb; margin: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #1a1a2e; text-align: center; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
    th, td { padding: 12px 16px; text-align: center; }
    th { background: #4f46e5; color: white; }
    tr:nth-child(even) { background: #f9fafb; }
    .chart-container { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 2rem 0; }
    canvas { max-width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 MediChain Comprehensive Benchmark – Sepolia</h1>
    <p style="text-align:center">File sizes: ${sizes.join(', ')} KB | ${CONFIG.ITERATIONS_PER_SIZE} iterations each</p>
    <h2>⏱️ Average Timings (ms)</h2>
    <table>${timeTable}</table>
    <h2>⛽ Average Gas (wei)</h2>
    <table>${gasTable}</table>
    <div class="chart-container">
      <canvas id="timeChart" width="800" height="400"></canvas>
    </div>
    <p style="text-align:center; margin-top:2rem">Report generated on ${new Date().toLocaleString()}</p>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const ctx = document.getElementById('timeChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: ${chartData},
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Milliseconds' } } },
        plugins: { title: { display: true, text: 'Total Access Time by EHR Size' } }
      }
    });
  </script>
</body>
</html>`;
    fs.writeFileSync('full_benchmark_report.html', html);
}

runBenchmark().catch(console.error);