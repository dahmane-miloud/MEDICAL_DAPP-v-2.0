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

/*

// in here script i generate a EHR manual without synthia 


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

*/

// and in here script i generate 100 using synthia 


/*

//  this script good but he need more metric to printed and he take more time 
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');
const { spawn } = require('child_process');

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    // Synthea settings
    PATIENT_COUNT: 100,
    SYNTHEA_DIR: path.resolve(__dirname, '..', 'synthea'),
    EHR_OUTPUT_DIR: path.resolve(__dirname, 'ehr_benchmark_data'),

    // API & keys (⚠️ move to .env before sharing!)
    PINATA_API_KEY: '03959fc6abd1baa890bf',
    PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // 5‑attribute AND policy
    DOCTOR_ATTRIBUTES: ["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"],
    POLICY: [["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"]],
};

// ==================== 1. SYNTHEA GENERATION ====================
function cleanSyntheaOutput() {
    const fhirPath = path.join(CONFIG.SYNTHEA_DIR, 'output', 'fhir');
    if (fs.existsSync(fhirPath)) {
        fs.rmSync(fhirPath, { recursive: true, force: true });
    }
}

function runSynthea(patientCount) {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'run_synthea.bat' : './run_synthea';
        const args = ['-p', patientCount.toString()];

        console.log(`🟢 Generating ${patientCount} patients with Synthea...`);
        const child = spawn(command, args, {
            cwd: CONFIG.SYNTHEA_DIR,
            shell: isWindows ? true : '/bin/bash',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stdout += d.toString()));

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Synthea exited with code ${code}\n${stdout}`));
            } else {
                console.log('✅ Synthea generation complete.');
                resolve();
            }
        });
    });
}

function prepareEHRFiles(sourceDir, destDir) {
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });

    const srcFhir = path.join(sourceDir, 'output', 'fhir');
    if (!fs.existsSync(srcFhir)) {
        throw new Error(`Synthea output not found: ${srcFhir}`);
    }

    const files = fs.readdirSync(srcFhir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
        throw new Error('No FHIR files generated by Synthea.');
    }

    files.forEach(f => {
        fs.copyFileSync(path.join(srcFhir, f), path.join(destDir, f));
    });

    console.log(`📂 Copied ${files.length} FHIR files to ${destDir}`);
    return files.length;
}

// ==================== 2. CRYPTO UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: encodeBase64(keyPair.secretKey) };
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
    for (const gw of [
        'https://gateway.pinata.cloud/ipfs',
        'https://ipfs.io/ipfs',
        'https://cloudflare-ipfs.com/ipfs'
    ]) {
        try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(res.data);
        } catch (e) {}
    }
    throw new Error('Pinata download failed');
}

// ==================== 3. BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const wallet = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
const acc = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, [
    "function setDoctorWitness(string, bytes32, uint64) external",
    "function revokeDoctor(string) external",
    "function isDoctorActive(string) view returns (bool)",
], wallet);

// ==================== 4. PROXY (PRE) HELPERS ====================
async function proxyRegisterDoctor(did, attributes) {
    await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, {
        doctor_did: did,
        attributes: attributes
    });
}

async function proxyEncryptAES(keyB64, policy, timeSlot) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, {
        aes_key_b64: keyB64,
        policy: policy,
        time_slot: timeSlot
    });
    return data; // { ciphertext_id, ciphertext }
}

async function proxyRekey(ctId, did, attrs) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, {
        ct_id: ctId,
        delegatee_did: did,
        delegatee_attrs: attrs
    });
    return data.rekey_id;
}

async function proxyReencrypt(rekeyId) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return data.transformed_ct_id;
}

async function proxyDecryptAES(transformedCtId, doctorDid) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, {
        transformed_ct_id: transformedCtId,
        doctor_did: doctorDid
    });
    return data.aes_key_b64;
}

// ==================== 5. TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== 6. FULL WORKFLOW PER PATIENT ====================
async function runSingleWorkflow(ehrData, index) {
    const metrics = {};
    const fileName = path.basename(ehrData.filePath);
    const fileSizeKB = ehrData.sizeKB;
    console.log(`\n--- File ${index + 1}: ${fileName} (${fileSizeKB.toFixed(1)} KB) ---`);

    // ----- Generate all identities -----
    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    t = n();
    const healthDept = generateSSI();
    metrics.healthDeptSSI = ms(t);

    // ----- AES encrypt EHR -----
    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehrData.buffer, aesKey);
    metrics.aesEncryptEHR = ms(t);

    // ----- Upload to IPFS -----
    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${index}_${fileName}`);
    metrics.pinataUpload = ms(t);

    // ----- Register doctor on PRE proxy with full attributes -----
    t = n();
    await proxyRegisterDoctor(doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.registerDoctor = ms(t);

    // ----- Health department sets witness on chain -----
    const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
    const wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
    t = n();
    const txWitness = await acc.setDoctorWitness(doctor.did, wh, exp);
    const receiptWitness = await txWitness.wait();
    metrics.setWitness = ms(t);
    metrics.gasWitness = Number(receiptWitness.gasUsed);

    // ----- Verify witness (doctor is active) -----
    t = n();
    await acc.isDoctorActive(doctor.did);
    metrics.checkWitness = ms(t);

    // ----- Proxy encrypt AES key with 5‑attribute AND policy -----
    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), CONFIG.POLICY, slot);
    metrics.proxyEncryptKey = ms(t);
    const ctId = encRes.ciphertext_id;

    // ----- Request re‑encryption key (share request) -----
    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.proxyRekey = ms(t);

    // ----- Perform re‑encryption (share) -----
    t = n();
    const transformedId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    // ----- Doctor decrypts AES key via proxy -----
    t = n();
    const keyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptKey = ms(t);

    // ----- Download encrypted file from IPFS -----
    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    // ----- AES decrypt EHR -----
    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecryptEHR = ms(t);

    // ----- Revoke doctor's witness -----
    t = n();
    const txRevoke = await acc.revokeDoctor(doctor.did);
    const receiptRevoke = await txRevoke.wait();
    metrics.revokeWitness = ms(t);
    metrics.gasRevoke = Number(receiptRevoke.gasUsed);

    // ----- Composite metrics -----
    metrics.totalShareTime = metrics.proxyRekey + metrics.proxyReencrypt + metrics.proxyDecryptKey;
    metrics.totalAccessTime = metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR;
    metrics.totalWorkflowTime = metrics.patientSSI + metrics.doctorSSI + metrics.healthDeptSSI
        + metrics.aesEncryptEHR + metrics.pinataUpload + metrics.registerDoctor
        + metrics.setWitness + metrics.checkWitness + metrics.proxyEncryptKey
        + metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR
        + metrics.revokeWitness;
    metrics.gasTotal = metrics.gasWitness + metrics.gasRevoke;

    return { fileName, sizeKB: fileSizeKB, ...metrics };
}

// ==================== 7. MAIN BENCHMARK ====================
async function runBenchmark() {
    console.log('🚀 Starting full benchmark with 5‑attribute AND policy...\n');

    // Clean old Synthea output and generate fresh 100 patients
    cleanSyntheaOutput();
    await runSynthea(CONFIG.PATIENT_COUNT);

    // Copy FHIR files to local benchmark folder
    prepareEHRFiles(CONFIG.SYNTHEA_DIR, CONFIG.EHR_OUTPUT_DIR);

    // Load files
    const files = fs.readdirSync(CONFIG.EHR_OUTPUT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const fullPath = path.join(CONFIG.EHR_OUTPUT_DIR, f);
            const buffer = fs.readFileSync(fullPath);
            return { filePath: fullPath, buffer, sizeKB: buffer.length / 1024 };
        });

    console.log(`📊 Loaded ${files.length} EHR files for benchmarking.\n`);

    const allResults = [];
    for (let i = 0; i < files.length; i++) {
        try {
            const res = await runSingleWorkflow(files[i], i);
            allResults.push(res);
        } catch (err) {
            console.error(`❌ Failed on ${path.basename(files[i].filePath)}:`, err.message);
        }
    }

    // Save results
    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));
    generateHTML(allResults);
    console.log('\n✅ Benchmark complete. Reports:');
    console.log('   - benchmark_full_results.json');
    console.log('   - benchmark_report.html');
}

// ==================== 8. HTML REPORT ====================
function generateHTML(results) {
    // Prepare data for scatter chart
    const scatterData = results.map(r => ({ x: r.sizeKB, y: r.totalAccessTime }));

    // Prepare summary table by size buckets
    const buckets = [0, 50, 100, 200, 400, 800, 1600];
    const bucketRows = [];
    buckets.forEach((low, i) => {
        const high = buckets[i + 1] || Infinity;
        const inRange = results.filter(r => r.sizeKB >= low && r.sizeKB < high);
        if (inRange.length > 0) {
            const avgAccess = (inRange.reduce((s, r) => s + r.totalAccessTime, 0) / inRange.length).toFixed(1);
            const avgGas = Math.round(inRange.reduce((s, r) => s + r.gasTotal, 0) / inRange.length);
            bucketRows.push(`
                <tr>
                    <td>${low} – ${high === Infinity ? '∞' : high} KB</td>
                    <td>${inRange.length}</td>
                    <td>${avgAccess} ms</td>
                    <td>${avgGas}</td>
                </tr>
            `);
        }
    });

    // Detailed table (first 10 samples)
    const sampleRows = results.slice(0, 10).map(r => `
        <tr>
            <td>${r.fileName}</td>
            <td>${r.sizeKB.toFixed(1)}</td>
            <td>${r.totalAccessTime.toFixed(1)}</td>
            <td>${r.gasTotal}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MediChain Benchmark – 100 Real FHIR Patients (Sepolia)</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f6fb; margin: 2rem; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #1a1a2e; text-align: center; }
        h2 { color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        th, td { padding: 12px 16px; text-align: center; }
        th { background: #4f46e5; color: white; }
        tr:nth-child(even) { background: #f9fafb; }
        .chart-container { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 2rem 0; }
        canvas { max-width: 100%; }
        .summary { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        .note { text-align: center; color: #555; margin-top: 2rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 MediChain Comprehensive Benchmark – 100 Real FHIR Patients</h1>
        <p style="text-align:center">Sepolia testnet | 5‑attribute AND policy | ${new Date().toLocaleString()}</p>

        <div class="summary">
            <h2>📈 Total Access Time vs File Size</h2>
            <div class="chart-container"><canvas id="scatterChart" width="800" height="400"></canvas></div>
        </div>

        <h2>📊 Aggregated Metrics by File Size</h2>
        <table>
            <tr><th>Size Bucket</th><th>Number of Files</th><th>Avg Total Access (ms)</th><th>Avg Gas (wei)</th></tr>
            ${bucketRows.join('')}
        </table>

        <h2>📄 Sample Individual Results (first 10)</h2>
        <table>
            <tr><th>File Name</th><th>Size (KB)</th><th>Total Access (ms)</th><th>Gas Used</th></tr>
            ${sampleRows}
        </table>

        <div class="note">
            <p>Full per‑file metrics are saved in <code>benchmark_full_results.json</code>.</p>
            <p>Policy: <strong>${CONFIG.DOCTOR_ATTRIBUTES.join(' AND ')}</strong></p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        const ctx = document.getElementById('scatterChart').getContext('2d');
        new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Total Access Time (ms)',
                    data: ${JSON.stringify(scatterData)},
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { title: { display: true, text: 'File Size (KB)' } },
                    y: { title: { display: true, text: 'Total Access Time (ms)' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => 'Size: ' + ctx.raw.x.toFixed(1) + ' KB, Time: ' + ctx.raw.y.toFixed(1) + ' ms'
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
    fs.writeFileSync('benchmark_report.html', html);
}

// ==================== START ====================
runBenchmark().catch(console.error);

*/
/*

//  the script is good but we need to fix api keys of pinata

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');
const { spawn } = require('child_process');

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    // Synthea settings
    PATIENT_COUNT: 100,
    SYNTHEA_DIR: path.resolve(__dirname, '..', 'synthea'),
    EHR_OUTPUT_DIR: path.resolve(__dirname, 'ehr_benchmark_data'),

    // Pinata JWT (⚠️ REPLACE WITH YOUR OWN JWT)
    PINATA_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZTZhMjdiZi03MDM5LTQ5NzctYTMwNi1jNTQ2Y2YyMjEzYzQiLCJlbWFpbCI6ImlwZnN0ZXN0MkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiOWJhMzdkMjk1NWVlODRlYWQ0N2QiLCJzY29wZWRLZXlTZWNyZXQiOiJmZjA2ZjIwNGZhNmY4MTRkMGFiNjAyNWJiNzNmZWNmMDNmZDdmNWY3MmE1NTQ4ZTQwNWVmY2QwNThmYTYyMGFjIiwiZXhwIjoxODExNDAyMjI5fQ.vVWR1MSfzzUI6oPMjhlRZsNH3hvQVdZaaHtxP8RQsFE',

    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // 5‑attribute AND policy
    DOCTOR_ATTRIBUTES: ["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"],
    POLICY: [["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"]],

    // Cost conversion (approximate)
    ETH_PRICE_USD: 2500,
    USD_TO_DZD: 135,
    GAS_PRICE_GWEI: 20,
};

// ==================== 1. SYNTHEA GENERATION ====================
function cleanSyntheaOutput() {
    const fhirPath = path.join(CONFIG.SYNTHEA_DIR, 'output', 'fhir');
    if (fs.existsSync(fhirPath)) {
        fs.rmSync(fhirPath, { recursive: true, force: true });
    }
}

function runSynthea(patientCount) {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'run_synthea.bat' : './run_synthea';
        const args = ['-p', patientCount.toString()];

        console.log(`🟢 Generating ${patientCount} patients with Synthea...`);
        const child = spawn(command, args, {
            cwd: CONFIG.SYNTHEA_DIR,
            shell: isWindows ? true : '/bin/bash',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stdout += d.toString()));

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Synthea exited with code ${code}\n${stdout}`));
            } else {
                console.log('✅ Synthea generation complete.');
                resolve();
            }
        });
    });
}

function prepareEHRFiles(sourceDir, destDir) {
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });

    const srcFhir = path.join(sourceDir, 'output', 'fhir');
    if (!fs.existsSync(srcFhir)) {
        throw new Error(`Synthea output not found: ${srcFhir}`);
    }

    const files = fs.readdirSync(srcFhir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
        throw new Error('No FHIR files generated by Synthea.');
    }

    files.forEach(f => {
        fs.copyFileSync(path.join(srcFhir, f), path.join(destDir, f));
    });

    console.log(`📂 Copied ${files.length} FHIR files to ${destDir}`);
    return files.length;
}

// ==================== 2. CRYPTO UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: encodeBase64(keyPair.secretKey) };
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

// ==================== 🔧 Pinata with JWT ====================
async function pinataUpload(buffer, filename) {
    const fd = new FormData();
    fd.append('file', buffer, { filename });
    fd.append('pinataMetadata', JSON.stringify({ name: filename }));

    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
        headers: {
            ...fd.getHeaders(),
            Authorization: `Bearer ${CONFIG.PINATA_JWT}`,
        },
        maxBodyLength: Infinity,
    });
    return res.data.IpfsHash;
}

async function pinataDownload(cid) {
    for (const gw of [
        'https://gateway.pinata.cloud/ipfs',
        'https://ipfs.io/ipfs',
        'https://cloudflare-ipfs.com/ipfs'
    ]) {
        try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(res.data);
        } catch (e) {}
    }
    throw new Error('Pinata download failed');
}

// ==================== 3. BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const wallet = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
const acc = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, [
    "function setDoctorWitness(string, bytes32, uint64) external",
    "function revokeDoctor(string) external",
    "function isDoctorActive(string) view returns (bool)",
], wallet);

// Check if we have enough ETH for a transaction (0.001 ETH buffer)
async function hasEnoughEth() {
    const balance = await provider.getBalance(wallet.address);
    const txCostEstimate = ethers.parseEther("0.001"); // roughly 1 million gas * 20 gwei
    return balance >= txCostEstimate;
}

// ==================== 4. PROXY (PRE) HELPERS ====================
async function proxyRegisterDoctor(did, attributes) {
    await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, {
        doctor_did: did,
        attributes: attributes
    });
}

async function proxyEncryptAES(keyB64, policy, timeSlot) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, {
        aes_key_b64: keyB64,
        policy: policy,
        time_slot: timeSlot
    });
    return data;
}

async function proxyRekey(ctId, did, attrs) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, {
        ct_id: ctId,
        delegatee_did: did,
        delegatee_attrs: attrs
    });
    return data.rekey_id;
}

async function proxyReencrypt(rekeyId) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return data.transformed_ct_id;
}

async function proxyDecryptAES(transformedCtId, doctorDid) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, {
        transformed_ct_id: transformedCtId,
        doctor_did: doctorDid
    });
    return data.aes_key_b64;
}

// ==================== 5. TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== 6. FULL WORKFLOW PER PATIENT ====================
async function runSingleWorkflow(ehrData, index) {
    const metrics = {};
    const fileName = path.basename(ehrData.filePath);
    const fileSizeKB = ehrData.sizeKB;
    console.log(`\n--- File ${index + 1}: ${fileName} (${fileSizeKB.toFixed(1)} KB) ---`);

    // ----- Generate all identities -----
    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    t = n();
    const healthDept = generateSSI();
    metrics.healthDeptSSI = ms(t);

    // ----- AES encrypt EHR -----
    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehrData.buffer, aesKey);
    metrics.aesEncryptEHR = ms(t);

    // ----- Upload to IPFS -----
    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${index}_${fileName}`);
    metrics.pinataUpload = ms(t);

    // ----- Register doctor on PRE proxy -----
    t = n();
    await proxyRegisterDoctor(doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.registerDoctor = ms(t);

    // ----- Blockchain witness set (only if enough ETH) -----
    let witnessSet = false;
    let exp, wh;
    if (await hasEnoughEth()) {
        exp = Math.floor(Date.now() / 1000) + 365 * 86400;
        wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
        t = n();
        try {
            const txWitness = await acc.setDoctorWitness(doctor.did, wh, exp);
            const receiptWitness = await txWitness.wait();
            metrics.setWitness = ms(t);
            metrics.gasWitness = Number(receiptWitness.gasUsed);
            witnessSet = true;
        } catch (err) {
            console.warn('   ⚠️ Witness set failed (likely insufficient funds), skipping blockchain steps.');
            metrics.setWitness = 0;
            metrics.gasWitness = 0;
        }
    } else {
        console.warn('   ⚠️ Not enough Sepolia ETH to set witness. Skipping blockchain transactions.');
        metrics.setWitness = 0;
        metrics.gasWitness = 0;
    }

    // ----- Verify witness (only if witness was set) -----
    if (witnessSet) {
        t = n();
        await acc.isDoctorActive(doctor.did);
        metrics.checkWitness = ms(t);
    } else {
        metrics.checkWitness = 0;
    }

    // ----- Proxy encrypt AES key with 5‑attribute AND policy -----
    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), CONFIG.POLICY, slot);
    metrics.proxyEncryptKey = ms(t);
    const ctId = encRes.ciphertext_id;

    // ----- Rekey / share request -----
    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.proxyRekey = ms(t);

    // ----- Reencrypt -----
    t = n();
    const transformedId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    // ----- Doctor decrypts AES key -----
    t = n();
    const keyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptKey = ms(t);

    // ----- Download encrypted file from IPFS -----
    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    // ----- AES decrypt EHR -----
    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecryptEHR = ms(t);

    // ----- Revoke witness (if set) -----
    if (witnessSet && await hasEnoughEth()) {
        t = n();
        try {
            const txRevoke = await acc.revokeDoctor(doctor.did);
            const receiptRevoke = await txRevoke.wait();
            metrics.revokeWitness = ms(t);
            metrics.gasRevoke = Number(receiptRevoke.gasUsed);
        } catch (err) {
            console.warn('   ⚠️ Revoke failed (funds?) – recording 0.');
            metrics.revokeWitness = 0;
            metrics.gasRevoke = 0;
        }
    } else {
        metrics.revokeWitness = 0;
        metrics.gasRevoke = 0;
    }

    // ----- Composite metrics -----
    metrics.totalShareTime = metrics.proxyRekey + metrics.proxyReencrypt + metrics.proxyDecryptKey;
    metrics.totalAccessTime = metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR;
    metrics.totalWorkflowTime = metrics.patientSSI + metrics.doctorSSI + metrics.healthDeptSSI
        + metrics.aesEncryptEHR + metrics.pinataUpload + metrics.registerDoctor
        + (metrics.setWitness || 0) + (metrics.checkWitness || 0) + metrics.proxyEncryptKey
        + metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR
        + (metrics.revokeWitness || 0);
    metrics.gasTotal = (metrics.gasWitness || 0) + (metrics.gasRevoke || 0);

    // Gas cost conversion
    const wei = metrics.gasTotal * CONFIG.GAS_PRICE_GWEI * 1e9;
    const eth = wei / 1e18;
    metrics.gasCostETH = eth;
    metrics.gasCostUSD = eth * CONFIG.ETH_PRICE_USD;
    metrics.gasCostDZD = metrics.gasCostUSD * CONFIG.USD_TO_DZD;

    return { fileName, sizeKB: fileSizeKB, ...metrics };
}

// ==================== 7. MAIN BENCHMARK ====================
async function runBenchmark() {
    console.log('🚀 Starting full benchmark with 5‑attribute AND policy...\n');

    // Check wallet balance once at start
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet: ${wallet.address}  Balance: ${ethers.formatEther(balance)} ETH`);
    if (balance < ethers.parseEther("0.001")) {
        console.warn('⚠️  Low Sepolia ETH – blockchain transactions will be skipped. Get more from a faucet.');
    }

    let regenerate = true;
    if (fs.existsSync(CONFIG.EHR_OUTPUT_DIR)) {
        const existing = fs.readdirSync(CONFIG.EHR_OUTPUT_DIR).filter(f => f.endsWith('.json'));
        if (existing.length === CONFIG.PATIENT_COUNT) {
            console.log(`📁 Found ${existing.length} existing EHR files, skipping generation.`);
            regenerate = false;
        }
    }

    if (regenerate) {
        cleanSyntheaOutput();
        await runSynthea(CONFIG.PATIENT_COUNT);
        prepareEHRFiles(CONFIG.SYNTHEA_DIR, CONFIG.EHR_OUTPUT_DIR);
    }

    const files = fs.readdirSync(CONFIG.EHR_OUTPUT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const fullPath = path.join(CONFIG.EHR_OUTPUT_DIR, f);
            const buffer = fs.readFileSync(fullPath);
            return { filePath: fullPath, buffer, sizeKB: buffer.length / 1024 };
        });

    console.log(`📊 Loaded ${files.length} EHR files for benchmarking.\n`);

    const allResults = [];
    for (let i = 0; i < files.length; i++) {
        try {
            const res = await runSingleWorkflow(files[i], i);
            allResults.push(res);
        } catch (err) {
            console.error(`❌ Failed on ${path.basename(files[i].filePath)}:`, err.message);
            allResults.push({ fileName: path.basename(files[i].filePath), sizeKB: files[i].sizeKB, error: err.message });
        }
    }

    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));

    // Compute min/max/avg for every metric
    const metricsKeys = [
        'patientSSI', 'doctorSSI', 'healthDeptSSI',
        'aesEncryptEHR', 'pinataUpload', 'registerDoctor',
        'setWitness', 'checkWitness', 'proxyEncryptKey',
        'proxyRekey', 'proxyReencrypt', 'proxyDecryptKey',
        'pinataDownload', 'aesDecryptEHR', 'revokeWitness',
        'totalShareTime', 'totalAccessTime', 'totalWorkflowTime',
        'gasWitness', 'gasRevoke', 'gasTotal',
        'gasCostETH', 'gasCostUSD', 'gasCostDZD'
    ];

    const stats = {};
    metricsKeys.forEach(key => {
        const valid = allResults.filter(r => r[key] !== undefined).map(r => r[key]);
        if (valid.length) {
            stats[key] = {
                min: Math.min(...valid),
                max: Math.max(...valid),
                avg: valid.reduce((a, b) => a + b, 0) / valid.length
            };
        }
    });

    fs.writeFileSync('benchmark_aggregated_stats.json', JSON.stringify(stats, null, 2));

    generateHTML(allResults, stats);
    console.log('\n✅ Benchmark complete. Reports:');
    console.log('   - benchmark_full_results.json');
    console.log('   - benchmark_aggregated_stats.json');
    console.log('   - benchmark_report.html');
}

// ==================== 8. HTML REPORT ====================
function generateHTML(results, stats) {
    const scatterData = results.filter(r => r.totalAccessTime !== undefined).map(r => ({ x: r.sizeKB, y: r.totalAccessTime }));

    const stepLabels = [
        'Patient SSI', 'Doctor SSI', 'Health Dept SSI',
        'AES Encrypt', 'Pinata Upload', 'Register Doc', 'Set Witness', 'Check Witness',
        'Proxy Encrypt', 'Rekey', 'Reencrypt', 'Decrypt Key', 'Pinata Download', 'AES Decrypt', 'Revoke Witness'
    ];
    const stepKeys = [
        'patientSSI', 'doctorSSI', 'healthDeptSSI',
        'aesEncryptEHR', 'pinataUpload', 'registerDoctor', 'setWitness', 'checkWitness',
        'proxyEncryptKey', 'proxyRekey', 'proxyReencrypt', 'proxyDecryptKey',
        'pinataDownload', 'aesDecryptEHR', 'revokeWitness'
    ];
    const avgTimes = stepKeys.map(k => stats[k] ? stats[k].avg : 0);

    const allStatRows = [
        { label: 'Patient SSI', key: 'patientSSI', unit: 'ms' },
        { label: 'Doctor SSI', key: 'doctorSSI', unit: 'ms' },
        { label: 'Health Dept SSI', key: 'healthDeptSSI', unit: 'ms' },
        { label: 'AES Encrypt EHR', key: 'aesEncryptEHR', unit: 'ms' },
        { label: 'Pinata Upload', key: 'pinataUpload', unit: 'ms' },
        { label: 'Register Doctor (PRE)', key: 'registerDoctor', unit: 'ms' },
        { label: 'Set Witness (Blockchain)', key: 'setWitness', unit: 'ms' },
        { label: 'Check Witness', key: 'checkWitness', unit: 'ms' },
        { label: 'Proxy Encrypt Key', key: 'proxyEncryptKey', unit: 'ms' },
        { label: 'Proxy Rekey (share request)', key: 'proxyRekey', unit: 'ms' },
        { label: 'Proxy Reencrypt (share)', key: 'proxyReencrypt', unit: 'ms' },
        { label: 'Proxy Decrypt Key', key: 'proxyDecryptKey', unit: 'ms' },
        { label: 'Pinata Download', key: 'pinataDownload', unit: 'ms' },
        { label: 'AES Decrypt EHR', key: 'aesDecryptEHR', unit: 'ms' },
        { label: 'Revoke Witness', key: 'revokeWitness', unit: 'ms' },
        { label: 'Total Share Time', key: 'totalShareTime', unit: 'ms' },
        { label: 'Total Access Time', key: 'totalAccessTime', unit: 'ms' },
        { label: 'Total Workflow Time', key: 'totalWorkflowTime', unit: 'ms' },
        { label: 'Gas Witness', key: 'gasWitness', unit: 'wei' },
        { label: 'Gas Revoke', key: 'gasRevoke', unit: 'wei' },
        { label: 'Gas Total', key: 'gasTotal', unit: 'wei' },
        { label: 'Gas Cost (ETH)', key: 'gasCostETH', unit: 'ETH' },
        { label: 'Gas Cost (USD)', key: 'gasCostUSD', unit: 'USD' },
        { label: 'Gas Cost (DZD)', key: 'gasCostDZD', unit: 'DZD' }
    ];

    const statTableRows = allStatRows.map(row => {
        const s = stats[row.key];
        if (!s) return '';
        const isCost = row.key.includes('gasCost');
        return `<tr>
            <td>${row.label}</td>
            <td>${isCost ? s.min.toFixed(6) : s.min.toFixed(1)}</td>
            <td>${isCost ? s.max.toFixed(6) : s.max.toFixed(1)}</td>
            <td>${isCost ? s.avg.toFixed(6) : s.avg.toFixed(1)}</td>
            <td>${row.unit}</td>
        </tr>`;
    }).join('');

    const sampleRows = results.slice(0, 10).map(r => `
        <tr>
            <td>${r.fileName}</td>
            <td>${r.sizeKB.toFixed(1)}</td>
            <td>${r.totalAccessTime ? r.totalAccessTime.toFixed(1) : 'N/A'}</td>
            <td>${r.gasTotal || 'N/A'}</td>
            <td>${r.gasCostDZD ? r.gasCostDZD.toFixed(4) : 'N/A'}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MediChain Benchmark – 100 Real FHIR Patients</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f6fb; margin: 2rem; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #1a1a2e; text-align: center; }
        h2 { color: #2c3e50; margin-top: 2rem; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        th, td { padding: 12px 16px; text-align: center; }
        th { background: #4f46e5; color: white; }
        tr:nth-child(even) { background: #f9fafb; }
        .chart-container { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 2rem 0; }
        canvas { max-width: 100%; }
        .summary { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        .note { text-align: center; color: #555; margin-top: 2rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 MediChain Comprehensive Benchmark – 100 Real FHIR Patients</h1>
        <p style="text-align:center">Sepolia testnet | 5‑attribute AND policy | ${new Date().toLocaleString()}</p>

        <div class="summary">
            <h2>📈 Total Access Time vs File Size</h2>
            <div class="chart-container"><canvas id="scatterChart" width="800" height="400"></canvas></div>
        </div>

        <div class="summary">
            <h2>⏱️ Average Time per Step (ms)</h2>
            <div class="chart-container"><canvas id="barChart" width="800" height="400"></canvas></div>
        </div>

        <h2>📊 Aggregated Metrics (Min / Max / Average) – All 100 Runs</h2>
        <table>
            <tr><th>Metric</th><th>Min</th><th>Max</th><th>Average</th><th>Unit</th></tr>
            ${statTableRows}
        </table>

        <h2>📄 Sample Individual Results (first 10)</h2>
        <table>
            <tr><th>File Name</th><th>Size (KB)</th><th>Total Access (ms)</th><th>Gas Used</th><th>Gas Cost (DZD)</th></tr>
            ${sampleRows}
        </table>

        <div class="note">
            <p>Full per‑file metrics in <code>benchmark_full_results.json</code> · Aggregated stats in <code>benchmark_aggregated_stats.json</code></p>
            <p>Policy: <strong>${CONFIG.DOCTOR_ATTRIBUTES.join(' AND ')}</strong></p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        const ctxScatter = document.getElementById('scatterChart').getContext('2d');
        new Chart(ctxScatter, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Total Access Time (ms)',
                    data: ${JSON.stringify(scatterData)},
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { title: { display: true, text: 'File Size (KB)' } },
                    y: { title: { display: true, text: 'Total Access Time (ms)' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => 'Size: ' + ctx.raw.x.toFixed(1) + ' KB, Time: ' + ctx.raw.y.toFixed(1) + ' ms'
                        }
                    }
                }
            }
        });

        const ctxBar = document.getElementById('barChart').getContext('2d');
        new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(stepLabels)},
                datasets: [{
                    label: 'Average Time (ms)',
                    data: ${JSON.stringify(avgTimes)},
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Milliseconds' } }
                }
            }
        });
    </script>
</body>
</html>`;
    fs.writeFileSync('benchmark_report.html', html);
}

// ==================== START ====================
runBenchmark().catch(console.error);
*/
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');
const { spawn } = require('child_process');

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    // Synthea settings
    PATIENT_COUNT: 100,                              // exactly 100 EHRs will be processed
    SYNTHEA_DIR: path.resolve(__dirname, '..', 'synthea'),
    EHR_OUTPUT_DIR: path.resolve(__dirname, 'ehr_benchmark_data'),

    // === NEW Pinata JWT (⚠️ NEVER SHARE THIS PUBLICLY) ===
    PINATA_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZTZhMjdiZi03MDM5LTQ5NzctYTMwNi1jNTQ2Y2YyMjEzYzQiLCJlbWFpbCI6ImlwZnN0ZXN0MkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDkyODYwODUzNDVmMTlhZWI0N2QiLCJzY29wZWRLZXlTZWNyZXQiOiJlMmZmZGZlNDAwYjI4ZmE5MDY2OGQ2NWM0MzRiMDI5MDIyYjFiNWI4NGQwMTY2OTA4ZWE1ZjUxMGU4OTExOTM5IiwiZXhwIjoxODExNDg0MDkyfQ.avTD8CQwW8X6dCl4Dw_Cfu8KmL-65-7ErYILs9IoBjM',

    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // 5‑attribute AND policy
    DOCTOR_ATTRIBUTES: ["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"],
    POLICY: [["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"]],

    // Cost conversion (approximate)
    ETH_PRICE_USD: 2500,
    USD_TO_DZD: 135,
    GAS_PRICE_GWEI: 20,
};

