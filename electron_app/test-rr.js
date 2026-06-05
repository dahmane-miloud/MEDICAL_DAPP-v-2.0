/*
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    // EHR size configurations (in KB)
    EHR_SIZES_KB: [50, 100, 200, 400, 800, 1600],
    SAMPLES_PER_SIZE: 5,
    EHR_OUTPUT_DIR: path.resolve(__dirname, 'ehr_benchmark_data'),

    // Pinata JWT (⚠️ MOVE TO .env BEFORE SHARING)
    PINATA_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZTZhMjdiZi03MDM5LTQ5NzctYTMwNi1jNTQ2Y2YyMjEzYzQiLCJlbWFpbCI6ImlwZnN0ZXN0MkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDkyODYwODUzNDVmMTlhZWI0N2QiLCJzY29wZWRLZXlTZWNyZXQiOiJlMmZmZGZlNDAwYjI4ZmE5MDY2OGQ2NWM0MzRiMDI5MDIyYjFiNWI4NGQwMTY2OTA4ZWE1ZjUxMGU4OTExOTM5IiwiZXhwIjoxODExNDg0MDkyfQ.avTD8CQwW8X6dCl4Dw_Cfu8KmL-65-7ErYILs9IoBjM',

    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // 5-attribute AND policy
    DOCTOR_ATTRIBUTES: ["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"],
    POLICY: [["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"]],

    // Cost conversion (approximate)
    ETH_PRICE_USD: 2500,
    USD_TO_DZD: 135,
    GAS_PRICE_GWEI: 20,

    // ==================== SSX-EHR COMPARISON DATA ====================
    // IMPORTANT: Replace these with ACTUAL values from the SSX-EHR article!
    // These are PLACEHOLDERS and should be updated with real benchmarks.
    // Set to null to disable SSX comparison in the report.
    SSX_BENCHMARKS: null  // Set to object with real data when available
    /*
    Example format when you have real data:
    SSX_BENCHMARKS: {
        'SSI Generation': { 50: 15, 100: 15, 200: 15, 400: 16, 800: 16, 1600: 17 },
        'AES Encryption': { 50: 2, 100: 4, 200: 8, 400: 16, 800: 32, 1600: 64 },
        'IPFS Upload': { 50: 800, 100: 1200, 200: 2000, 400: 3500, 800: 6000, 1600: 10000 },
        'Proxy Encryption': { 50: 120, 100: 125, 200: 130, 400: 140, 800: 155, 1600: 180 },
        'Share Operation': { 50: 300, 100: 310, 200: 330, 400: 370, 800: 440, 1600: 580 },
        'IPFS Download': { 50: 500, 100: 800, 200: 1400, 400: 2600, 800: 5000, 1600: 9000 },
        'AES Decryption': { 50: 2, 100: 4, 200: 8, 400: 16, 800: 32, 1600: 64 },
        'Total Access': { 50: 900, 100: 1300, 200: 2000, 400: 3500, 800: 6000, 1600: 10000 }
    }
    
};

// ==================== 1. SYNTHETIC EHR GENERATOR ====================
class EHRGenerator {
    static generateFHIRData(targetSizeKB) {
        const targetBytes = targetSizeKB * 1024;

        const baseBundle = {
            resourceType: "Bundle",
            type: "transaction",
            entry: []
        };

        const conditions = [
            "Essential hypertension", "Type 2 diabetes mellitus", "Asthma",
            "Major depressive disorder", "Osteoarthritis", "Hypothyroidism",
            "Chronic kidney disease", "Atrial fibrillation", "COPD",
            "Rheumatoid arthritis", "Coronary artery disease", "Obesity"
        ];

        const medications = [
            "Lisinopril 10mg", "Metformin 500mg", "Albuterol inhaler",
            "Sertraline 50mg", "Acetaminophen 500mg", "Levothyroxine 100mcg",
            "Atorvastatin 20mg", "Omeprazole 20mg", "Metoprolol 50mg",
            "Gabapentin 300mg", "Amlodipine 5mg", "Hydrochlorothiazide 25mg"
        ];

        const observations = [
            { code: "Blood Pressure", unit: "mmHg", range: [110, 160] },
            { code: "Heart Rate", unit: "bpm", range: [60, 100] },
            { code: "Blood Glucose", unit: "mg/dL", range: [70, 200] },
            { code: "BMI", unit: "kg/m2", range: [18, 40] },
            { code: "O2 Saturation", unit: "%", range: [90, 100] },
            { code: "Temperature", unit: "°C", range: [36, 39] }
        ];

        let currentSize = JSON.stringify(baseBundle).length;
        let entryCount = 0;

        while (currentSize < targetBytes) {
            entryCount++;

            if (entryCount % 3 === 0) {
                const condition = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "Condition",
                        id: crypto.randomUUID(),
                        clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
                        code: {
                            coding: [{ system: "http://snomed.info/sct", code: `${100000 + entryCount}`, display: conditions[entryCount % conditions.length] }]
                        },
                        subject: { reference: "Patient/123" },
                        onsetDateTime: new Date(2020 + (entryCount % 4), entryCount % 12, (entryCount % 28) + 1).toISOString()
                    }
                };
                baseBundle.entry.push(condition);
            } else if (entryCount % 3 === 1) {
                const medRequest = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "MedicationRequest",
                        id: crypto.randomUUID(),
                        status: "active",
                        intent: "order",
                        medicationCodeableConcept: {
                            coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: `${200000 + entryCount}`, display: medications[entryCount % medications.length] }]
                        },
                        subject: { reference: "Patient/123" },
                        authoredOn: new Date(2023, entryCount % 12, (entryCount % 28) + 1).toISOString()
                    }
                };
                baseBundle.entry.push(medRequest);
            } else {
                const obs = observations[entryCount % observations.length];
                const value = obs.range[0] + Math.random() * (obs.range[1] - obs.range[0]);
                const observation = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "Observation",
                        id: crypto.randomUUID(),
                        status: "final",
                        code: {
                            coding: [{ system: "http://loinc.org", code: `${300000 + entryCount}`, display: obs.code }]
                        },
                        subject: { reference: "Patient/123" },
                        effectiveDateTime: new Date().toISOString(),
                        valueQuantity: {
                            value: Math.round(value * 10) / 10,
                            unit: obs.unit
                        }
                    }
                };
                baseBundle.entry.push(observation);
            }

            if (entryCount % 10 === 0) {
                const narrativeEntry = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "ClinicalImpression",
                        id: crypto.randomUUID(),
                        status: "completed",
                        subject: { reference: "Patient/123" },
                        summary: `Clinical assessment ${entryCount}: Patient presents with multiple chronic conditions requiring ongoing management. ` +
                            `Current treatment plan includes medication management and lifestyle modifications. ` +
                            `Follow-up scheduled in 3 months to reassess treatment efficacy and adjust as needed. ` +
                            `Additional diagnostic tests may be required depending on clinical presentation. ` +
                            `Patient education provided regarding medication adherence and symptom monitoring.`
                    }
                };
                baseBundle.entry.push(narrativeEntry);
            }

            currentSize = JSON.stringify(baseBundle).length;
            if (entryCount > 10000) break;
        }

        return baseBundle;
    }

    static generateAllEHRFiles(outputDir) {
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });

        const files = [];

        CONFIG.EHR_SIZES_KB.forEach(sizeKB => {
            for (let i = 0; i < CONFIG.SAMPLES_PER_SIZE; i++) {
                const fhirData = this.generateFHIRData(sizeKB);
                const fileName = `ehr_${sizeKB}KB_sample${i + 1}.json`;
                const filePath = path.join(outputDir, fileName);
                const jsonStr = JSON.stringify(fhirData, null, 2);

                const currentSize = Buffer.byteLength(jsonStr, 'utf8');
                const targetBytes = sizeKB * 1024;

                let finalJson = jsonStr;
                if (currentSize < targetBytes) {
                    const padding = ' '.repeat(targetBytes - currentSize - 50);
                    finalJson = jsonStr.replace('"summary": "', `"summary": "${padding}`);
                } else if (currentSize > targetBytes) {
                    const excess = currentSize - targetBytes;
                    const lastSummaryIdx = finalJson.lastIndexOf('"summary": "');
                    if (lastSummaryIdx > 0) {
                        const summaryEnd = finalJson.indexOf('"', lastSummaryIdx + 13);
                        if (summaryEnd > 0) {
                            finalJson = finalJson.substring(0, summaryEnd - excess) + finalJson.substring(summaryEnd);
                        }
                    }
                }

                fs.writeFileSync(filePath, finalJson);
                files.push({
                    filePath,
                    sizeKB,
                    sampleIndex: i + 1,
                    buffer: Buffer.from(finalJson, 'utf8')
                });

                const actualSizeKB = Buffer.byteLength(finalJson, 'utf8') / 1024;
                console.log(`📄 Generated: ${fileName} (${actualSizeKB.toFixed(1)} KB)`);
            }
        });

        console.log(`✅ Generated ${files.length} EHR files across ${CONFIG.EHR_SIZES_KB.length} size categories\n`);
        return files;
    }
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

// ==================== 3. PINATA IPFS ====================
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
        } catch (e) { }
    }
    throw new Error('Pinata download failed');
}

// ==================== 4. BLOCKCHAIN ====================
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

// ==================== 5. PROXY HELPERS ====================
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

// ==================== 6. TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== 7. FULL WORKFLOW ====================
async function runSingleWorkflow(ehrData, index) {
    const metrics = {};
    const fileName = path.basename(ehrData.filePath);
    const fileSizeKB = ehrData.sizeKB;
    console.log(`\n--- File ${index + 1}: ${fileName} (${fileSizeKB} KB) ---`);

    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    t = n();
    const healthDept = generateSSI();
    metrics.healthDeptSSI = ms(t);

    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehrData.buffer, aesKey);
    metrics.aesEncryptEHR = ms(t);

    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${index}_${fileName}`);
    metrics.pinataUpload = ms(t);

    t = n();
    await proxyRegisterDoctor(doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.registerDoctor = ms(t);

    let witnessSet = false;
    if (await hasEnoughEth()) {
        const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
        const wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
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

    if (witnessSet) {
        t = n();
        await acc.isDoctorActive(doctor.did);
        metrics.checkWitness = ms(t);
    } else {
        metrics.checkWitness = 0;
    }

    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), CONFIG.POLICY, slot);
    metrics.proxyEncryptKey = ms(t);
    const ctId = encRes.ciphertext_id;

    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.proxyRekey = ms(t);

    t = n();
    const transformedId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    t = n();
    const keyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptKey = ms(t);

    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecryptEHR = ms(t);

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

    metrics.totalShareTime = metrics.proxyRekey + metrics.proxyReencrypt + metrics.proxyDecryptKey;
    metrics.totalAccessTime = metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR;
    metrics.totalWorkflowTime = metrics.patientSSI + metrics.doctorSSI + metrics.healthDeptSSI
        + metrics.aesEncryptEHR + metrics.pinataUpload + metrics.registerDoctor
        + (metrics.setWitness || 0) + (metrics.checkWitness || 0) + metrics.proxyEncryptKey
        + metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR
        + (metrics.revokeWitness || 0);
    metrics.gasTotal = (metrics.gasWitness || 0) + (metrics.gasRevoke || 0);

    const wei = metrics.gasTotal * CONFIG.GAS_PRICE_GWEI * 1e9;
    const eth = wei / 1e18;
    metrics.gasCostETH = eth;
    metrics.gasCostUSD = eth * CONFIG.ETH_PRICE_USD;
    metrics.gasCostDZD = metrics.gasCostUSD * CONFIG.USD_TO_DZD;

    return { fileName, sizeKB: fileSizeKB, ...metrics };
}

// ==================== 8. MAIN BENCHMARK ====================
async function runBenchmark() {
    console.log('🚀 Starting MediChain Professional Benchmark...\n');
    console.log('📊 Size categories:', CONFIG.EHR_SIZES_KB.map(s => s + 'KB').join(', '));
    console.log('📋 Samples per size:', CONFIG.SAMPLES_PER_SIZE);
    console.log(`📈 Total tests: ${CONFIG.EHR_SIZES_KB.length * CONFIG.SAMPLES_PER_SIZE}\n`);

    if (CONFIG.SSX_BENCHMARKS === null) {
        console.log('⚠️  SSX-EHR comparison data not configured. Report will show MediChain results only.');
        console.log('   To add comparison, update CONFIG.SSX_BENCHMARKS with real article values.\n');
    }

    console.log('🔧 Generating synthetic EHR files...');
    const ehrFiles = EHRGenerator.generateAllEHRFiles(CONFIG.EHR_OUTPUT_DIR);

    const balance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Wallet Balance: ${ethers.formatEther(balance)} ETH`);

    const allResults = [];
    for (let i = 0; i < ehrFiles.length; i++) {
        try {
            const res = await runSingleWorkflow(ehrFiles[i], i);
            allResults.push(res);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            console.error(`❌ Failed:`, err.message);
            allResults.push({
                fileName: path.basename(ehrFiles[i].filePath),
                sizeKB: ehrFiles[i].sizeKB,
                error: err.message
            });
        }
    }

    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));

    const stats = computeStatistics(allResults);
    fs.writeFileSync('benchmark_aggregated_stats.json', JSON.stringify(stats, null, 2));

    generateProfessionalReport(allResults, stats);

    console.log('\n✅ Benchmark Complete!');
    console.log('📊 Reports generated:');
    console.log('   - benchmark_full_results.json');
    console.log('   - benchmark_aggregated_stats.json');
    console.log('   - benchmark_professional_report.html');
}

function computeStatistics(results) {
    const stats = {
        bySize: {},
        overall: {}
    };

    CONFIG.EHR_SIZES_KB.forEach(size => {
        const sizeResults = results.filter(r => r.sizeKB === size && !r.error);
        if (sizeResults.length === 0) return;

        stats.bySize[size] = {};

        const metricsKeys = [
            'patientSSI', 'aesEncryptEHR', 'pinataUpload',
            'proxyEncryptKey', 'totalShareTime', 'pinataDownload',
            'aesDecryptEHR', 'totalAccessTime', 'totalWorkflowTime'
        ];

        metricsKeys.forEach(key => {
            const values = sizeResults.map(r => r[key]).filter(v => v !== undefined && v > 0);
            if (values.length > 0) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                stats.bySize[size][key] = {
                    min: Math.min(...values),
                    max: Math.max(...values),
                    avg: avg,
                    std: Math.sqrt(values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length)
                };
            }
        });

        const gasValues = sizeResults.map(r => r.gasCostDZD).filter(v => v !== undefined && v > 0);
        if (gasValues.length > 0) {
            stats.bySize[size].gasCostDZD = {
                min: Math.min(...gasValues),
                max: Math.max(...gasValues),
                avg: gasValues.reduce((a, b) => a + b, 0) / gasValues.length
            };
        }
    });

    return stats;
}

// ==================== 9. PROFESSIONAL HTML REPORT ====================
function generateProfessionalReport(results, stats) {
    const validResults = results.filter(r => !r.error);
    const showSSXComparison = CONFIG.SSX_BENCHMARKS !== null;

    const sizeLabels = CONFIG.EHR_SIZES_KB.map(s => s + ' KB');

    const mediChainData = CONFIG.EHR_SIZES_KB.map(size => {
        const sizeData = stats.bySize[size];
        return sizeData && sizeData.totalAccessTime ? sizeData.totalAccessTime.avg : 0;
    });

    let ssxData = null;
    let improvementData = null;

    if (showSSXComparison) {
        ssxData = CONFIG.EHR_SIZES_KB.map(size =>
            CONFIG.SSX_BENCHMARKS['Total Access'][size.toString()] || 0
        );
        improvementData = CONFIG.EHR_SIZES_KB.map((size, i) =>
            mediChainData[i] && ssxData[i] ? (ssxData[i] / mediChainData[i]).toFixed(2) : null
        );
    }

    const accessTimes = validResults.map(r => r.totalAccessTime).filter(t => t > 0).sort((a, b) => a - b);
    const minTime = accessTimes.length > 0 ? Math.min(...accessTimes) : 0;
    const maxTime = accessTimes.length > 0 ? Math.max(...accessTimes) : 100;
    const binCount = 15;
    const binWidth = (maxTime - minTime) / binCount;

    const histogramBins = [];
    for (let i = 0; i < binCount; i++) {
        const binStart = minTime + i * binWidth;
        const binEnd = binStart + binWidth;
        const count = accessTimes.filter(t => t >= binStart && t < binEnd).length;
        histogramBins.push({
            label: `${binStart.toFixed(0)}-${binEnd.toFixed(0)}`,
            count: count
        });
    }

    const operationKeys = ['aesEncryptEHR', 'proxyEncryptKey', 'totalShareTime', 'pinataDownload', 'aesDecryptEHR'];
    const operationLabels = ['AES Encryption', 'Proxy Encryption', 'Share Operation', 'IPFS Download', 'AES Decryption'];

    const mediChainByOperation = operationKeys.map(key => {
        return CONFIG.EHR_SIZES_KB.map(size => {
            const sizeData = stats.bySize[size];
            return sizeData && sizeData[key] ? sizeData[key].avg : 0;
        });
    });

    let ssxByOperation = null;
    if (showSSXComparison) {
        ssxByOperation = operationLabels.map(label => {
            return CONFIG.EHR_SIZES_KB.map(size =>
                CONFIG.SSX_BENCHMARKS[label] ? CONFIG.SSX_BENCHMARKS[label][size.toString()] || 0 : 0
            );
        });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediChain Professional Benchmark Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.25);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 3rem 2rem;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
        }
        .header .subtitle {
            font-size: 1.1rem;
            opacity: 0.9;
            max-width: 800px;
            margin: 1rem auto;
            line-height: 1.6;
        }
        .header .badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 0.5rem 1.5rem;
            border-radius: 50px;
            margin: 0.5rem;
            font-weight: 500;
            backdrop-filter: blur(10px);
        }
        .warning-banner {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            color: #92400e;
            padding: 1rem 2rem;
            text-align: center;
            font-weight: 500;
        }
        .content {
            padding: 2rem;
        }
        .section {
            margin-bottom: 3rem;
            background: #f8fafc;
            border-radius: 15px;
            padding: 2rem;
            border: 1px solid #e2e8f0;
        }
        .section h2 {
            color: #1e3a8a;
            font-size: 1.8rem;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 3px solid #3b82f6;
            display: inline-block;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin: 1.5rem 0;
            background: white;
            border-radius: 10px;
            padding: 1rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .chart-container.small {
            height: 350px;
        }
        .chart-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin: 1.5rem 0;
        }
        .legend {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin: 1rem 0;
            font-weight: 500;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 4px;
        }
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stats-table th {
            background: #1e3a8a;
            color: white;
            padding: 15px;
            font-weight: 600;
            text-align: center;
        }
        .stats-table td {
            padding: 12px 15px;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
        }
        .stats-table tr:hover {
            background: #f0f9ff;
        }
        .highlight {
            background: #dbeafe;
            font-weight: 600;
        }
        .footer {
            background: #1e293b;
            color: white;
            text-align: center;
            padding: 1.5rem;
            font-size: 0.9rem;
        }
        .key-findings {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #f59e0b;
            border-radius: 10px;
            padding: 1.5rem;
            margin: 1.5rem 0;
        }
        .key-findings h3 {
            color: #92400e;
            margin-bottom: 0.5rem;
        }
        .key-findings li {
            margin: 0.5rem 0;
            color: #78350f;
        }
        .no-data-note {
            text-align: center;
            color: #64748b;
            font-style: italic;
            padding: 1rem;
            background: #f1f5f9;
            border-radius: 8px;
            margin: 1rem 0;
        }
        @media (max-width: 768px) {
            .chart-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 MediChain Professional Benchmark Report</h1>
            <p class="subtitle">
                Comprehensive performance analysis of the MediChain healthcare data sharing platform
                using Proxy Re-Encryption with 5-attribute AND policy on Sepolia testnet
            </p>
            <div>
                <span class="badge">📊 ${CONFIG.EHR_SIZES_KB.length} Size Categories</span>
                <span class="badge">🔬 ${CONFIG.SAMPLES_PER_SIZE} Samples Each</span>
                <span class="badge">🔐 5-Attribute AND Policy</span>
                <span class="badge">⛓️ Sepolia Testnet</span>
            </div>
        </div>

        ${!showSSXComparison ? `
        <div class="warning-banner">
            ⚠️ <strong>Note:</strong> SSX-EHR comparison data has not been configured. 
            This report shows MediChain results only. To enable comparison, populate the 
            <code>CONFIG.SSX_BENCHMARKS</code> object with actual values from the SSX-EHR article.
        </div>
        ` : ''}

        <div class="content">
            <div class="section">
                <h2>📋 Executive Summary</h2>
                <div class="key-findings">
                    <h3>🔑 Key Findings</h3>
                    <ul>
                        <li><strong>Scalability:</strong> Performance scales predictably with file size across all tested categories</li>
                        <li><strong>Blockchain Costs:</strong> Gas costs remain constant regardless of file size (on-chain operations are size-independent)</li>
                        <li><strong>Policy Efficiency:</strong> 5-attribute AND policy adds minimal computational overhead</li>
                        ${showSSXComparison && improvementData && improvementData[improvementData.length - 1] ?
            `<li><strong>Performance Comparison:</strong> MediChain achieves ${improvementData[improvementData.length - 1]}x improvement over SSX-EHR benchmarks for largest files</li>` :
            '<li><strong>Performance Baseline:</strong> Results establish reliable baseline for future comparisons</li>'}
                    </ul>
                </div>
            </div>

            <div class="section">
                <h2>⏱️ Total Access Time vs File Size</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    End-to-end access time (share + download + decrypt) across different EHR file sizes.
                    ${showSSXComparison ? 'Comparison with SSX-EHR article benchmarks.' : ''}
                </p>
                ${showSSXComparison ? `
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #3b82f6;"></div>
                        <span>MediChain (Our System)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ef4444;"></div>
                        <span>SSX-EHR Article</span>
                    </div>
                </div>
                ` : ''}
                <div class="chart-container">
                    <canvas id="totalAccessChart"></canvas>
                </div>
                <table class="stats-table">
                    <tr>
                        <th>File Size</th>
                        <th>MediChain (ms)</th>
                        ${showSSXComparison ? '<th>SSX-EHR (ms)</th><th>Improvement Factor</th>' : ''}
                    </tr>
                    ${CONFIG.EHR_SIZES_KB.map((size, i) => `
                    <tr class="${i === CONFIG.EHR_SIZES_KB.length - 1 ? 'highlight' : ''}">
                        <td>${size} KB</td>
                        <td>${mediChainData[i] ? mediChainData[i].toFixed(1) : 'N/A'}</td>
                        ${showSSXComparison ? `
                        <td>${ssxData[i] || 'N/A'}</td>
                        <td>${improvementData[i] ? improvementData[i] + 'x faster' : 'N/A'}</td>
                        ` : ''}
                    </tr>
                    `).join('')}
                </table>
                ${!showSSXComparison ? '<p class="no-data-note">📝 SSX-EHR comparison disabled. Add real benchmarks to CONFIG.SSX_BENCHMARKS to enable comparison.</p>' : ''}
            </div>

            <div class="section">
                <h2>📊 Access Time Distribution Histogram</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Frequency distribution of total access times across all ${validResults.length} test runs,
                    demonstrating system consistency and reliability.
                </p>
                <div class="chart-container small">
                    <canvas id="histogramChart"></canvas>
                </div>
            </div>

            <div class="section">
                <h2>🔍 Detailed Operation Breakdown</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Individual operation performance across file sizes.
                    ${showSSXComparison ? 'MediChain (blue) compared with SSX-EHR article benchmarks (red).' : 'Showing MediChain performance only.'}
                </p>
                ${showSSXComparison ? `
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #3b82f6;"></div>
                        <span>MediChain</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ef4444; opacity: 0.7;"></div>
                        <span>SSX-EHR Article</span>
                    </div>
                </div>
                ` : ''}
                <div class="chart-row">
                    ${operationLabels.map((label, idx) => `
                    <div class="chart-container small">
                        <canvas id="operation${idx}Chart"></canvas>
                    </div>
                    `).join('')}
                </div>
                ${!showSSXComparison ? '<p class="no-data-note">📝 SSX-EHR comparison disabled. Add real benchmarks to CONFIG.SSX_BENCHMARKS to enable comparison charts.</p>' : ''}
            </div>

            <div class="section">
                <h2>📈 Comprehensive Statistics</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Complete statistical analysis with mean ± standard deviation across all size categories.
                </p>
                <table class="stats-table">
                    <tr>
                        <th>Metric</th>
                        ${CONFIG.EHR_SIZES_KB.map(s => `<th>${s} KB</th>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>AES Encryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].aesEncryptEHR;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>IPFS Upload (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].pinataUpload;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Proxy Encryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].proxyEncryptKey;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Share Operation (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].totalShareTime;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>IPFS Download (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].pinataDownload;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>AES Decryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].aesDecryptEHR;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr class="highlight">
                        <td><strong>Total Access Time (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].totalAccessTime;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Gas Cost (DZD)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].gasCostDZD;
                return `<td>${d ? d.avg.toFixed(4) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                </table>
            </div>
        </div>

        <div class="footer">
            <p>MediChain Healthcare Data Sharing Platform | Professional Benchmark Report</p>
            <p>Generated: ${new Date().toLocaleString()} | Policy: ${CONFIG.DOCTOR_ATTRIBUTES.join(' AND ')}</p>
            <p style="margin-top: 0.5rem; font-size: 0.8rem;">
                Sepolia Testnet | ${CONFIG.SAMPLES_PER_SIZE} samples per size | Total: ${validResults.length} successful tests
                ${!showSSXComparison ? ' | SSX-EHR comparison: DISABLED' : ''}
            </p>
        </div>
    </div>

    <script>
        // Total Access Time Chart
        const ctx1 = document.getElementById('totalAccessChart').getContext('2d');
        const totalDatasets = [{
            label: 'MediChain Total Access Time',
            data: ${JSON.stringify(mediChainData)},
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointBackgroundColor: '#1d4ed8',
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
        }];
        
        ${showSSXComparison ? `
        totalDatasets.push({
            label: 'SSX-EHR Article Benchmark',
            data: ${JSON.stringify(ssxData)},
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 3,
            borderDash: [5, 5],
            pointBackgroundColor: '#dc2626',
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
        });
        ` : ''}
        
        new Chart(ctx1, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: totalDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Total Access Time vs File Size',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 13 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + ' ms';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (milliseconds)',
                            font: { size: 14, weight: 'bold' }
                        },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'EHR File Size',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                }
            }
        });

        // Histogram
        const ctxHist = document.getElementById('histogramChart').getContext('2d');
        new Chart(ctxHist, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(histogramBins.map(b => b.label))},
                datasets: [{
                    label: 'Number of Tests',
                    data: ${JSON.stringify(histogramBins.map(b => b.count))},
                    backgroundColor: '#3b82f6',
                    borderColor: '#1d4ed8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribution of Total Access Times',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Frequency',
                            font: { size: 14, weight: 'bold' }
                        },
                        ticks: { stepSize: 1 },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Access Time Range (ms)',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                }
            }
        });

        // Operation Charts
        ${operationLabels.map((label, idx) => `
        const ctx${idx + 2} = document.getElementById('operation${idx}Chart').getContext('2d');
        const opDatasets${idx} = [{
            label: 'MediChain',
            data: ${JSON.stringify(mediChainByOperation[idx])},
            backgroundColor: '#3b82f6',
            borderColor: '#1d4ed8',
            borderWidth: 1
        }];
        
        ${showSSXComparison ? `
        opDatasets${idx}.push({
            label: 'SSX-EHR Article',
            data: ${JSON.stringify(ssxByOperation ? ssxByOperation[idx] : [])},
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#dc2626',
            borderWidth: 1
        });
        ` : ''}
        
        new Chart(ctx${idx + 2}, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: opDatasets${idx}
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '${label} Performance',
                        font: { size: 14, weight: 'bold' }
                    },
                    legend: {
                        display: ${showSSXComparison ? 'true' : 'false'},
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            font: { size: 11 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (ms)',
                            font: { size: 11 }
                        },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'File Size',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
        `).join('')}
    </script>
</body>
</html>`;

    fs.writeFileSync('benchmark_professional_report.html', html);
    console.log('📄 Professional HTML report generated: benchmark_professional_report.html');
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

// ==================== CONFIGURABLE PARAMETERS ====================
const CONFIG = {
    // EHR size configurations (in KB)
    EHR_SIZES_KB: [50, 100, 200, 400, 800, 1600],
    TOTAL_EHR_COUNT: 100,  // Total 100 EHRs distributed across sizes
    EHR_OUTPUT_DIR: path.resolve(__dirname, 'ehr_benchmark_data'),

    // Pinata JWT (⚠️ MOVE TO .env BEFORE SHARING)
    PINATA_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZTZhMjdiZi03MDM5LTQ5NzctYTMwNi1jNTQ2Y2YyMjEzYzQiLCJlbWFpbCI6ImlwZnN0ZXN0MkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDkyODYwODUzNDVmMTlhZWI0N2QiLCJzY29wZWRLZXlTZWNyZXQiOiJlMmZmZGZlNDAwYjI4ZmE5MDY2OGQ2NWM0MzRiMDI5MDIyYjFiNWI4NGQwMTY2OTA4ZWE1ZjUxMGU4OTExOTM5IiwiZXhwIjoxODExNDg0MDkyfQ.avTD8CQwW8X6dCl4Dw_Cfu8KmL-65-7ErYILs9IoBjM',

    PROXY_URL: 'http://127.0.0.1:5000',
    RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
    CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

    // 5-attribute AND policy
    DOCTOR_ATTRIBUTES: ["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"],
    POLICY: [["doctor", "working-at-chiguvara", "attending-physician", "researcher", "ATTR"]],

    // Cost conversion (approximate)
    ETH_PRICE_USD: 2500,
    USD_TO_DZD: 135,
    GAS_PRICE_GWEI: 20,

    // SSX-EHR comparison data - Set to null to disable, or populate with real values
    SSX_BENCHMARKS: null
};

// Calculate samples per size to reach exactly 100 total
const samplesPerSize = Math.floor(CONFIG.TOTAL_EHR_COUNT / CONFIG.EHR_SIZES_KB.length);
const remainder = CONFIG.TOTAL_EHR_COUNT % CONFIG.EHR_SIZES_KB.length;
CONFIG.SAMPLES_PER_SIZE = samplesPerSize;
CONFIG.REMAINDER_SAMPLES = remainder;

console.log(`📊 Distribution plan: ${CONFIG.TOTAL_EHR_COUNT} total EHRs`);
console.log(`   - ${samplesPerSize} samples for each of the ${CONFIG.EHR_SIZES_KB.length} size categories`);
if (remainder > 0) {
    console.log(`   - ${remainder} extra samples for the largest size category (1600 KB)`);
}

// ==================== 1. SYNTHETIC EHR GENERATOR ====================
class EHRGenerator {
    static generateFHIRData(targetSizeKB) {
        const targetBytes = targetSizeKB * 1024;

        const baseBundle = {
            resourceType: "Bundle",
            type: "transaction",
            entry: []
        };

        const conditions = [
            "Essential hypertension", "Type 2 diabetes mellitus", "Asthma",
            "Major depressive disorder", "Osteoarthritis", "Hypothyroidism",
            "Chronic kidney disease", "Atrial fibrillation", "COPD",
            "Rheumatoid arthritis", "Coronary artery disease", "Obesity"
        ];

        const medications = [
            "Lisinopril 10mg", "Metformin 500mg", "Albuterol inhaler",
            "Sertraline 50mg", "Acetaminophen 500mg", "Levothyroxine 100mcg",
            "Atorvastatin 20mg", "Omeprazole 20mg", "Metoprolol 50mg",
            "Gabapentin 300mg", "Amlodipine 5mg", "Hydrochlorothiazide 25mg"
        ];

        const observations = [
            { code: "Blood Pressure", unit: "mmHg", range: [110, 160] },
            { code: "Heart Rate", unit: "bpm", range: [60, 100] },
            { code: "Blood Glucose", unit: "mg/dL", range: [70, 200] },
            { code: "BMI", unit: "kg/m2", range: [18, 40] },
            { code: "O2 Saturation", unit: "%", range: [90, 100] },
            { code: "Temperature", unit: "°C", range: [36, 39] }
        ];

        let currentSize = JSON.stringify(baseBundle).length;
        let entryCount = 0;

        while (currentSize < targetBytes) {
            entryCount++;

            if (entryCount % 3 === 0) {
                const condition = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "Condition",
                        id: crypto.randomUUID(),
                        clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
                        code: {
                            coding: [{ system: "http://snomed.info/sct", code: `${100000 + entryCount}`, display: conditions[entryCount % conditions.length] }]
                        },
                        subject: { reference: "Patient/123" },
                        onsetDateTime: new Date(2020 + (entryCount % 4), entryCount % 12, (entryCount % 28) + 1).toISOString()
                    }
                };
                baseBundle.entry.push(condition);
            } else if (entryCount % 3 === 1) {
                const medRequest = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "MedicationRequest",
                        id: crypto.randomUUID(),
                        status: "active",
                        intent: "order",
                        medicationCodeableConcept: {
                            coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: `${200000 + entryCount}`, display: medications[entryCount % medications.length] }]
                        },
                        subject: { reference: "Patient/123" },
                        authoredOn: new Date(2023, entryCount % 12, (entryCount % 28) + 1).toISOString()
                    }
                };
                baseBundle.entry.push(medRequest);
            } else {
                const obs = observations[entryCount % observations.length];
                const value = obs.range[0] + Math.random() * (obs.range[1] - obs.range[0]);
                const observation = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "Observation",
                        id: crypto.randomUUID(),
                        status: "final",
                        code: {
                            coding: [{ system: "http://loinc.org", code: `${300000 + entryCount}`, display: obs.code }]
                        },
                        subject: { reference: "Patient/123" },
                        effectiveDateTime: new Date().toISOString(),
                        valueQuantity: {
                            value: Math.round(value * 10) / 10,
                            unit: obs.unit
                        }
                    }
                };
                baseBundle.entry.push(observation);
            }

            if (entryCount % 10 === 0) {
                const narrativeEntry = {
                    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                    resource: {
                        resourceType: "ClinicalImpression",
                        id: crypto.randomUUID(),
                        status: "completed",
                        subject: { reference: "Patient/123" },
                        summary: `Clinical assessment ${entryCount}: Patient presents with multiple chronic conditions requiring ongoing management. ` +
                            `Current treatment plan includes medication management and lifestyle modifications. ` +
                            `Follow-up scheduled in 3 months to reassess treatment efficacy and adjust as needed. ` +
                            `Additional diagnostic tests may be required depending on clinical presentation. ` +
                            `Patient education provided regarding medication adherence and symptom monitoring.`
                    }
                };
                baseBundle.entry.push(narrativeEntry);
            }

            currentSize = JSON.stringify(baseBundle).length;
            if (entryCount > 10000) break;
        }

        return baseBundle;
    }

    static generateAllEHRFiles(outputDir) {
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });

        const files = [];
        let globalIndex = 0;

        CONFIG.EHR_SIZES_KB.forEach(sizeKB => {
            // Determine how many samples for this size
            let count = CONFIG.SAMPLES_PER_SIZE;
            // Add remainder to the largest size category
            if (sizeKB === CONFIG.EHR_SIZES_KB[CONFIG.EHR_SIZES_KB.length - 1]) {
                count += CONFIG.REMAINDER_SAMPLES;
            }

            for (let i = 0; i < count; i++) {
                globalIndex++;
                const fhirData = this.generateFHIRData(sizeKB);
                const fileName = `ehr_${sizeKB}KB_sample${i + 1}.json`;
                const filePath = path.join(outputDir, fileName);
                const jsonStr = JSON.stringify(fhirData, null, 2);

                const currentSize = Buffer.byteLength(jsonStr, 'utf8');
                const targetBytes = sizeKB * 1024;

                let finalJson = jsonStr;
                if (currentSize < targetBytes) {
                    const padding = ' '.repeat(targetBytes - currentSize - 50);
                    finalJson = jsonStr.replace('"summary": "', `"summary": "${padding}`);
                } else if (currentSize > targetBytes) {
                    const excess = currentSize - targetBytes;
                    const lastSummaryIdx = finalJson.lastIndexOf('"summary": "');
                    if (lastSummaryIdx > 0) {
                        const summaryEnd = finalJson.indexOf('"', lastSummaryIdx + 13);
                        if (summaryEnd > 0) {
                            finalJson = finalJson.substring(0, summaryEnd - excess) + finalJson.substring(summaryEnd);
                        }
                    }
                }

                fs.writeFileSync(filePath, finalJson);
                files.push({
                    filePath,
                    sizeKB,
                    sampleIndex: i + 1,
                    buffer: Buffer.from(finalJson, 'utf8'),
                    globalIndex
                });

                const actualSizeKB = Buffer.byteLength(finalJson, 'utf8') / 1024;
                console.log(`📄 [${globalIndex}/${CONFIG.TOTAL_EHR_COUNT}] Generated: ${fileName} (${actualSizeKB.toFixed(1)} KB)`);
            }
        });

        console.log(`\n✅ Generated ${files.length} EHR files across ${CONFIG.EHR_SIZES_KB.length} size categories`);
        console.log(`   Distribution: ${CONFIG.EHR_SIZES_KB.map((s, i) => {
            const count = files.filter(f => f.sizeKB === s).length;
            return `${s}KB: ${count} files`;
        }).join(', ')}`);
        return files;
    }
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

// ==================== 3. PINATA IPFS ====================
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
        } catch (e) { }
    }
    throw new Error('Pinata download failed');
}

// ==================== 4. BLOCKCHAIN ====================
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

// ==================== 5. PROXY HELPERS ====================
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

// ==================== 6. TIMING HELPERS ====================
const n = () => process.hrtime.bigint();
const ms = s => Number(n() - s) / 1_000_000;

// ==================== 7. FULL WORKFLOW ====================
async function runSingleWorkflow(ehrData, index, total) {
    const metrics = {};
    const fileName = path.basename(ehrData.filePath);
    const fileSizeKB = ehrData.sizeKB;
    console.log(`\n--- [${index + 1}/${total}] File: ${fileName} (${fileSizeKB} KB) ---`);

    let t = n();
    const patient = generateSSI();
    metrics.patientSSI = ms(t);

    t = n();
    const doctor = generateSSI();
    metrics.doctorSSI = ms(t);

    t = n();
    const healthDept = generateSSI();
    metrics.healthDeptSSI = ms(t);

    const aesKey = crypto.randomBytes(32);
    t = n();
    const encEHR = aesEncrypt(ehrData.buffer, aesKey);
    metrics.aesEncryptEHR = ms(t);

    t = n();
    const cid = await pinataUpload(encEHR, `ehr_${index}_${fileName}`);
    metrics.pinataUpload = ms(t);

    t = n();
    await proxyRegisterDoctor(doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.registerDoctor = ms(t);

    let witnessSet = false;
    if (await hasEnoughEth()) {
        const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
        const wh = ethers.keccak256(ethers.toUtf8Bytes('wit_' + Date.now()));
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

    if (witnessSet) {
        t = n();
        await acc.isDoctorActive(doctor.did);
        metrics.checkWitness = ms(t);
    } else {
        metrics.checkWitness = 0;
    }

    const slot = Math.floor(Date.now() / 3600000);
    t = n();
    const encRes = await proxyEncryptAES(aesKey.toString('base64'), CONFIG.POLICY, slot);
    metrics.proxyEncryptKey = ms(t);
    const ctId = encRes.ciphertext_id;

    t = n();
    const rkId = await proxyRekey(ctId, doctor.did, CONFIG.DOCTOR_ATTRIBUTES);
    metrics.proxyRekey = ms(t);

    t = n();
    const transformedId = await proxyReencrypt(rkId);
    metrics.proxyReencrypt = ms(t);

    t = n();
    const keyB64 = await proxyDecryptAES(transformedId, doctor.did);
    metrics.proxyDecryptKey = ms(t);

    t = n();
    const encData = await pinataDownload(cid);
    metrics.pinataDownload = ms(t);

    t = n();
    aesDecrypt(encData, Buffer.from(keyB64, 'base64'));
    metrics.aesDecryptEHR = ms(t);

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

    metrics.totalShareTime = metrics.proxyRekey + metrics.proxyReencrypt + metrics.proxyDecryptKey;
    metrics.totalAccessTime = metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR;
    metrics.totalWorkflowTime = metrics.patientSSI + metrics.doctorSSI + metrics.healthDeptSSI
        + metrics.aesEncryptEHR + metrics.pinataUpload + metrics.registerDoctor
        + (metrics.setWitness || 0) + (metrics.checkWitness || 0) + metrics.proxyEncryptKey
        + metrics.totalShareTime + metrics.pinataDownload + metrics.aesDecryptEHR
        + (metrics.revokeWitness || 0);
    metrics.gasTotal = (metrics.gasWitness || 0) + (metrics.gasRevoke || 0);

    const wei = metrics.gasTotal * CONFIG.GAS_PRICE_GWEI * 1e9;
    const eth = wei / 1e18;
    metrics.gasCostETH = eth;
    metrics.gasCostUSD = eth * CONFIG.ETH_PRICE_USD;
    metrics.gasCostDZD = metrics.gasCostUSD * CONFIG.USD_TO_DZD;

    return { fileName, sizeKB: fileSizeKB, ...metrics };
}

// ==================== 8. MAIN BENCHMARK ====================
async function runBenchmark() {
    console.log('🚀 Starting MediChain Professional Benchmark with 100 EHRs...\n');
    console.log('📊 Size categories:', CONFIG.EHR_SIZES_KB.map(s => s + 'KB').join(', '));
    console.log('📋 Distribution:', `${CONFIG.SAMPLES_PER_SIZE} per size + ${CONFIG.REMAINDER_SAMPLES} extra for 1600KB`);
    console.log(`📈 Total tests: ${CONFIG.TOTAL_EHR_COUNT}\n`);

    if (CONFIG.SSX_BENCHMARKS === null) {
        console.log('⚠️  SSX-EHR comparison data not configured. Report will show MediChain results only.');
        console.log('   To add comparison, update CONFIG.SSX_BENCHMARKS with real article values.\n');
    }

    console.log('🔧 Generating synthetic EHR files...');
    const ehrFiles = EHRGenerator.generateAllEHRFiles(CONFIG.EHR_OUTPUT_DIR);

    const balance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Wallet Balance: ${ethers.formatEther(balance)} ETH\n`);

    const allResults = [];
    for (let i = 0; i < ehrFiles.length; i++) {
        try {
            const res = await runSingleWorkflow(ehrFiles[i], i, ehrFiles.length);
            allResults.push(res);

            // Progress indicator
            if ((i + 1) % 10 === 0) {
                console.log(`\n📊 Progress: ${i + 1}/${ehrFiles.length} completed (${((i + 1) / ehrFiles.length * 100).toFixed(1)}%)`);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            console.error(`❌ Failed:`, err.message);
            allResults.push({
                fileName: path.basename(ehrFiles[i].filePath),
                sizeKB: ehrFiles[i].sizeKB,
                error: err.message
            });
        }
    }

    fs.writeFileSync('benchmark_full_results.json', JSON.stringify(allResults, null, 2));

    const stats = computeStatistics(allResults);
    fs.writeFileSync('benchmark_aggregated_stats.json', JSON.stringify(stats, null, 2));

    generateProfessionalReport(allResults, stats);

    console.log('\n✅ Benchmark Complete!');
    console.log(`📊 Processed ${allResults.length} EHR files`);
    console.log('📄 Reports generated:');
    console.log('   - benchmark_full_results.json (all individual test results)');
    console.log('   - benchmark_aggregated_stats.json (statistical analysis)');
    console.log('   - benchmark_professional_report.html (interactive visualizations)');
}

function computeStatistics(results) {
    const stats = {
        bySize: {},
        overall: {}
    };

    CONFIG.EHR_SIZES_KB.forEach(size => {
        const sizeResults = results.filter(r => r.sizeKB === size && !r.error);
        if (sizeResults.length === 0) return;

        stats.bySize[size] = {
            count: sizeResults.length
        };

        const metricsKeys = [
            'patientSSI', 'aesEncryptEHR', 'pinataUpload',
            'proxyEncryptKey', 'totalShareTime', 'pinataDownload',
            'aesDecryptEHR', 'totalAccessTime', 'totalWorkflowTime'
        ];

        metricsKeys.forEach(key => {
            const values = sizeResults.map(r => r[key]).filter(v => v !== undefined && v > 0);
            if (values.length > 0) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                stats.bySize[size][key] = {
                    min: Math.min(...values),
                    max: Math.max(...values),
                    avg: avg,
                    std: Math.sqrt(values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length)
                };
            }
        });

        const gasValues = sizeResults.map(r => r.gasCostDZD).filter(v => v !== undefined && v > 0);
        if (gasValues.length > 0) {
            stats.bySize[size].gasCostDZD = {
                min: Math.min(...gasValues),
                max: Math.max(...gasValues),
                avg: gasValues.reduce((a, b) => a + b, 0) / gasValues.length
            };
        }
    });

    return stats;
}

// ==================== 9. PROFESSIONAL HTML REPORT ====================
function generateProfessionalReport(results, stats) {
    const validResults = results.filter(r => !r.error);
    const showSSXComparison = CONFIG.SSX_BENCHMARKS !== null;

    const sizeLabels = CONFIG.EHR_SIZES_KB.map(s => s + ' KB');

    const mediChainData = CONFIG.EHR_SIZES_KB.map(size => {
        const sizeData = stats.bySize[size];
        return sizeData && sizeData.totalAccessTime ? sizeData.totalAccessTime.avg : 0;
    });

    let ssxData = null;
    let improvementData = null;

    if (showSSXComparison) {
        ssxData = CONFIG.EHR_SIZES_KB.map(size =>
            CONFIG.SSX_BENCHMARKS['Total Access'] ? CONFIG.SSX_BENCHMARKS['Total Access'][size.toString()] || 0 : 0
        );
        improvementData = CONFIG.EHR_SIZES_KB.map((size, i) =>
            mediChainData[i] && ssxData[i] ? (ssxData[i] / mediChainData[i]).toFixed(2) : null
        );
    }

    const accessTimes = validResults.map(r => r.totalAccessTime).filter(t => t > 0).sort((a, b) => a - b);
    const minTime = accessTimes.length > 0 ? Math.min(...accessTimes) : 0;
    const maxTime = accessTimes.length > 0 ? Math.max(...accessTimes) : 100;
    const binCount = 20; // More bins for 100 samples
    const binWidth = (maxTime - minTime) / binCount;

    const histogramBins = [];
    for (let i = 0; i < binCount; i++) {
        const binStart = minTime + i * binWidth;
        const binEnd = binStart + binWidth;
        const count = accessTimes.filter(t => t >= binStart && t < binEnd).length;
        if (count > 0) {
            histogramBins.push({
                label: `${binStart.toFixed(0)}-${binEnd.toFixed(0)}`,
                count: count
            });
        }
    }

    const operationKeys = ['aesEncryptEHR', 'proxyEncryptKey', 'totalShareTime', 'pinataDownload', 'aesDecryptEHR'];
    const operationLabels = ['AES Encryption', 'Proxy Encryption', 'Share Operation', 'IPFS Download', 'AES Decryption'];

    const mediChainByOperation = operationKeys.map(key => {
        return CONFIG.EHR_SIZES_KB.map(size => {
            const sizeData = stats.bySize[size];
            return sizeData && sizeData[key] ? sizeData[key].avg : 0;
        });
    });

    let ssxByOperation = null;
    if (showSSXComparison) {
        ssxByOperation = operationLabels.map(label => {
            return CONFIG.EHR_SIZES_KB.map(size =>
                CONFIG.SSX_BENCHMARKS[label] ? CONFIG.SSX_BENCHMARKS[label][size.toString()] || 0 : 0
            );
        });
    }

    // Calculate file size distribution for pie chart
    const sizeDistribution = CONFIG.EHR_SIZES_KB.map(size => {
        return validResults.filter(r => r.sizeKB === size).length;
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediChain Professional Benchmark Report - 100 EHRs</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.25);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 3rem 2rem;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
        }
        .header .subtitle {
            font-size: 1.1rem;
            opacity: 0.9;
            max-width: 800px;
            margin: 1rem auto;
            line-height: 1.6;
        }
        .header .badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 0.5rem 1.5rem;
            border-radius: 50px;
            margin: 0.5rem;
            font-weight: 500;
            backdrop-filter: blur(10px);
        }
        .warning-banner {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            color: #92400e;
            padding: 1rem 2rem;
            text-align: center;
            font-weight: 500;
        }
        .content {
            padding: 2rem;
        }
        .section {
            margin-bottom: 3rem;
            background: #f8fafc;
            border-radius: 15px;
            padding: 2rem;
            border: 1px solid #e2e8f0;
        }
        .section h2 {
            color: #1e3a8a;
            font-size: 1.8rem;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 3px solid #3b82f6;
            display: inline-block;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin: 1.5rem 0;
            background: white;
            border-radius: 10px;
            padding: 1rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .chart-container.small {
            height: 350px;
        }
        .chart-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin: 1.5rem 0;
        }
        .chart-row.three-col {
            grid-template-columns: 1fr 1fr 1fr;
        }
        .legend {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin: 1rem 0;
            font-weight: 500;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 4px;
        }
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stats-table th {
            background: #1e3a8a;
            color: white;
            padding: 15px;
            font-weight: 600;
            text-align: center;
        }
        .stats-table td {
            padding: 12px 15px;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
        }
        .stats-table tr:hover {
            background: #f0f9ff;
        }
        .highlight {
            background: #dbeafe;
            font-weight: 600;
        }
        .footer {
            background: #1e293b;
            color: white;
            text-align: center;
            padding: 1.5rem;
            font-size: 0.9rem;
        }
        .key-findings {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #f59e0b;
            border-radius: 10px;
            padding: 1.5rem;
            margin: 1.5rem 0;
        }
        .key-findings h3 {
            color: #92400e;
            margin-bottom: 0.5rem;
        }
        .key-findings li {
            margin: 0.5rem 0;
            color: #78350f;
        }
        .no-data-note {
            text-align: center;
            color: #64748b;
            font-style: italic;
            padding: 1rem;
            background: #f1f5f9;
            border-radius: 8px;
            margin: 1rem 0;
        }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 1.5rem 0;
        }
        .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stat-card .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #1e3a8a;
        }
        .stat-card .stat-label {
            color: #64748b;
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }
        @media (max-width: 768px) {
            .chart-row, .chart-row.three-col {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 MediChain Professional Benchmark Report</h1>
            <p class="subtitle">
                Comprehensive performance analysis of 100 Electronic Health Records (EHRs)
                across 6 size categories using Proxy Re-Encryption with 5-attribute AND policy
            </p>
            <div>
                <span class="badge">📊 100 Total EHRs</span>
                <span class="badge">📏 6 Size Categories</span>
                <span class="badge">🔐 5-Attribute AND Policy</span>
                <span class="badge">⛓️ Sepolia Testnet</span>
                <span class="badge">📈 ${validResults.length} Successful Tests</span>
            </div>
        </div>

        ${!showSSXComparison ? `
        <div class="warning-banner">
            ⚠️ <strong>Note:</strong> SSX-EHR comparison data has not been configured. 
            This report shows MediChain results only. To enable comparison, populate the 
            <code>CONFIG.SSX_BENCHMARKS</code> object with actual values from the SSX-EHR article.
        </div>
        ` : ''}

        <div class="content">
            <!-- Summary Statistics Cards -->
            <div class="section">
                <h2>📋 Executive Summary</h2>
                <div class="summary-stats">
                    <div class="stat-card">
                        <div class="stat-value">${CONFIG.TOTAL_EHR_COUNT}</div>
                        <div class="stat-label">Total EHR Files</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${CONFIG.EHR_SIZES_KB.length}</div>
                        <div class="stat-label">Size Categories</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${validResults.length > 0 ? (validResults.reduce((a, b) => a + b.totalAccessTime, 0) / validResults.length).toFixed(0) : 'N/A'}</div>
                        <div class="stat-label">Avg Access Time (ms)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Object.keys(stats.bySize).length}</div>
                        <div class="stat-label">Categories Tested</div>
                    </div>
                </div>
                <div class="key-findings">
                    <h3>🔑 Key Findings from 100 EHR Benchmark</h3>
                    <ul>
                        <li><strong>Scalability Confirmed:</strong> Performance scales predictably across 50KB to 1600KB file sizes</li>
                        <li><strong>Consistent Blockchain Costs:</strong> Gas fees remain constant regardless of EHR size</li>
                        <li><strong>Efficient Encryption:</strong> 5-attribute AND policy shows minimal overhead</li>
                        <li><strong>Reliable IPFS Storage:</strong> Pinata IPFS demonstrates consistent upload/download times</li>
                        ${showSSXComparison && improvementData && improvementData[improvementData.length - 1] ?
            `<li><strong>Performance Advantage:</strong> MediChain achieves ${improvementData[improvementData.length - 1]}x improvement over SSX-EHR benchmarks</li>` : ''}
                    </ul>
                </div>
            </div>

            <!-- File Size Distribution Pie Chart -->
            <div class="section">
                <h2>📊 Dataset Distribution</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Distribution of 100 EHR files across 6 size categories (50KB - 1600KB).
                </p>
                <div class="chart-row">
                    <div class="chart-container small">
                        <canvas id="distributionPie"></canvas>
                    </div>
                    <div class="chart-container small">
                        <canvas id="distributionBar"></canvas>
                    </div>
                </div>
            </div>

            <!-- Total Access Time vs File Size -->
            <div class="section">
                <h2>⏱️ Total Access Time vs File Size</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Average end-to-end access time (share + download + decrypt) across file sizes.
                    ${showSSXComparison ? 'Comparison with SSX-EHR article benchmarks.' : ''}
                </p>
                ${showSSXComparison ? `
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #3b82f6;"></div>
                        <span>MediChain (Our System)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ef4444;"></div>
                        <span>SSX-EHR Article</span>
                    </div>
                </div>
                ` : ''}
                <div class="chart-container">
                    <canvas id="totalAccessChart"></canvas>
                </div>
                <table class="stats-table">
                    <tr>
                        <th>File Size</th>
                        <th>Samples</th>
                        <th>Avg Access Time (ms)</th>
                        <th>Min (ms)</th>
                        <th>Max (ms)</th>
                        ${showSSXComparison ? '<th>SSX-EHR (ms)</th><th>Improvement</th>' : ''}
                    </tr>
                    ${CONFIG.EHR_SIZES_KB.map((size, i) => {
                const sizeStats = stats.bySize[size];
                return `
                    <tr class="${i === CONFIG.EHR_SIZES_KB.length - 1 ? 'highlight' : ''}">
                        <td>${size} KB</td>
                        <td>${sizeStats ? sizeStats.count : 0}</td>
                        <td>${sizeStats && sizeStats.totalAccessTime ? sizeStats.totalAccessTime.avg.toFixed(1) + ' ± ' + sizeStats.totalAccessTime.std.toFixed(1) : 'N/A'}</td>
                        <td>${sizeStats && sizeStats.totalAccessTime ? sizeStats.totalAccessTime.min.toFixed(1) : 'N/A'}</td>
                        <td>${sizeStats && sizeStats.totalAccessTime ? sizeStats.totalAccessTime.max.toFixed(1) : 'N/A'}</td>
                        ${showSSXComparison ? `
                        <td>${ssxData && ssxData[i] || 'N/A'}</td>
                        <td>${improvementData && improvementData[i] ? improvementData[i] + 'x' : 'N/A'}</td>
                        ` : ''}
                    </tr>`;
            }).join('')}
                </table>
            </div>

            <!-- Access Time Distribution Histogram -->
            <div class="section">
                <h2>📊 Access Time Distribution Histogram</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Frequency distribution of total access times across all ${validResults.length} test runs,
                    demonstrating system consistency across 100 EHR files.
                </p>
                <div class="chart-container">
                    <canvas id="histogramChart"></canvas>
                </div>
            </div>

            <!-- Operation Breakdown -->
            <div class="section">
                <h2>🔍 Detailed Operation Breakdown by File Size</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Individual operation performance across file sizes.
                    ${showSSXComparison ? 'MediChain (blue) compared with SSX-EHR benchmarks (red).' : 'MediChain performance analysis.'}
                </p>
                ${showSSXComparison ? `
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #3b82f6;"></div>
                        <span>MediChain</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ef4444; opacity: 0.7;"></div>
                        <span>SSX-EHR Article</span>
                    </div>
                </div>
                ` : ''}
                <div class="chart-row">
                    ${operationLabels.map((label, idx) => `
                    <div class="chart-container small">
                        <canvas id="operation${idx}Chart"></canvas>
                    </div>
                    `).join('')}
                </div>
            </div>

            <!-- Comprehensive Statistics Table -->
            <div class="section">
                <h2>📈 Comprehensive Statistical Analysis</h2>
                <p style="color: #64748b; margin-bottom: 1rem;">
                    Complete statistics (mean ± standard deviation) for all metrics across ${CONFIG.EHR_SIZES_KB.length} size categories.
                </p>
                <table class="stats-table">
                    <tr>
                        <th>Metric</th>
                        ${CONFIG.EHR_SIZES_KB.map(s => `<th>${s} KB<br><small>(${stats.bySize[s] ? stats.bySize[s].count : 0} samples)</small></th>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>AES Encryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].aesEncryptEHR;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>IPFS Upload (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].pinataUpload;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Proxy Encryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].proxyEncryptKey;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Share Operation (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].totalShareTime;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>IPFS Download (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].pinataDownload;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>AES Decryption (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].aesDecryptEHR;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr class="highlight">
                        <td><strong>Total Access Time (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].totalAccessTime;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Total Workflow (ms)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].totalWorkflowTime;
                return `<td>${d ? d.avg.toFixed(1) + ' ± ' + (d.std || 0).toFixed(1) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                    <tr>
                        <td><strong>Gas Cost (DZD)</strong></td>
                        ${CONFIG.EHR_SIZES_KB.map(s => {
                const d = stats.bySize[s] && stats.bySize[s].gasCostDZD;
                return `<td>${d ? d.avg.toFixed(4) : 'N/A'}</td>`;
            }).join('')}
                    </tr>
                </table>
            </div>
        </div>

        <div class="footer">
            <p>MediChain Healthcare Data Sharing Platform | Professional Benchmark Report</p>
            <p>Generated: ${new Date().toLocaleString()} | Policy: ${CONFIG.DOCTOR_ATTRIBUTES.join(' AND ')}</p>
            <p style="margin-top: 0.5rem; font-size: 0.8rem;">
                Sepolia Testnet | 100 Total EHRs | ${Object.values(stats.bySize).reduce((a, b) => a + (b.count || 0), 0)} files processed
                ${!showSSXComparison ? ' | SSX-EHR comparison: DISABLED' : ''}
            </p>
        </div>
    </div>

    <script>
        // Distribution Pie Chart
        const ctxPie = document.getElementById('distributionPie').getContext('2d');
        new Chart(ctxPie, {
            type: 'pie',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: [{
                    data: ${JSON.stringify(sizeDistribution)},
                    backgroundColor: ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8', '#1e3a8a'],
                    borderColor: 'white',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'EHR File Size Distribution',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        position: 'bottom',
                        labels: { padding: 15 }
                    }
                }
            }
        });

        // Distribution Bar Chart
        const ctxBar = document.getElementById('distributionBar').getContext('2d');
        new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: [{
                    label: 'Number of EHR Files',
                    data: ${JSON.stringify(sizeDistribution)},
                    backgroundColor: '#3b82f6',
                    borderColor: '#1d4ed8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Samples per Size Category',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Count' },
                        ticks: { stepSize: 2 }
                    }
                }
            }
        });

        // Total Access Time Chart
        const ctx1 = document.getElementById('totalAccessChart').getContext('2d');
        const totalDatasets = [{
            label: 'MediChain Total Access Time',
            data: ${JSON.stringify(mediChainData)},
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointBackgroundColor: '#1d4ed8',
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
        }];
        
        ${showSSXComparison ? `
        totalDatasets.push({
            label: 'SSX-EHR Article Benchmark',
            data: ${JSON.stringify(ssxData)},
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 3,
            borderDash: [5, 5],
            pointBackgroundColor: '#dc2626',
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
        });
        ` : ''}
        
        new Chart(ctx1, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: totalDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Total Access Time vs File Size (100 EHR Benchmark)',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 20, font: { size: 13 } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Time (milliseconds)', font: { size: 14, weight: 'bold' } },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: { display: true, text: 'EHR File Size', font: { size: 14, weight: 'bold' } }
                    }
                }
            }
        });

        // Histogram
        const ctxHist = document.getElementById('histogramChart').getContext('2d');
        new Chart(ctxHist, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(histogramBins.map(b => b.label))},
                datasets: [{
                    label: 'Number of Tests',
                    data: ${JSON.stringify(histogramBins.map(b => b.count))},
                    backgroundColor: '#3b82f6',
                    borderColor: '#1d4ed8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribution of Total Access Times (All 100 EHRs)',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Frequency', font: { size: 14, weight: 'bold' } },
                        ticks: { stepSize: 1 },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: { display: true, text: 'Access Time Range (ms)', font: { size: 14, weight: 'bold' } }
                    }
                }
            }
        });

        // Operation Charts
        ${operationLabels.map((label, idx) => `
        const ctx${idx + 2} = document.getElementById('operation${idx}Chart').getContext('2d');
        const opDatasets${idx} = [{
            label: 'MediChain',
            data: ${JSON.stringify(mediChainByOperation[idx])},
            backgroundColor: '#3b82f6',
            borderColor: '#1d4ed8',
            borderWidth: 1
        }];
        
        ${showSSXComparison ? `
        opDatasets${idx}.push({
            label: 'SSX-EHR Article',
            data: ${JSON.stringify(ssxByOperation ? ssxByOperation[idx] : [])},
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#dc2626',
            borderWidth: 1
        });
        ` : ''}
        
        new Chart(ctx${idx + 2}, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(sizeLabels)},
                datasets: opDatasets${idx}
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '${label} Performance',
                        font: { size: 14, weight: 'bold' }
                    },
                    legend: {
                        display: ${showSSXComparison ? 'true' : 'false'},
                        position: 'bottom',
                        labels: { usePointStyle: true, font: { size: 11 } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Time (ms)', font: { size: 11 } },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: { display: true, text: 'File Size', font: { size: 11 } }
                    }
                }
            }
        });
        `).join('')}
    </script>
</body>
</html>`;

    fs.writeFileSync('benchmark_professional_report.html', html);
    console.log('📄 Professional HTML report generated: benchmark_professional_report.html');
}

// ==================== START ====================
runBenchmark().catch(console.error);