// benchmark_full.js – Complete benchmark with OR/AND policies, multiple EHR sizes, 100 iterations
// Generates HTML report with statistics.

const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
    // Pinata
    PINATA_API_KEY: '03959fc6abd1baa890bf',
    PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
    // Proxy & blockchain
    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // Benchmark parameters
    EHR_SIZES_KB: [50, 100, 200, 400, 800, 1600, 51200], // 51200 KB = 50 MB
    ITERATIONS_PER_SIZE: 100,   // ← adjust to 100 for final run
    WITNESS_VALIDITY_DAYS: 365,

    // Policy mode: 'OR' or 'AND'
    POLICY_MODE: 'OR',   // Change to 'AND' for conjunction policy
};

// Attributes list (5 custom attributes)
const ATTRIBUTES = ['cardiologist', 'working-at-chinguvaram', 'attending-physician', 'researcher', 'ATTR'];

// Build DNF policy based on mode
function buildPolicy() {
    if (CONFIG.POLICY_MODE === 'OR') {
        // OR: each attribute alone in its own conjunction
        return ATTRIBUTES.map(attr => [attr]);
    } else { // AND
        // AND: all attributes in a single conjunction
        return [ATTRIBUTES];
    }
}

// ==================== UTILITIES ====================
function generateSSI() {
    const keyPair = nacl.sign.keyPair();
    const pubB64 = encodeBase64(keyPair.publicKey);
    const did = 'did:key:z' + pubB64.substring(0, 44);
    return { did, publicKey: pubB64, privateKey: encodeBase64(keyPair.secretKey) };
}

function generateRandomEHR(sizeKB) {
    // Generate JSON with random padding to reach exact size
    const base = {
        patientId: Math.floor(Math.random() * 100000),
        patientName: `Patient_${Math.random().toString(36).substring(7)}`,
        diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString()
    };
    let str = JSON.stringify(base);
    let need = sizeKB * 1024 - Buffer.byteLength(str, 'utf8');
    if (need > 0) {
        base._padding = crypto.randomBytes(need).toString('hex');
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
    const gateways = [
        'https://gateway.pinata.cloud/ipfs',
        'https://ipfs.io/ipfs',
        'https://cloudflare-ipfs.com/ipfs'
    ];
    for (const gw of gateways) {
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
        doctor_did: did,
        attributes: ATTRIBUTES   // give doctor all five attributes (so they can satisfy OR or AND)
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

// ==================== TIMING HELPERS ====================
const now = () => process.hrtime.bigint();
const toMs = (start) => Number(now() - start) / 1_000_000;

// ==================== SINGLE WORKFLOW ITERATION ====================
async function runSingleIteration(sizeKB, iterIndex, doctorDidCache) {
    const metrics = { sizeKB, iteration: iterIndex };

    // 1. Patient SSI
    let start = now();
    const patient = generateSSI();
    metrics.patientSSI_ms = toMs(start);

    // 2. Generate EHR and AES key
    const ehrBuf = generateRandomEHR(sizeKB);
    const aesKey = crypto.randomBytes(32);
    start = now();
    const encEHR = aesEncrypt(ehrBuf, aesKey);
    metrics.aesEncrypt_ms = toMs(start);

    // 3. Upload to Pinata
    start = now();
    const cid = await pinataUpload(encEHR, `ehr_${sizeKB}_${iterIndex}.enc`);
    metrics.pinataUpload_ms = toMs(start);

    // 4. Doctor SSI (only if not cached – we want fresh keys each iteration)
    start = now();
    const doctor = generateSSI();
    metrics.doctorSSI_ms = toMs(start);

    // 5. Register doctor on proxy (may be cached, but we do it every time for consistency)
    start = now();
    await proxyRegisterDoctor(doctor.did);
    metrics.proxyRegister_ms = toMs(start);

    // 6. Issue witness on blockchain
    const expiry = Math.floor(Date.now() / 1000) + CONFIG.WITNESS_VALIDITY_DAYS * 86400;
    const witnessHash = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now() + iterIndex));
    start = now();
    const tx = await acc.setDoctorWitness(doctor.did, witnessHash, expiry);
    const receipt = await tx.wait();
    metrics.setDoctorWitness_ms = toMs(start);
    metrics.gasWitness = Number(receipt.gasUsed);

    // 7. Check doctor active
    start = now();
    const isActive = await acc.isDoctorActive(doctor.did);
    metrics.checkActive_ms = toMs(start);
    if (!isActive) throw new Error('Doctor not active after witness issuance');

    // 8. Proxy encrypt AES key (using policy)
    const policy = buildPolicy();   // depends on CONFIG.POLICY_MODE
    const timeSlot = Math.floor(Date.now() / 3600000);
    start = now();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), policy, timeSlot);
    metrics.proxyEncrypt_ms = toMs(start);
    const ctId = encRes.ciphertext_id;

    // 9. Generate rekey
    start = now();
    const rekeyId = await proxyRekey(ctId, doctor.did, ATTRIBUTES); // doctor has all attributes
    metrics.proxyRekey_ms = toMs(start);

    // 10. Proxy re-encrypt
    start = now();
    const transformedId = await proxyReencrypt(rekeyId);
    metrics.proxyReencrypt_ms = toMs(start);

    // 11. Decrypt AES key (doctor side)
    start = now();
    const decryptedKeyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptAES_ms = toMs(start);

    // 12. Download encrypted EHR from Pinata
    start = now();
    const downloadedEnc = await pinataDownload(cid);
    metrics.pinataDownload_ms = toMs(start);

    // 13. AES decrypt EHR
    start = now();
    const decryptedEhr = aesDecrypt(downloadedEnc, Buffer.from(decryptedKeyB64, 'base64'));
    metrics.aesDecrypt_ms = toMs(start);

    // Verify integrity (optional)
    if (decryptedEhr.toString('utf8') !== ehrBuf.toString('utf8')) {
        throw new Error('Data integrity mismatch');
    }

    // Total access time (doctor side: steps 9–13)
    metrics.totalAccess_ms = metrics.proxyRekey_ms + metrics.proxyReencrypt_ms +
        metrics.proxyDecryptAES_ms + metrics.pinataDownload_ms + metrics.aesDecrypt_ms;

    return { metrics, doctorDid: doctor.did, cid, doctor };
}