// ==================== 1. SYNTHEA GENERATION ====================
function cleanSyntheaOutput() {
    const fhirPath = path.join(CONFIG.SYNTHEA_DIR, 'output', 'fhir');
    if (fs.existsSync(fhirPath)) {
        fs.rmSync(fhirPath, { recursive: true, force: true });
    }
}

function runSynthea(patientCount) {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'run_synthea.bat' : './run_synthea';
        const args = ['-p', patientCount.toString()];

        console.log(`🟢 Generating ${patientCount} patients with Synthea...`);
        const child = spawn(command, args, {
            cwd: CONFIG.SYNTHEA_DIR,
            shell: isWindows ? true : '/bin/bash',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stdout += d.toString()));

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Synthea exited with code ${code}\n${stdout}`));
            } else {
                console.log('✅ Synthea generation complete.');
                resolve();
            }
        });
    });
}

function prepareEHRFiles(sourceDir, destDir) {
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });

    const srcFhir = path.join(sourceDir, 'output', 'fhir');
    if (!fs.existsSync(srcFhir)) {
        throw new Error(`Synthea output not found: ${srcFhir}`);
    }

    let files = fs.readdirSync(srcFhir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
        throw new Error('No FHIR files generated by Synthea.');
    }

    // Enforce exactly PATIENT_COUNT files
    if (files.length > CONFIG.PATIENT_COUNT) {
        console.warn(`⚠️  Synthea generated ${files.length} files, trimming to ${CONFIG.PATIENT_COUNT}.`);
        files = files.slice(0, CONFIG.PATIENT_COUNT);
    } else if (files.length < CONFIG.PATIENT_COUNT) {
        console.warn(`⚠️  Only ${files.length} files generated, proceeding with that number.`);
    }

    files.forEach(f => {
        fs.copyFileSync(path.join(srcFhir, f), path.join(destDir, f));
    });

    console.log(`📂 Copied ${files.length} FHIR files to ${destDir}`);
    return files.length;
}

// ==================== 2. CRYPTO UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: encodeBase64(keyPair.secretKey) };
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

// ==================== 🔧 Pinata with NEW JWT ====================
async function pinataUpload(buffer, filename) {
    const fd = new FormData();
    fd.append('file', buffer, { filename });
    fd.append('pinataMetadata', JSON.stringify({ name: filename }));

    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
        headers: {
            ...fd.getHeaders(),
            Authorization: `Bearer ${CONFIG.PINATA_JWT}`,
        },
        maxBodyLength: Infinity,
    });
    return res.data.IpfsHash;
}

async function pinataDownload(cid) {
    for (const gw of [
        'https://gateway.pinata.cloud/ipfs',
        'https://ipfs.io/ipfs',
        'https://cloudflare-ipfs.com/ipfs'
    ]) {
        try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(res.data);
        } catch (e) {}
    }
    throw new Error('Pinata download failed');
}

// ==================== 3. BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const wallet = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
const acc = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, [
    "function setDoctorWitness(string, bytes32, uint64) external",
    "function revokeDoctor(string) external",
    "function isDoctorActive(string) view returns (bool)",
], wallet);

async function hasEnoughEth() {
    const balance = await provider.getBalance(wallet.address);
    return balance >= ethers.parseEther("0.001");
}

// ==================== 4. PROXY (PRE) HELPERS ====================
async function proxyRegisterDoctor(did, attributes) {
    await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, {
        doctor_did: did,
        attributes: attributes
    });
}

async function proxyEncryptAES(keyB64, policy, timeSlot) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, {
        aes_key_b64: keyB64,
        policy: policy,
        time_slot: timeSlot
    });
    return data;
}

async function proxyRekey(ctId, did, attrs) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, {
        ct_id: ctId,
        delegatee_did: did,
        delegatee_attrs: attrs
    });
    return data.rekey_id;
}

async function proxyReencrypt(rekeyId) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
    return data.transformed_ct_id;
}

async function proxyDecryptAES(transformedCtId, doctorDid) {
    const { data } = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, {
        transformed_ct_id: transformedCtId,
        doctor_did: doctorDid
    });
    return data.aes_key_b64;
}

// ==================== 5. TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== 6. FULL WORKFLOW PER PATIENT ====================
async function runSingleWorkflow(ehrData, index) {
    const metrics = {};
    const fileName = path.basename(ehrData.filePath);
    const fileSizeKB = ehrData.sizeKB;
    console.log(`\n--- File ${index + 1}: ${fileName} (${fileSizeKB.toFixed(1)} KB) ---`);

    // ----- Generate all identities -----
    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    t = n();
    const healthDept = generateSSI();
    metrics.healthDeptSSI = ms(t);

    // ----- AES encrypt EHR -----
    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehrData.buffer, aesKey);
    metrics.aesEncryptEHR = ms(t);

    // ----- Upload to IPFS -----
    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${index}_${fileName}`);
    metrics.pinataUpload = ms(t);

    // ----- Register doctor on PRE proxy -----
    t = n();
    await proxyRegisterDoctor(doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.registerDoctor = ms(t);

    // ----- Blockchain witness set -----
    let witnessSet = false;
    let exp, wh;
    if (await hasEnoughEth()) {
        exp = Math.floor(Date.now() / 1000) + 365 * 86400;
        wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
        t = n();
        try {
            const txWitness = await acc.setDoctorWitness(doctor.did, wh, exp);
            const receiptWitness = await txWitness.wait();
            metrics.setWitness = ms(t);
            metrics.gasWitness = Number(receiptWitness.gasUsed);
            witnessSet = true;
        } catch (err) {
            console.warn('   ⚠️ Witness set failed, skipping blockchain steps.');
            metrics.setWitness = 0;
            metrics.gasWitness = 0;
        }
    } else {
        console.warn('   ⚠️ Not enough Sepolia ETH. Skipping blockchain transactions.');
        metrics.setWitness = 0;
        metrics.gasWitness = 0;
    }

    // ----- Verify witness -----
    if (witnessSet) {
        t = n();
        await acc.isDoctorActive(doctor.did);
        metrics.checkWitness = ms(t);
    } else {
        metrics.checkWitness = 0;
    }

    // ----- Proxy encrypt AES key with 5‑attribute AND policy -----
    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), CONFIG.POLICY, slot);
    metrics.proxyEncryptKey = ms(t);
    const ctId = encRes.ciphertext_id;

    // ----- Rekey / share request -----
    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.proxyRekey = ms(t);

    // ----- Reencrypt -----
    t = n();
    const transformedId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    // ----- Doctor decrypts AES key -----
    t = n();
    const keyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptKey = ms(t);

    // ----- Download encrypted file from IPFS -----
    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    // ----- AES decrypt EHR -----
    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecryptEHR = ms(t);

    // ----- Revoke witness -----
    if (witnessSet && await hasEnoughEth()) {
        t = n();
        try {
            const txRevoke = await acc.revokeDoctor(doctor.did);
            const receiptRevoke = await txRevoke.wait();
            metrics.revokeWitness = ms(t);
            metrics.gasRevoke = Number(receiptRevoke.gasUsed);
        } catch (err) {
            console.warn('   ⚠️ Revoke failed – recording 0.');
            metrics.revokeWitness = 0;
            metrics.gasRevoke = 0;
        }
    } else {
        metrics.revokeWitness = 0;
        metrics.gasRevoke = 0;
    }

    // ----- Composite metrics -----
    metrics.totalShareTime = metrics.proxyRekey + metrics.proxyReencrypt + metrics.proxyDecryptKey;
    metrics.totalAccessTime = metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR;
    metrics.totalWorkflowTime = metrics.patientSSI + metrics.doctorSSI + metrics.healthDeptSSI
        + metrics.aesEncryptEHR + metrics.pinataUpload + metrics.registerDoctor
        + (metrics.setWitness || 0) + (metrics.checkWitness || 0) + metrics.proxyEncryptKey
        + metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR
        + (metrics.revokeWitness || 0);
    metrics.gasTotal = (metrics.gasWitness || 0) + (metrics.gasRevoke || 0);

    // Gas cost conversion
    const wei = metrics.gasTotal * CONFIG.GAS_PRICE_GWEI * 1e9;
    const eth = wei / 1e18;
    metrics.gasCostETH = eth;
    metrics.gasCostUSD = eth * CONFIG.ETH_PRICE_USD;
    metrics.gasCostDZD = metrics.gasCostUSD * CONFIG.USD_TO_DZD;

    return { fileName, sizeKB: fileSizeKB, ...metrics };
}

// ==================== 7. MAIN BENCHMARK ====================
async function runBenchmark() {
    console.log('🚀 Starting full benchmark with 5‑attribute AND policy...\n');

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet: ${wallet.address}  Balance: ${ethers.formatEther(balance)} ETH`);
    if (balance < ethers.parseEther("0.001")) {
        console.warn('⚠️  Low Sepolia ETH – blockchain transactions will be skipped.');
    }

    // Generate exactly 100 fresh EHRs if needed
    if (fs.existsSync(CONFIG.EHR_OUTPUT_DIR)) {
        const existing = fs.readdirSync(CONFIG.EHR_OUTPUT_DIR).filter(f => f.endsWith('.json'));
        if (existing.length >= CONFIG.PATIENT_COUNT) {
            console.log(`📁 Found ${existing.length} existing EHR files, skipping generation.`);
        } else {
            cleanSyntheaOutput();
            await runSynthea(CONFIG.PATIENT_COUNT);
            prepareEHRFiles(CONFIG.SYNTHEA_DIR, CONFIG.EHR_OUTPUT_DIR);
        }
    } else {
        cleanSyntheaOutput();
        await runSynthea(CONFIG.PATIENT_COUNT);
        prepareEHRFiles(CONFIG.SYNTHEA_DIR, CONFIG.EHR_OUTPUT_DIR);
    }

    // Load files and enforce limit of 100
    let files = fs.readdirSync(CONFIG.EHR_OUTPUT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const fullPath = path.join(CONFIG.EHR_OUTPUT_DIR, f);
            const buffer = fs.readFileSync(fullPath);
            return { filePath: fullPath, buffer, sizeKB: buffer.length / 1024 };
        });

    if (files.length > CONFIG.PATIENT_COUNT) {
        console.warn(`⚠️  ${files.length} files found – processing only the first ${CONFIG.PATIENT_COUNT}.`);
        files = files.slice(0, CONFIG.PATIENT_COUNT);
    }

    console.log(`📊 Loaded ${files.length} EHR files for benchmarking.\n`);

    const allResults = [];
    for (let i = 0; i < files.length; i++) {
        try {
            const res = await runSingleWorkflow(files[i], i);
            allResults.push(res);
        } catch (err) {
            console.error(`❌ Failed on ${path.basename(files[i].filePath)}:`, err.message);
            allResults.push({ fileName: path.basename(files[i].filePath), sizeKB: files[i].sizeKB, error: err.message });
        }
    }

    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));

    // Compute min/max/avg for every metric
    const metricsKeys = [
        'patientSSI', 'doctorSSI', 'healthDeptSSI',
        'aesEncryptEHR', 'pinataUpload', 'registerDoctor',
        'setWitness', 'checkWitness', 'proxyEncryptKey',
        'proxyRekey', 'proxyReencrypt', 'proxyDecryptKey',
        'pinataDownload', 'aesDecryptEHR', 'revokeWitness',
        'totalShareTime', 'totalAccessTime', 'totalWorkflowTime',
        'gasWitness', 'gasRevoke', 'gasTotal',
        'gasCostETH', 'gasCostUSD', 'gasCostDZD'
    ];

    const stats = {};
    metricsKeys.forEach(key => {
        const valid = allResults.filter(r => r[key] !== undefined).map(r => r[key]);
        if (valid.length) {
            stats[key] = {
                min: Math.min(...valid),
                max: Math.max(...valid),
                avg: valid.reduce((a, b) => a + b, 0) / valid.length
            };
        }
    });

    fs.writeFileSync('benchmark_aggregated_stats.json', JSON.stringify(stats, null, 2));

    generateHTML(allResults, stats);
    console.log('\n✅ Benchmark complete. Reports:');
    console.log('   - benchmark_full_results.json');
    console.log('   - benchmark_aggregated_stats.json');
    console.log('   - benchmark_report.html');
}

// ==================== 8. HTML REPORT ====================
function generateHTML(results, stats) {
    const scatterData = results.filter(r => r.totalAccessTime !== undefined).map(r => ({ x: r.sizeKB, y: r.totalAccessTime }));

    const stepLabels = [
        'Patient SSI', 'Doctor SSI', 'Health Dept SSI',
        'AES Encrypt', 'Pinata Upload', 'Register Doc', 'Set Witness', 'Check Witness',
        'Proxy Encrypt', 'Rekey', 'Reencrypt', 'Decrypt Key', 'Pinata Download', 'AES Decrypt', 'Revoke Witness'
    ];
    const stepKeys = [
        'patientSSI', 'doctorSSI', 'healthDeptSSI',
        'aesEncryptEHR', 'pinataUpload', 'registerDoctor', 'setWitness', 'checkWitness',
        'proxyEncryptKey', 'proxyRekey', 'proxyReencrypt', 'proxyDecryptKey',
        'pinataDownload', 'aesDecryptEHR', 'revokeWitness'
    ];
    const avgTimes = stepKeys.map(k => stats[k] ? stats[k].avg : 0);

    const allStatRows = [
        { label: 'Patient SSI', key: 'patientSSI', unit: 'ms' },
        { label: 'Doctor SSI', key: 'doctorSSI', unit: 'ms' },
        { label: 'Health Dept SSI', key: 'healthDeptSSI', unit: 'ms' },
        { label: 'AES Encrypt EHR', key: 'aesEncryptEHR', unit: 'ms' },
        { label: 'Pinata Upload', key: 'pinataUpload', unit: 'ms' },
        { label: 'Register Doctor (PRE)', key: 'registerDoctor', unit: 'ms' },
        { label: 'Set Witness (Blockchain)', key: 'setWitness', unit: 'ms' },
        { label: 'Check Witness', key: 'checkWitness', unit: 'ms' },
        { label: 'Proxy Encrypt Key', key: 'proxyEncryptKey', unit: 'ms' },
        { label: 'Proxy Rekey (share request)', key: 'proxyRekey', unit: 'ms' },
        { label: 'Proxy Reencrypt (share)', key: 'proxyReencrypt', unit: 'ms' },
        { label: 'Proxy Decrypt Key', key: 'proxyDecryptKey', unit: 'ms' },
        { label: 'Pinata Download', key: 'pinataDownload', unit: 'ms' },
        { label: 'AES Decrypt EHR', key: 'aesDecryptEHR', unit: 'ms' },
        { label: 'Revoke Witness', key: 'revokeWitness', unit: 'ms' },
        { label: 'Total Share Time', key: 'totalShareTime', unit: 'ms' },
        { label: 'Total Access Time', key: 'totalAccessTime', unit: 'ms' },
        { label: 'Total Workflow Time', key: 'totalWorkflowTime', unit: 'ms' },
        { label: 'Gas Witness', key: 'gasWitness', unit: 'wei' },
        { label: 'Gas Revoke', key: 'gasRevoke', unit: 'wei' },
        { label: 'Gas Total', key: 'gasTotal', unit: 'wei' },
        { label: 'Gas Cost (ETH)', key: 'gasCostETH', unit: 'ETH' },
        { label: 'Gas Cost (USD)', key: 'gasCostUSD', unit: 'USD' },
        { label: 'Gas Cost (DZD)', key: 'gasCostDZD', unit: 'DZD' }
    ];

    const statTableRows = allStatRows.map(row => {
        const s = stats[row.key];
        if (!s) return '';
        const isCost = row.key.includes('gasCost');
        return `<tr>
            <td>${row.label}</td>
            <td>${isCost ? s.min.toFixed(6) : s.min.toFixed(1)}</td>
            <td>${isCost ? s.max.toFixed(6) : s.max.toFixed(1)}</td>
            <td>${isCost ? s.avg.toFixed(6) : s.avg.toFixed(1)}</td>
            <td>${row.unit}</td>
        </tr>`;
    }).join('');

    const sampleRows = results.slice(0, 10).map(r => `
        <tr>
            <td>${r.fileName}</td>
            <td>${r.sizeKB.toFixed(1)}</td>
            <td>${r.totalAccessTime ? r.totalAccessTime.toFixed(1) : 'N/A'}</td>
            <td>${r.gasTotal || 'N/A'}</td>
            <td>${r.gasCostDZD ? r.gasCostDZD.toFixed(4) : 'N/A'}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MediChain Benchmark – 100 Real FHIR Patients</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f6fb; margin: 2rem; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #1a1a2e; text-align: center; }
        h2 { color: #2c3e50; margin-top: 2rem; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        th, td { padding: 12px 16px; text-align: center; }
        th { background: #4f46e5; color: white; }
        tr:nth-child(even) { background: #f9fafb; }
        .chart-container { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 2rem 0; }
        canvas { max-width: 100%; }
        .summary { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 1.5rem 0; }
        .note { text-align: center; color: #555; margin-top: 2rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 MediChain Comprehensive Benchmark – 100 Real FHIR Patients</h1>
        <p style="text-align:center">Sepolia testnet | 5‑attribute AND policy | ${new Date().toLocaleString()}</p>

        <div class="summary">
            <h2>📈 Total Access Time vs File Size</h2>
            <div class="chart-container"><canvas id="scatterChart" width="800" height="400"></canvas></div>
        </div>

        <div class="summary">
            <h2>⏱️ Average Time per Step (ms)</h2>
            <div class="chart-container"><canvas id="barChart" width="800" height="400"></canvas></div>
        </div>

        <h2>📊 Aggregated Metrics (Min / Max / Average) – All 100 Runs</h2>
        <table>
            <tr><th>Metric</th><th>Min</th><th>Max</th><th>Average</th><th>Unit</th></tr>
            ${statTableRows}
        </table>

        <h2>📄 Sample Individual Results (first 10)</h2>
        <table>
            <tr><th>File Name</th><th>Size (KB)</th><th>Total Access (ms)</th><th>Gas Used</th><th>Gas Cost (DZD)</th></tr>
            ${sampleRows}
        </table>

        <div class="note">
            <p>Full per‑file metrics in <code>benchmark_full_results.json</code> · Aggregated stats in <code>benchmark_aggregated_stats.json</code></p>
            <p>Policy: <strong>${CONFIG.DOCTOR_ATTRIBUTES.join(' AND ')}</strong></p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        const ctxScatter = document.getElementById('scatterChart').getContext('2d');
        new Chart(ctxScatter, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Total Access Time (ms)',
                    data: ${JSON.stringify(scatterData)},
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { title: { display: true, text: 'File Size (KB)' } },
                    y: { title: { display: true, text: 'Total Access Time (ms)' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => 'Size: ' + ctx.raw.x.toFixed(1) + ' KB, Time: ' + ctx.raw.y.toFixed(1) + ' ms'
                        }
                    }
                }
            }
        });

        const ctxBar = document.getElementById('barChart').getContext('2d');
        new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(stepLabels)},
                datasets: [{
                    label: 'Average Time (ms)',
                    data: ${JSON.stringify(avgTimes)},
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Milliseconds' } }
                }
            }
        });
    </script>
</body>
</html>`;
    fs.writeFileSync('benchmark_report.html', html);
}

// ==================== START ====================
runBenchmark().catch(console.error);