// ==================== REVOKE DOCTOR (after all iterations for a given size) ====================
async function revokeDoctor(doctorDid) {
    const start = now();
    const tx = await acc.revokeDoctor(doctorDid);
    const receipt = await tx.wait();
    const timeMs = toMs(start);
    return { timeMs, gasUsed: Number(receipt.gasUsed) };
}

// ==================== AGGREGATION & STATISTICS ====================
function calculateStats(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const idx95 = Math.ceil(0.95 * values.length) - 1;
    const p95 = sorted[idx95];
    return { min: sorted[0], max: sorted[sorted.length - 1], avg, p95, count: values.length };
}

// ==================== HTML REPORT GENERATION ====================
function generateHTMLReport(aggregated, policyMode, sizes, iterPerSize) {
    const timeFields = [
        'patientSSI_ms', 'aesEncrypt_ms', 'pinataUpload_ms', 'doctorSSI_ms', 'proxyRegister_ms',
        'setDoctorWitness_ms', 'checkActive_ms', 'proxyEncrypt_ms', 'proxyRekey_ms',
        'proxyReencrypt_ms', 'proxyDecryptAES_ms', 'pinataDownload_ms', 'aesDecrypt_ms',
        'totalAccess_ms'
    ];
    const gasFields = ['gasWitness', 'gasRevoke'];

    // Build tables
    let timeTableRows = '';
    let gasTableRows = '';
    let chartLabels = [];
    let chartData = [];

    for (const size of sizes) {
        const stat = aggregated[size];
        if (!stat) continue;
        chartLabels.push(`${size} KB`);
        chartData.push(stat.totalAccess_ms.avg);

        // Time row
        timeTableRows += `<tr><td><strong>${size} KB</strong></td>`;
        for (const f of timeFields) {
            const s = stat[f];
            if (s) timeTableRows += `<td>${s.avg.toFixed(1)} (min:${s.min.toFixed(1)} max:${s.max.toFixed(1)})</td>`;
            else timeTableRows += `<td>-</td>`;
        }
        timeTableRows += `</tr>`;

        // Gas row
        gasTableRows += `<tr><td><strong>${size} KB</strong></td>`;
        for (const f of gasFields) {
            const s = stat[f];
            if (s) gasTableRows += `<td>${s.avg.toFixed(0)} (min:${s.min} max:${s.max})</td>`;
            else gasTableRows += `<td>-</td>`;
        }
        gasTableRows += `</tr>`;
    }

    const chartDataJSON = JSON.stringify({
        labels: chartLabels,
        datasets: [{
            label: 'Total Access Time (ms)',
            data: chartData,
            backgroundColor: 'rgba(79, 70, 229, 0.7)',
            borderColor: '#4f46e5',
            borderWidth: 1
        }]
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MediChain Full Benchmark – ${policyMode} Policy</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    h1, h2 { color: #1e3c72; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; background: white; border-radius: 12px; overflow-x: auto; display: block; }
    th, td { padding: 12px 8px; text-align: center; border-bottom: 1px solid #ddd; }
    th { background: #4f46e5; color: white; position: sticky; top: 0; }
    tr:hover { background: #f8f9fa; }
    .badge { display: inline-block; background: #e0e7ff; color: #4f46e5; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; margin: 0 4px; }
    .chart-container { margin: 2rem 0; }
    canvas { max-width: 100%; height: auto; }
    footer { text-align: center; margin-top: 2rem; color: #6c757d; }
  </style>
</head>
<body>
<div class="container">
  <h1>🔐 MediChain Comprehensive Benchmark</h1>
  <p><strong>Network:</strong> Sepolia &nbsp;|&nbsp; <strong>Policy mode:</strong> ${policyMode} (${policyMode === 'OR' ? 'any of' : 'all'} attributes: ${ATTRIBUTES.join(', ')})</p>
  <p><strong>EHR sizes:</strong> ${sizes.join(' KB, ')} KB &nbsp;|&nbsp; <strong>Iterations per size:</strong> ${iterPerSize}</p>
  <div class="chart-container">
    <canvas id="timeChart" width="800" height="400"></canvas>
  </div>
  <h2>⏱️ Average Timings (ms) – per operation (min/max in parentheses)</h2>
  <div style="overflow-x: auto;">
    <table>
      <thead><tr><th>Size (KB)</th>${timeFields.map(f => `<th>${f}</th>`).join('')}</tr></thead>
      <tbody>${timeTableRows}</tbody>
    </table>
  </div>
  <h2>⛽ Gas Consumption (wei)</h2>
  <div style="overflow-x: auto;">
    <table>
      <thead><tr><th>Size (KB)</th>${gasFields.map(f => `<th>${f}</th>`).join('')}</tr></thead>
      <tbody>${gasTableRows}</tbody>
    </table>
  </div>
  <footer>Report generated on ${new Date().toLocaleString()} | ${iterPerSize} iterations per size</footer>
</div>
<script>
  const ctx = document.getElementById('timeChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: ${chartDataJSON},
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Milliseconds' } } },
      plugins: { title: { display: true, text: 'Total Access Time vs EHR Size' } }
    }
  });
</script>
</body>
</html>`;
    fs.writeFileSync(`benchmark_${policyMode}_report.html`, html);
}

// ==================== MAIN BENCHMARK LOOP ====================
async function runBenchmark() {
    console.log(`\n🚀 Starting full benchmark on Sepolia (${CONFIG.POLICY_MODE} policy)`);
    console.log(`EHR sizes: ${CONFIG.EHR_SIZES_KB.join(', ')} KB`);
    console.log(`Iterations per size: ${CONFIG.ITERATIONS_PER_SIZE}`);
    console.log(`Policy: ${JSON.stringify(buildPolicy())}\n`);

    const allResults = []; // store each iteration's metrics
    const aggregated = {};

    for (const sizeKB of CONFIG.EHR_SIZES_KB) {
        console.log(`\n========== Processing size ${sizeKB} KB ==========`);
        const sizeResults = [];
        let lastDoctorDid = null;

        for (let i = 0; i < CONFIG.ITERATIONS_PER_SIZE; i++) {
            process.stdout.write(`  Iteration ${i + 1}/${CONFIG.ITERATIONS_PER_SIZE} ... `);
            try {
                const { metrics, doctorDid } = await runSingleIteration(sizeKB, i, lastDoctorDid);
                sizeResults.push(metrics);
                allResults.push(metrics);
                lastDoctorDid = doctorDid;
                console.log(`done (total access ${metrics.totalAccess_ms.toFixed(1)} ms)`);
            } catch (err) {
                console.error(`\n  ❌ Failed: ${err.message}`);
            }
        }

        // Revoke the last doctor used for this size
        if (lastDoctorDid) {
            console.log(`  Revoking doctor ${lastDoctorDid.substring(0, 20)}...`);
            const revokeMetrics = await revokeDoctor(lastDoctorDid);
            // Attach revoke gas to each iteration? We'll store average per size later.
            // We'll store separately
            for (const m of sizeResults) {
                m.gasRevoke = revokeMetrics.gasUsed;
                m.revokeDoctor_ms = revokeMetrics.timeMs;
            }
        }

        // Aggregate per size
        if (sizeResults.length === 0) continue;
        const agg = {};
        const allFields = Object.keys(sizeResults[0]).filter(k => k !== 'sizeKB' && k !== 'iteration');
        for (const field of allFields) {
            const values = sizeResults.map(r => r[field]).filter(v => typeof v === 'number');
            if (values.length) agg[field] = calculateStats(values);
        }
        aggregated[sizeKB] = agg;
    }

    // Save raw JSON
    fs.writeFileSync(`benchmark_raw_${CONFIG.POLICY_MODE}.json`, JSON.stringify(allResults, null, 2));

    // Generate HTML report
    generateHTMLReport(aggregated, CONFIG.POLICY_MODE, CONFIG.EHR_SIZES_KB, CONFIG.ITERATIONS_PER_SIZE);
    console.log(`\n✅ Benchmark complete. Reports saved.`);
}

runBenchmark().catch(console.error);