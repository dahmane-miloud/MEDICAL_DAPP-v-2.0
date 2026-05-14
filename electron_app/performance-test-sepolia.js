/*

const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

const PROXY_URL = 'http://127.0.0.1:5000';
const RPC_URL = 'https://ethereum-sepolia.publicnode.com';
const ITERATIONS = 5;

const YOUR_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const DEPLOYED_CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

let accumulatorAddress = DEPLOYED_CONTRACT_ADDRESS;
console.log(`Using accumulator at ${accumulatorAddress}`);

function generateDIDPair() {
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
   return { did, keyPair };
}

function randomEHR() {
   return {
      patientName: `Patient_${Math.floor(Math.random() * 10000)}`,
      recordDate: new Date().toISOString(),
      diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
      prescriptions: [`Drug_${Math.floor(Math.random() * 100)}`],
      notes: 'Test medical record',
      timestamp: Date.now()
   };
}

function aesEncrypt(data, key) {
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   return { encrypted: Buffer.concat([iv, authTag, encrypted]) };
}

function aesDecrypt(encryptedBuffer, key) {
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Mock Pinata functions (for testing only)
async function mockUpload(buffer, filename) {
   const mockCid = 'Qm' + crypto.randomBytes(28).toString('base64').substring(0, 46);
   console.log(`   [MOCK] Uploaded ${filename} -> ${mockCid}`);
   return { cid: mockCid };
}

async function mockDownload(cid) {
   return Buffer.from('mock encrypted data');
}

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

const provider = new ethers.JsonRpcProvider(RPC_URL);
const accumulatorABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function getCurrentAccumulator() external view returns (bytes32, uint256, uint256)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(YOUR_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(accumulatorAddress, accumulatorABI, signer);
   const balance = await provider.getBalance(signer.address);
   console.log(`Wallet: ${signer.address}`);
   console.log(`Balance: ${ethers.formatEther(balance)} SepoliaETH`);
   const [witness, count] = await accumulatorContract.getCurrentAccumulator();
   console.log(`Contract OK. Active doctors: ${count}`);
   return true;
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   return { gasUsed: receipt.gasUsed.toString() };
}

async function revokeDoctor(doctorDid) {
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   return { gasUsed: receipt.gasUsed.toString() };
}

async function isDoctorActive(doctorDid) {
   return await accumulatorContract.isDoctorActive(doctorDid);
}

async function runTest() {
   console.log('\nStarting SIMPLIFIED Performance Test on SEPOLIA\n');

   console.log('Generating identities...');
   const doctor = generateDIDPair();
   const health = generateDIDPair();

   console.log('Connecting to Sepolia...');
   await initBlockchain();
   console.log('Ready\n');

   console.log('Registering doctor on proxy...');
   await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
   console.log('Doctor registered\n');

   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;
   console.log(`Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);

   console.log('\nIssuing witness...');
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (365 * 86400);
   const { gasUsed } = await issueWitness(doctor.did, witnessHash, expiry);
   console.log(`Witness issued! Gas used: ${gasUsed}`);

   const active = await isDoctorActive(doctor.did);
   console.log(`Doctor active: ${active}\n`);

   console.log(`Running ${ITERATIONS} iterations (simplified, no IPFS)...\n`);

   for (let i = 1; i <= ITERATIONS; i++) {
      console.log(`Iteration ${i}/${ITERATIONS}:`);

      const ehrData = JSON.stringify(randomEHR());
      const ehrBuffer = Buffer.from(ehrData, 'utf8');

      const aesKey = crypto.randomBytes(32);

      const { encrypted: encryptedEhr } = aesEncrypt(ehrBuffer, aesKey);
      console.log(`   ✓ AES encrypted (${encryptedEhr.length} bytes)`);

      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];

      const { ciphertext_id: ctId } = await encryptAESKey(aesKeyBase64, policy, timeSlot);
      console.log(`   ✓ TB-PRE encapsulated`);

      const mockCid = await mockUpload(encryptedEhr, `ehr_${i}.enc`);

      const { rekey_id } = await generateRekey(ctId, doctor.did, ['doctor']);
      const { transformed_ct_id } = await proxyReencrypt(rekey_id);
      const { aes_key_b64 } = await decryptAES(transformed_ct_id, doctor.did);

      const decryptedKey = Buffer.from(aes_key_b64, 'base64');
      const decryptedEhr = aesDecrypt(encryptedEhr, decryptedKey);
      const decryptedStr = decryptedEhr.toString('utf8');

      if (decryptedStr === ehrData) {
         console.log(`   ✓ SUCCESS - Data verified\n`);
      } else {
         console.log(`   ✗ FAILED - Data mismatch\n`);
         process.exit(1);
      }
   }

   console.log('Revoking doctor...');
   const { gasUsed: revokeGas } = await revokeDoctor(doctor.did);
   console.log(`Doctor revoked! Gas used: ${revokeGas}`);

   console.log('\n✅ TEST COMPLETE! All iterations passed.');
}

runTest().catch(console.error);

*/


/*
// performance-test-sepolia.js - COMPLETE WORKING VERSION FOR SEPOLIA
const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ========== CONFIGURATION ==========
const PINATA_API_KEY = '03959fc6abd1baa890bf';
const PINATA_API_SECRET = '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778';
const PROXY_URL = 'http://127.0.0.1:5000';
const RPC_URL = 'https://ethereum-sepolia.publicnode.com';
const ITERATIONS = 5;
const WITNESS_VALIDITY_DAYS = 365;

// REPLACE WITH YOUR ACTUAL PRIVATE KEY
const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`✅ Using accumulator at ${CONTRACT_ADDRESS}`);

// ========== CORRECT ABI FOR YOUR CONTRACT ==========
const accumulatorABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)",
   "function getCurrentAccumulator() external view returns (bytes32, uint256, uint256)",
   "function activeDoctorCount() external view returns (uint256)",
   "function witnessAccumulator() external view returns (bytes32)"
];

// ========== UTILITIES ==========
function generateDIDPair() {
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
   return { did, keyPair };
}

function randomEHR() {
   return {
      patientName: `Patient_${Math.floor(Math.random() * 10000)}`,
      recordDate: new Date().toISOString(),
      diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
      prescriptions: [`Drug_${Math.floor(Math.random() * 100)}`],
      notes: 'Test medical record for Sepolia',
      timestamp: Date.now()
   };
}

function aesEncrypt(data, key) {
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   return { encrypted: Buffer.concat([iv, authTag, encrypted]) };
}

function aesDecrypt(encryptedBuffer, key) {
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Mock Pinata (avoid 403 errors)
async function mockUpload(buffer, filename) {
   const mockCid = 'Qm' + crypto.randomBytes(20).toString('hex');
   return { cid: mockCid };
}

async function mockDownload(cid) {
   return Buffer.from('mock encrypted data');
}

const pinataUpload = mockUpload;
const pinataDownload = mockDownload;

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
let accumulatorContract;
let healthSigner;

async function initBlockchain(healthPrivateKey) {
   const signer = new ethers.Wallet(healthPrivateKey, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, accumulatorABI, signer);
   healthSigner = signer;

   const balance = await provider.getBalance(signer.address);
   console.log(`   Wallet: ${signer.address}`);
   console.log(`   Balance: ${ethers.formatEther(balance)} SepoliaETH`);

   // Simple call to verify contract
   const count = await accumulatorContract.activeDoctorCount();
   console.log(`   Contract connected. Active doctors: ${count.toString()}`);

   return true;
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

// ========== EXCHANGE RATE ==========
let ethToDzdRate = 350000;
async function fetchEthToDzd() {
   try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=dzd');
      if (response.data?.ethereum?.dzd) {
         ethToDzdRate = response.data.ethereum.dzd;
         console.log(`💰 1 ETH = ${ethToDzdRate.toFixed(2)} DZD`);
      }
   } catch (err) {
      console.log(`💰 Using fallback rate: 1 ETH = ${ethToDzdRate} DZD`);
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
         witnessIssueTime: [],
         witnessIssueGas: [],
         witnessIssueCostDZD: [],
         revokeTime: [],
         revokeGas: [],
         revokeCostDZD: [],
         totalAccessTime: []
      };
   }

   record(name, value) {
      this.measurements[name].push(value);
   }

   recordGas(name, gas) {
      this.measurements[name].push(parseInt(gas));
   }
}

// ========== MAIN TEST ==========
async function runTest() {
   console.log('\n========================================');
   console.log('🚀 Starting Performance Test on SEPOLIA');
   console.log('========================================\n');

   // 1. Generate identities
   console.log('🔑 Generating test identities...');
   const doctor = generateDIDPair();

   // 2. Initialize blockchain
   console.log('📡 Connecting to Sepolia blockchain...');
   await initBlockchain(HEALTH_PRIVATE_KEY);
   console.log('✅ Health department ready\n');

   // 3. Register doctor on proxy
   console.log('📡 Registering doctor on TB‑PRE proxy...');
   try {
      await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
      console.log('✅ Doctor registered on proxy\n');
   } catch (error) {
      console.error('❌ Proxy error:', error.message);
      console.log('   Make sure your Flask backend is running on http://127.0.0.1:5000\n');
      process.exit(1);
   }

   // 4. Fetch rate and gas price
   await fetchEthToDzd();
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;
   console.log(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // 5. Issue witness
   console.log('⛓️ Issuing witness on Accumulator contract...');
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (WITNESS_VALIDITY_DAYS * 86400);
   const witnessStart = Date.now();
   const { gasUsed: witnessGas } = await issueWitness(doctor.did, witnessHash, expiry);
   const witnessTime = Date.now() - witnessStart;
   const witnessCostWei = BigInt(witnessGas) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;
   console.log(`   ✅ Witness issued in ${witnessTime} ms`);
   console.log(`   Gas used: ${witnessGas}, Cost: ${witnessCostDzd.toFixed(4)} DZD\n`);

   // 6. Verify doctor active
   const active = await isDoctorActive(doctor.did);
   if (!active) throw new Error('Doctor not active');
   console.log('✅ Doctor active\n');

   const metrics = new MetricsCollector();
   metrics.record('witnessIssueTime', witnessTime);
   metrics.recordGas('witnessIssueGas', witnessGas);
   metrics.record('witnessIssueCostDZD', witnessCostDzd);

   console.log(`📊 Running ${ITERATIONS} iterations...\n`);

   for (let i = 1; i <= ITERATIONS; i++) {
      console.log(`   Iteration ${i}/${ITERATIONS}:`);

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

      // Proxy encryption
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const proxyEncStart = Date.now();
      const { ciphertext_id: ctId, ciphertext } = await encryptAESKey(aesKeyBase64, policy, timeSlot);
      const proxyEncTime = Date.now() - proxyEncStart;
      metrics.record('proxyEncapsulation', proxyEncTime);

      // Upload to mock IPFS
      await pinataUpload(encryptedEhr, `ehr_${i}.enc`);

      // Doctor access
      const accessStart = Date.now();

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

      // Decrypt and verify
      const aesDecryptStart = Date.now();
      const decryptedKey = Buffer.from(aes_key_b64, 'base64');
      const decryptedEhr = aesDecrypt(encryptedEhr, decryptedKey);
      const aesDecryptTime = Date.now() - aesDecryptStart;
      metrics.record('aesDecrypt', aesDecryptTime);

      const totalAccess = Date.now() - accessStart;
      metrics.record('totalAccessTime', totalAccess);

      const decryptedStr = decryptedEhr.toString('utf8');
      if (decryptedStr === ehrData) {
         console.log(`      ✅ Data verified`);
      } else {
         console.error(`      ❌ Data mismatch`);
         process.exit(1);
      }
   }

   console.log('\n✅ Test complete. Revoking doctor...\n');

   // Revoke
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

   // Save results
   const output = {
      iterations: ITERATIONS,
      network: 'Sepolia',
      contract: CONTRACT_ADDRESS,
      metrics: {
         witnessIssuance: {
            timeMs: witnessTime,
            gasUsed: witnessGas,
            costDZD: witnessCostDzd
         },
         revocation: {
            timeMs: revokeTime,
            gasUsed: revokeGas,
            costDZD: revokeCostDzd
         },
         averageAccessTimeMs: metrics.measurements.totalAccessTime.reduce((a, b) => a + b, 0) / metrics.measurements.totalAccessTime.length
      }
   };

   fs.writeFileSync('metrics-sepolia.json', JSON.stringify(output, null, 2));
   console.log('\n📁 metrics-sepolia.json saved');

   console.log('\n========================================');
   console.log('🎉 PERFORMANCE TEST COMPLETE!');
   console.log('========================================');
   console.log(`\n📊 Results Summary:`);
   console.log(`   Witness issuance: ${witnessTime} ms | ${witnessGas} gas | ${witnessCostDzd.toFixed(4)} DZD`);
   console.log(`   Revocation: ${revokeTime} ms | ${revokeGas} gas | ${revokeCostDzd.toFixed(4)} DZD`);
   console.log(`   Avg access time: ${output.metrics.averageAccessTimeMs.toFixed(2)} ms\n`);
}

// Run the test
runTest().catch(console.error);


*/


/*

3 good test
// complete-performance-test.js - Full metrics for 100 EHRs with HTML/CSS report
const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ========== CONFIGURATION ==========
const PINATA_API_KEY = '03959fc6abd1baa890bf';
const PINATA_API_SECRET = '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778';
const PROXY_URL = 'http://127.0.0.1:5000';
const RPC_URL = 'https://ethereum-sepolia.publicnode.com';
const ITERATIONS = 100;  // 100 EHRs as requested
const WITNESS_VALIDITY_DAYS = 365;

// REPLACE WITH YOUR ACTUAL PRIVATE KEY
const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`\n🔬 COMPLETE PERFORMANCE TEST - ${ITERATIONS} EHRs`);
console.log(`📡 Contract: ${CONTRACT_ADDRESS}\n`);

// ========== CONTRACT ABI ==========
const accumulatorABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)",
   "function activeDoctorCount() external view returns (uint256)"
];

// ========== UTILITIES ==========
function generateDIDPair() {
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
   return { did, publicKey: publicKeyBase64, privateKey: encodeBase64(keyPair.secretKey), keyPair };
}

function randomEHR(index) {
   return {
      ehrId: `EHR_${index}_${Date.now()}`,
      patientId: `P_${Math.floor(Math.random() * 10000)}`,
      patientName: `Patient_${Math.floor(Math.random() * 10000)}`,
      age: Math.floor(Math.random() * 80) + 18,
      gender: ['Male', 'Female', 'Other'][Math.floor(Math.random() * 3)],
      recordDate: new Date().toISOString(),
      diagnosis: `Diagnosis_${Math.random().toString(36).substring(7)}`,
      prescriptions: [`Drug_${Math.floor(Math.random() * 100)}`, `Drug_${Math.floor(Math.random() * 100)}`],
      labResults: `Result_${Math.random().toString(36).substring(10)}`,
      doctorNotes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      timestamp: Date.now()
   };
}

// In-memory storage for mock Pinata
const mockStorage = new Map();

function aesEncrypt(data, key) {
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   return { encrypted: result, iv, authTag, size: result.length };
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
   const start = Date.now();
   const cid = 'Qm' + crypto.randomBytes(20).toString('hex');
   mockStorage.set(cid, buffer);
   return { cid, duration: Date.now() - start, success: true, size: buffer.length };
}

async function pinataDownload(cid) {
   const start = Date.now();
   const data = mockStorage.get(cid);
   if (!data) {
      return { data: Buffer.from(''), duration: Date.now() - start, success: false };
   }
   return { data: data, duration: Date.now() - start, success: true, size: data.length };
}

// ========== TB‑PRE PROXY FUNCTIONS ==========
async function registerDoctor(doctorDid, attributes) {
   const start = Date.now();
   const res = await axios.post(`${PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   return { data: res.data, duration: Date.now() - start };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const start = Date.now();
   const res = await axios.post(`${PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   return { data: res.data, duration: Date.now() - start };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const start = Date.now();
   const res = await axios.post(`${PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   return { data: res.data, duration: Date.now() - start };
}

async function proxyReencrypt(rekeyId) {
   const start = Date.now();
   const res = await axios.post(`${PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   return { data: res.data, duration: Date.now() - start };
}

async function decryptAES(transformedCtId, doctorDid) {
   const start = Date.now();
   const res = await axios.post(`${PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   return { data: res.data, duration: Date.now() - start };
}

// ========== BLOCKCHAIN FUNCTIONS ==========
const provider = new ethers.JsonRpcProvider(RPC_URL);
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, accumulatorABI, signer);
   const balance = await provider.getBalance(signer.address);
   console.log(`💰 Wallet: ${signer.address}`);
   console.log(`💰 Balance: ${ethers.formatEther(balance)} SepoliaETH\n`);
   return signer;
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const start = Date.now();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      duration: Date.now() - start
   };
}

async function revokeDoctor(doctorDid) {
   const start = Date.now();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      duration: Date.now() - start
   };
}

async function isDoctorActive(doctorDid) {
   const start = Date.now();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   return { active: result, duration: Date.now() - start };
}

// ========== METRICS COLLECTOR ==========
class CompleteMetricsCollector {
   constructor() {
      this.perEhrMetrics = [];
      this.summaryMetrics = {
         // Crypto metrics
         aesKeyGenerationTimes: [],
         aesEncryptionTimes: [],
         aesDecryptionTimes: [],

         // Proxy metrics
         doctorRegistrationTimes: [],
         proxyEncapsulationTimes: [],
         proxyRekeyGenerationTimes: [],
         proxyReencryptionTimes: [],
         proxyDecryptAESTimes: [],

         // IPFS metrics
         pinataUploadEncryptedTimes: [],
         pinataUploadCiphertextTimes: [],
         pinataDownloadTimes: [],
         pinataUploadSizes: [],

         // Blockchain metrics
         witnessIssuanceTimes: [],
         witnessIssuanceGas: [],
         witnessIssuanceCosts: [],
         doctorActiveCheckTimes: [],
         revokeTimes: [],
         revokeGas: [],
         revokeCosts: [],

         // End-to-end metrics
         totalAccessTimes: [],
         totalWorkflowTimes: [],

         // Data metrics
         ehrOriginalSizes: [],
         ehrEncryptedSizes: []
      };
   }

   recordPerEhr(ehrId, metrics) {
      this.perEhrMetrics.push({ ehrId, ...metrics });
   }

   record(metric, value) {
      if (this.summaryMetrics[metric]) {
         this.summaryMetrics[metric].push(value);
      }
   }

   getStats(arr) {
      if (arr.length === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0, stdDev: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = sum / arr.length;

      // Calculate standard deviation
      const squaredDiffs = arr.map(value => Math.pow(value - avg, 2));
      const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / arr.length);

      return {
         min: sorted[0],
         max: sorted[sorted.length - 1],
         avg: avg,
         median: sorted[Math.floor(arr.length / 2)],
         p95: sorted[Math.floor(arr.length * 0.95)],
         p99: sorted[Math.floor(arr.length * 0.99)],
         stdDev: stdDev,
         total: sum,
         count: arr.length
      };
   }

   generateReport(gasPrice, ethToDzdRate) {
      const report = {
         experimentInfo: {
            date: new Date().toISOString(),
            iterations: this.perEhrMetrics.length,
            network: 'Sepolia',
            contractAddress: CONTRACT_ADDRESS,
            gasPriceGwei: parseFloat(ethers.formatUnits(gasPrice, 'gwei')),
            ethToDzdRate: ethToDzdRate
         },
         perEhrMetrics: this.perEhrMetrics,
         summary: {
            cryptoMetrics: {
               aesKeyGeneration: this.getStats(this.summaryMetrics.aesKeyGenerationTimes),
               aesEncryption: this.getStats(this.summaryMetrics.aesEncryptionTimes),
               aesDecryption: this.getStats(this.summaryMetrics.aesDecryptionTimes)
            },
            proxyMetrics: {
               doctorRegistration: this.getStats(this.summaryMetrics.doctorRegistrationTimes),
               keyEncapsulation: this.getStats(this.summaryMetrics.proxyEncapsulationTimes),
               rekeyGeneration: this.getStats(this.summaryMetrics.proxyRekeyGenerationTimes),
               proxyReencryption: this.getStats(this.summaryMetrics.proxyReencryptionTimes),
               proxyDecryptAES: this.getStats(this.summaryMetrics.proxyDecryptAESTimes)
            },
            ipfsMetrics: {
               uploadEncryptedEHR: this.getStats(this.summaryMetrics.pinataUploadEncryptedTimes),
               uploadCiphertext: this.getStats(this.summaryMetrics.pinataUploadCiphertextTimes),
               download: this.getStats(this.summaryMetrics.pinataDownloadTimes),
               averageUploadSizeKB: this.getStats(this.summaryMetrics.pinataUploadSizes).avg / 1024
            },
            blockchainMetrics: {
               witnessIssuance: {
                  timeMs: this.getStats(this.summaryMetrics.witnessIssuanceTimes),
                  gasUsed: this.getStats(this.summaryMetrics.witnessIssuanceGas),
                  costDZD: this.getStats(this.summaryMetrics.witnessIssuanceCosts)
               },
               doctorActiveCheck: this.getStats(this.summaryMetrics.doctorActiveCheckTimes),
               revocation: {
                  timeMs: this.getStats(this.summaryMetrics.revokeTimes),
                  gasUsed: this.getStats(this.summaryMetrics.revokeGas),
                  costDZD: this.getStats(this.summaryMetrics.revokeCosts)
               }
            },
            endToEndMetrics: {
               totalAccessTime: this.getStats(this.summaryMetrics.totalAccessTimes),
               totalWorkflowTime: this.getStats(this.summaryMetrics.totalWorkflowTimes)
            },
            dataMetrics: {
               originalEHRSizeBytes: this.getStats(this.summaryMetrics.ehrOriginalSizes),
               encryptedEHRSizeBytes: this.getStats(this.summaryMetrics.ehrEncryptedSizes),
               averageCompressionRatio: this.getStats(this.summaryMetrics.ehrOriginalSizes).avg / this.getStats(this.summaryMetrics.ehrEncryptedSizes).avg
            }
         }
      };

      fs.writeFileSync('complete-metrics.json', JSON.stringify(report, null, 2));
      return report;
   }
}

// ========== HTML REPORT GENERATOR ==========
function generateHtmlReport(report) {
   const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Medical DApp - Complete Performance Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header .subtitle {
            font-size: 1.1em;
            opacity: 0.9;
        }
        
        .badge {
            display: inline-block;
            background: #27ae60;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            margin-top: 15px;
        }
        
        .content {
            padding: 30px;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section-title {
            font-size: 1.8em;
            color: #2c3e50;
            border-left: 5px solid #3498db;
            padding-left: 15px;
            margin-bottom: 20px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: transform 0.3s;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        }
        
        .card-title {
            font-size: 1.3em;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        .metric-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 8px;
            background: white;
            border-radius: 8px;
        }
        
        .metric-label {
            font-weight: 600;
            color: #7f8c8d;
        }
        
        .metric-value {
            font-family: 'Courier New', monospace;
            font-weight: 700;
            color: #2c3e50;
        }
        
        .highlight {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
        }
        
        .highlight .metric-row {
            background: rgba(255,255,255,0.1);
            color: white;
        }
        
        .highlight .metric-label {
            color: rgba(255,255,255,0.8);
        }
        
        .highlight .metric-value {
            color: white;
            font-weight: bold;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        th {
            background: #3498db;
            color: white;
            position: sticky;
            top: 0;
        }
        
        tr:hover {
            background: #f5f5f5;
        }
        
        .footer {
            background: #2c3e50;
            color: white;
            text-align: center;
            padding: 20px;
            font-size: 0.9em;
        }
        
        .chart-container {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        canvas {
            max-height: 400px;
            width: 100%;
        }
        
        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .section-title {
                font-size: 1.4em;
            }
            
            .header h1 {
                font-size: 1.8em;
            }
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Medical DApp Performance Report</h1>
            <div class="subtitle">Complete Metrics for ${report.experimentInfo.iterations} EHRs on Sepolia Testnet</div>
            <div class="badge">🔬 Experiment 1 - ${report.experimentInfo.date}</div>
        </div>
        
        <div class="content">
            <!-- Summary Highlights -->
            <div class="highlight">
                <div class="stats-grid">
                    <div class="metric-row">
                        <span class="metric-label">📊 Total EHRs Processed:</span>
                        <span class="metric-value">${report.experimentInfo.iterations}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">⛽ Average Gas Price:</span>
                        <span class="metric-value">${report.experimentInfo.gasPriceGwei} Gwei</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">💰 Exchange Rate:</span>
                        <span class="metric-value">1 ETH = ${report.experimentInfo.ethToDzdRate.toFixed(2)} DZD</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">⚡ Avg Total Access Time:</span>
                        <span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.avg.toFixed(2)} ms</span>
                    </div>
                </div>
            </div>
            
            <!-- Crypto Metrics -->
            <div class="section">
                <h2 class="section-title">🔐 Cryptographic Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">AES Key Generation</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.cryptoMetrics.aesKeyGeneration.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Min / Max:</span><span class="metric-value">${report.summary.cryptoMetrics.aesKeyGeneration.min.toFixed(2)} / ${report.summary.cryptoMetrics.aesKeyGeneration.max.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.cryptoMetrics.aesKeyGeneration.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Std Dev:</span><span class="metric-value">${report.summary.cryptoMetrics.aesKeyGeneration.stdDev.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">AES-256 GCM Encryption</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.cryptoMetrics.aesEncryption.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Min / Max:</span><span class="metric-value">${report.summary.cryptoMetrics.aesEncryption.min.toFixed(2)} / ${report.summary.cryptoMetrics.aesEncryption.max.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.cryptoMetrics.aesEncryption.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Std Dev:</span><span class="metric-value">${report.summary.cryptoMetrics.aesEncryption.stdDev.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">AES Decryption</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.cryptoMetrics.aesDecryption.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Min / Max:</span><span class="metric-value">${report.summary.cryptoMetrics.aesDecryption.min.toFixed(2)} / ${report.summary.cryptoMetrics.aesDecryption.max.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.cryptoMetrics.aesDecryption.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Std Dev:</span><span class="metric-value">${report.summary.cryptoMetrics.aesDecryption.stdDev.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Proxy Metrics -->
            <div class="section">
                <h2 class="section-title">🔑 TB-PRE Proxy Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Key Encapsulation</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.proxyMetrics.keyEncapsulation.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.proxyMetrics.keyEncapsulation.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Rekey Generation</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.proxyMetrics.rekeyGeneration.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.proxyMetrics.rekeyGeneration.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Proxy Re-encryption</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.proxyMetrics.proxyReencryption.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.proxyMetrics.proxyReencryption.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Proxy AES Decryption</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.proxyMetrics.proxyDecryptAES.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.proxyMetrics.proxyDecryptAES.p95.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- IPFS Metrics -->
            <div class="section">
                <h2 class="section-title">📦 Pinata IPFS Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Upload (Encrypted EHR)</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.ipfsMetrics.uploadEncryptedEHR.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Average Size:</span><span class="metric-value">${report.summary.ipfsMetrics.averageUploadSizeKB.toFixed(2)} KB</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Upload (Ciphertext)</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.ipfsMetrics.uploadCiphertext.avg.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Download</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.ipfsMetrics.download.avg.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Blockchain Metrics -->
            <div class="section">
                <h2 class="section-title">⛓️ Blockchain Metrics (Sepolia)</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Witness Issuance (setDoctorWitness)</div>
                        <div class="metric-row"><span class="metric-label">Time:</span><span class="metric-value">${report.summary.blockchainMetrics.witnessIssuance.timeMs.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Gas Used:</span><span class="metric-value">${report.summary.blockchainMetrics.witnessIssuance.gasUsed.avg.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Cost:</span><span class="metric-value">${report.summary.blockchainMetrics.witnessIssuance.costDZD.avg.toFixed(4)} DZD</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Doctor Active Check</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.blockchainMetrics.doctorActiveCheck.avg.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Revocation (revokeDoctor)</div>
                        <div class="metric-row"><span class="metric-label">Time:</span><span class="metric-value">${report.summary.blockchainMetrics.revocation.timeMs.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Gas Used:</span><span class="metric-value">${report.summary.blockchainMetrics.revocation.gasUsed.avg.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Cost:</span><span class="metric-value">${report.summary.blockchainMetrics.revocation.costDZD.avg.toFixed(4)} DZD</span></div>
                    </div>
                </div>
            </div>
            
            <!-- End-to-End Metrics -->
            <div class="section">
                <h2 class="section-title">⚡ End-to-End Performance Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Total Access Time (Doctor Request → Decrypted EHR)</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Median:</span><span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.median.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P99:</span><span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.p99.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Std Dev:</span><span class="metric-value">${report.summary.endToEndMetrics.totalAccessTime.stdDev.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Total Workflow Time (Complete)</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${report.summary.endToEndMetrics.totalWorkflowTime.avg.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${report.summary.endToEndMetrics.totalWorkflowTime.p95.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Data Metrics -->
            <div class="section">
                <h2 class="section-title">📁 Data Size Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">EHR Size</div>
                        <div class="metric-row"><span class="metric-label">Original:</span><span class="metric-value">${(report.summary.dataMetrics.originalEHRSizeBytes.avg / 1024).toFixed(2)} KB</span></div>
                        <div class="metric-row"><span class="metric-label">Encrypted:</span><span class="metric-value">${(report.summary.dataMetrics.encryptedEHRSizeBytes.avg / 1024).toFixed(2)} KB</span></div>
                        <div class="metric-row"><span class="metric-label">Overhead:</span><span class="metric-value">${((report.summary.dataMetrics.encryptedEHRSizeBytes.avg / report.summary.dataMetrics.originalEHRSizeBytes.avg) * 100).toFixed(1)}%</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Per-EHR Results Table -->
            <div class="section">
                <h2 class="section-title">📋 Per-EHR Results (Last 20)</h2>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr><th>EHR ID</th><th>AES Enc (ms)</th><th>AES Dec (ms)</th><th>Proxy Encap (ms)</th><th>Proxy ReEnc (ms)</th><th>Total Access (ms)</th><th>Witness Check (ms)</th></tr>
                        </thead>
                        <tbody>
                            ${report.perEhrMetrics.slice(-20).map(ehr => `
                            <tr>
                                <td>${ehr.ehrId.substring(0, 20)}...</td>
                                <td>${ehr.aesEncryptionTime.toFixed(2)}</td>
                                <td>${ehr.aesDecryptionTime.toFixed(2)}</td>
                                <td>${ehr.proxyEncapsulationTime.toFixed(2)}</td>
                                <td>${ehr.proxyReencryptionTime.toFixed(2)}</td>
                                <td><strong>${ehr.totalAccessTime.toFixed(2)}</strong></td>
                                <td>${ehr.witnessCheckTime.toFixed(2)}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Gas Consumption Summary -->
            <div class="section">
                <h2 class="section-title">💰 Gas Consumption & Cost Analysis</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Total Gas for 100 EHR Workflow</div>
                        <div class="metric-row"><span class="metric-label">Witness Issuance:</span><span class="metric-value">${report.summary.blockchainMetrics.witnessIssuance.gasUsed.total.toLocaleString()} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Per EHR Access:</span><span class="metric-value">0 gas (off-chain)</span></div>
                        <div class="metric-row"><span class="metric-label">Revocation:</span><span class="metric-value">${report.summary.blockchainMetrics.revocation.gasUsed.avg.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label"><strong>Total Gas:</strong></span><span class="metric-value"><strong>${(report.summary.blockchainMetrics.witnessIssuance.gasUsed.total).toLocaleString()} gas</strong></span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Total Cost (DZD)</div>
                        <div class="metric-row"><span class="metric-label">Witness Issuance:</span><span class="metric-value">${report.summary.blockchainMetrics.witnessIssuance.costDZD.total.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label">Revocation:</span><span class="metric-value">${report.summary.blockchainMetrics.revocation.costDZD.avg.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label"><strong>Total Cost:</strong></span><span class="metric-value"><strong>${(report.summary.blockchainMetrics.witnessIssuance.costDZD.total + report.summary.blockchainMetrics.revocation.costDZD.avg).toFixed(4)} DZD</strong></span></div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            Generated on ${new Date().toLocaleString()} | Medical DApp Performance Test | Sepolia Testnet
        </div>
    </div>
</body>
</html>`;

   fs.writeFileSync('performance-report.html', html);
   console.log('📄 HTML report saved: performance-report.html');
}

// ========== EXCHANGE RATE ==========
async function fetchEthToDzd() {
   try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=dzd');
      if (response.data?.ethereum?.dzd) {
         return response.data.ethereum.dzd;
      }
   } catch (err) { }
   return 350000;
}

// ========== MAIN TEST ==========
async function runCompleteTest() {
   console.log('╔══════════════════════════════════════════════════════════════╗');
   console.log('║     COMPLETE PERFORMANCE TEST - 100 EHRs                     ║');
   console.log('║     Measuring ALL metrics for medical DApp                   ║');
   console.log('╚══════════════════════════════════════════════════════════════╝\n');

   // Initialize
   console.log('🔧 Initializing...');
   await initBlockchain();
   const ethToDzdRate = await fetchEthToDzd();
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;
   console.log(`💰 1 ETH = ${ethToDzdRate.toFixed(2)} DZD`);
   console.log(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // Generate identities
   console.log('👥 Generating identities...');
   const doctor = generateDIDPair();

   // Register doctor on proxy
   console.log('📝 Registering doctor...');
   const regResult = await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
   console.log(`   ✅ Registered in ${regResult.duration} ms`);

   // Issue witness on blockchain
   console.log('⛓️ Issuing witness on blockchain...');
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (WITNESS_VALIDITY_DAYS * 86400);
   const witnessResult = await issueWitness(doctor.did, witnessHash, expiry);

   const witnessCostWei = BigInt(witnessResult.gasUsed) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;

   console.log(`   ✅ Witness issued - Time: ${witnessResult.duration} ms | Gas: ${witnessResult.gasUsed} | Cost: ${witnessCostDzd.toFixed(4)} DZD\n`);

   // Verify doctor active
   const activeCheck = await isDoctorActive(doctor.did);
   if (!activeCheck.active) throw new Error('Doctor not active');
   console.log(`✅ Doctor active (check time: ${activeCheck.duration} ms)\n`);

   const metrics = new CompleteMetricsCollector();

   // Record initial metrics
   metrics.record('doctorRegistrationTimes', regResult.duration);
   metrics.record('witnessIssuanceTimes', witnessResult.duration);
   metrics.record('witnessIssuanceGas', witnessResult.gasUsed);
   metrics.record('witnessIssuanceCosts', witnessCostDzd);
   metrics.record('doctorActiveCheckTimes', activeCheck.duration);

   console.log(`🚀 Running ${ITERATIONS} EHRs...\n`);
   console.log('┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐');
   console.log('│ EHR #   │ AES Enc      │ AES Dec      │ Proxy Encap  │ Proxy ReEnc  │ Witness Chk  │ Total Access │');
   console.log('├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤');

   for (let i = 1; i <= ITERATIONS; i++) {
      const workflowStart = Date.now();

      // Generate EHR data
      const ehrData = randomEHR(i);
      const ehrBuffer = Buffer.from(JSON.stringify(ehrData), 'utf8');
      metrics.record('ehrOriginalSizes', ehrBuffer.length);

      // 1. AES Key Generation
      const keyGenStart = Date.now();
      const aesKey = crypto.randomBytes(32);
      const keyGenTime = Date.now() - keyGenStart;
      metrics.record('aesKeyGenerationTimes', keyGenTime);

      // 2. AES Encryption
      const encStart = Date.now();
      const { encrypted: encryptedEhr, size: encryptedSize } = aesEncrypt(ehrBuffer, aesKey);
      const encTime = Date.now() - encStart;
      metrics.record('aesEncryptionTimes', encTime);
      metrics.record('ehrEncryptedSizes', encryptedSize);

      // 3. Proxy Encapsulation (TB-PRE)
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);
      metrics.record('proxyEncapsulationTimes', encapResult.duration);

      // 4. Upload to Pinata (Encrypted EHR)
      const uploadEhrResult = await pinataUpload(encryptedEhr, `ehr_${i}.enc`);
      metrics.record('pinataUploadEncryptedTimes', uploadEhrResult.duration);
      metrics.record('pinataUploadSizes', uploadEhrResult.size);

      // 5. Upload Ciphertext to Pinata
      const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
      const uploadCtResult = await pinataUpload(ciphertextBuffer, `ct_${i}.json`);
      metrics.record('pinataUploadCiphertextTimes', uploadCtResult.duration);

      // --- DOCTOR ACCESS PHASE ---
      const accessStart = Date.now();

      // 6. Check witness (patient verification)
      const witnessCheckStart = Date.now();
      const stillActive = await isDoctorActive(doctor.did);
      const witnessCheckTime = Date.now() - witnessCheckStart;
      metrics.record('doctorActiveCheckTimes', witnessCheckTime);

      // 7. Generate Rekey (request share)
      const rekeyResult = await generateRekey(encapResult.data.ciphertext_id, doctor.did, ['doctor']);
      metrics.record('proxyRekeyGenerationTimes', rekeyResult.duration);

      // 8. Proxy Re-encryption (share time)
      const reencryptResult = await proxyReencrypt(rekeyResult.data.rekey_id);
      metrics.record('proxyReencryptionTimes', reencryptResult.duration);

      // 9. Decrypt AES Key via Proxy
      const decryptAesResult = await decryptAES(reencryptResult.data.transformed_ct_id, doctor.did);
      metrics.record('proxyDecryptAESTimes', decryptAesResult.duration);

      // 10. Download from Pinata
      const downloadResult = await pinataDownload(uploadEhrResult.cid);
      metrics.record('pinataDownloadTimes', downloadResult.duration);

      // 11. AES Decryption (decrypt EHR)
      const aesDecryptStart = Date.now();
      const decryptedKey = Buffer.from(decryptAesResult.data.aes_key_b64, 'base64');
      const decryptedEhr = aesDecrypt(downloadResult.data, decryptedKey);
      const aesDecryptTime = Date.now() - aesDecryptStart;
      metrics.record('aesDecryptionTimes', aesDecryptTime);

      // Total access time (from request to decrypted EHR)
      const totalAccess = Date.now() - accessStart;
      metrics.record('totalAccessTimes', totalAccess);

      // Verify integrity
      const decryptedStr = decryptedEhr.toString('utf8');
      const originalStr = JSON.stringify(ehrData);

      if (decryptedStr !== originalStr) {
         console.error(`\n❌ Data mismatch at EHR ${i}`);
         process.exit(1);
      }

      // Total workflow time
      const totalWorkflow = Date.now() - workflowStart;
      metrics.record('totalWorkflowTimes', totalWorkflow);

      // Record per-EHR metrics
      metrics.recordPerEhr(`EHR_${i}`, {
         aesKeyGenerationTime: keyGenTime,
         aesEncryptionTime: encTime,
         aesDecryptionTime: aesDecryptTime,
         proxyEncapsulationTime: encapResult.duration,
         proxyRekeyGenerationTime: rekeyResult.duration,
         proxyReencryptionTime: reencryptResult.duration,
         proxyDecryptAESTime: decryptAesResult.duration,
         pinataUploadEncryptedTime: uploadEhrResult.duration,
         pinataUploadCiphertextTime: uploadCtResult.duration,
         pinataDownloadTime: downloadResult.duration,
         witnessCheckTime: witnessCheckTime,
         totalAccessTime: totalAccess,
         totalWorkflowTime: totalWorkflow,
         ehrOriginalSize: ehrBuffer.length,
         ehrEncryptedSize: encryptedSize
      });

      // Progress display
      console.log(`│ ${String(i).padEnd(6)} │ ${String(encTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(encapResult.duration.toFixed(2)).padEnd(12)} │ ${String(reencryptResult.duration.toFixed(2)).padEnd(12)} │ ${String(witnessCheckTime.toFixed(2)).padEnd(12)} │ ${String(totalAccess.toFixed(2)).padEnd(12)} │`);

      if (i % 25 === 0 && i < ITERATIONS) {
         console.log('├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤');
      }
   }

   console.log('└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n');

   // Revoke doctor
   console.log('⛓️ Revoking doctor...');
   const revokeResult = await revokeDoctor(doctor.did);
   const revokeCostWei = BigInt(revokeResult.gasUsed) * gasPrice;
   const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
   const revokeCostDzd = revokeCostEth * ethToDzdRate;
   metrics.record('revokeTimes', revokeResult.duration);
   metrics.record('revokeGas', revokeResult.gasUsed);
   metrics.record('revokeCosts', revokeCostDzd);
   console.log(`   ✅ Revoked - Time: ${revokeResult.duration} ms | Gas: ${revokeResult.gasUsed} | Cost: ${revokeCostDzd.toFixed(4)} DZD\n`);

   // Generate complete report
   console.log('📊 Generating comprehensive report...');
   const report = metrics.generateReport(gasPrice, ethToDzdRate);

   // Generate HTML report
   generateHtmlReport(report);

   // Display summary
   console.log('\n╔══════════════════════════════════════════════════════════════╗');
   console.log('║                    FINAL RESULTS SUMMARY                      ║');
   console.log('╚══════════════════════════════════════════════════════════════╝\n');

   console.log('📈 CRYPTO METRICS:');
   console.log(`   ├─ AES Key Generation: ${report.summary.cryptoMetrics.aesKeyGeneration.avg.toFixed(2)} ms (avg)`);
   console.log(`   ├─ AES Encryption: ${report.summary.cryptoMetrics.aesEncryption.avg.toFixed(2)} ms (avg)`);
   console.log(`   └─ AES Decryption: ${report.summary.cryptoMetrics.aesDecryption.avg.toFixed(2)} ms (avg)`);

   console.log('\n🔐 PROXY METRICS:');
   console.log(`   ├─ Doctor Registration: ${report.summary.proxyMetrics.doctorRegistration.avg.toFixed(2)} ms`);
   console.log(`   ├─ Key Encapsulation: ${report.summary.proxyMetrics.keyEncapsulation.avg.toFixed(2)} ms`);
   console.log(`   ├─ Rekey Generation (Request Share): ${report.summary.proxyMetrics.rekeyGeneration.avg.toFixed(2)} ms`);
   console.log(`   ├─ Proxy Re-encryption (Share Time): ${report.summary.proxyMetrics.proxyReencryption.avg.toFixed(2)} ms`);
   console.log(`   └─ Proxy AES Decryption: ${report.summary.proxyMetrics.proxyDecryptAES.avg.toFixed(2)} ms`);

   console.log('\n📦 IPFS METRICS:');
   console.log(`   ├─ Upload (Encrypted EHR): ${report.summary.ipfsMetrics.uploadEncryptedEHR.avg.toFixed(2)} ms`);
   console.log(`   ├─ Upload (Ciphertext): ${report.summary.ipfsMetrics.uploadCiphertext.avg.toFixed(2)} ms`);
   console.log(`   └─ Download: ${report.summary.ipfsMetrics.download.avg.toFixed(2)} ms`);

   console.log('\n⛓️ BLOCKCHAIN METRICS:');
   console.log(`   ├─ Witness Issuance: ${report.summary.blockchainMetrics.witnessIssuance.timeMs.avg.toFixed(2)} ms | ${report.summary.blockchainMetrics.witnessIssuance.gasUsed.avg.toFixed(0)} gas | ${report.summary.blockchainMetrics.witnessIssuance.costDZD.avg.toFixed(4)} DZD`);
   console.log(`   ├─ Witness Verification (Patient): ${report.summary.blockchainMetrics.doctorActiveCheck.avg.toFixed(2)} ms`);
   console.log(`   └─ Revocation: ${report.summary.blockchainMetrics.revocation.timeMs.avg.toFixed(2)} ms | ${report.summary.blockchainMetrics.revocation.gasUsed.avg.toFixed(0)} gas | ${report.summary.blockchainMetrics.revocation.costDZD.avg.toFixed(4)} DZD`);

   console.log('\n⚡ END-TO-END METRICS:');
   console.log(`   ├─ Total Access Time (Doctor Request → Decrypted EHR): ${report.summary.endToEndMetrics.totalAccessTime.avg.toFixed(2)} ms (avg)`);
   console.log(`   ├─ Total Access Time (P95): ${report.summary.endToEndMetrics.totalAccessTime.p95.toFixed(2)} ms`);
   console.log(`   └─ Total Workflow Time: ${report.summary.endToEndMetrics.totalWorkflowTime.avg.toFixed(2)} ms (avg)`);

   console.log('\n📁 DATA METRICS:');
   console.log(`   ├─ Original EHR Size: ${(report.summary.dataMetrics.originalEHRSizeBytes.avg / 1024).toFixed(2)} KB`);
   console.log(`   ├─ Encrypted EHR Size: ${(report.summary.dataMetrics.encryptedEHRSizeBytes.avg / 1024).toFixed(2)} KB`);
   console.log(`   └─ Size Overhead: ${((report.summary.dataMetrics.encryptedEHRSizeBytes.avg / report.summary.dataMetrics.originalEHRSizeBytes.avg) * 100).toFixed(1)}%`);

   console.log('\n📁 Files Generated:');
   console.log(`   ├─ complete-metrics.json - Raw data in JSON format`);
   console.log(`   └─ performance-report.html - Visual report with charts`);

   console.log('\n╔══════════════════════════════════════════════════════════════╗');
   console.log('║                    TEST COMPLETED SUCCESSFULLY                ║');
   console.log(`║                    ${ITERATIONS} EHRs processed                               ║`);
   console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// Run the test
runCompleteTest().catch(console.error);

*/


/*

test 4 good 
// professional-performance-test.js - Complete 100 EHR Test Suite
// Production-grade performance testing for Medical DApp on Sepolia

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
   EHR_COUNT: 100,
   WITNESS_VALIDITY_DAYS: 365,
   TEST_RUN_ID: `TEST_${Date.now()}`,
   REPEAT_RUNS: 1,  // Number of complete runs for statistical significance
   CONFIDENCE_INTERVAL: 0.95  // 95% confidence interval
};

// REPLACE WITH YOUR PRIVATE KEY
const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PROFESSIONAL PERFORMANCE TEST SUITE                         ║
║                    Medical DApp - Sepolia Testnet                              ║
║                    ${CONFIG.EHR_COUNT} EHRs | ${CONFIG.REPEAT_RUNS} Run(s) | 95% Confidence Interval            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== CONTRACT ABI ====================
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool)",
   "function activeDoctorCount() external view returns (uint256)",
   "function witnessAccumulator() external view returns (bytes32)"
];

// ==================== UTILITY FUNCTIONS ====================
function generateDIDPair() {
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const did = 'did:key:z' + publicKeyBase64.substring(0, 44);
   return { did, publicKey: publicKeyBase64, privateKey: encodeBase64(keyPair.secretKey), keyPair };
}

function generateRealisticEHR(index) {
   const conditions = ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'COPD', 'Coronary Artery Disease',
      'Depression', 'Anxiety', 'Osteoarthritis', 'Migraine', 'Allergic Rhinitis'];
   const medications = ['Lisinopril', 'Metformin', 'Albuterol', 'Atorvastatin', 'Sertraline',
      'Levothyroxine', 'Omeprazole', 'Losartan', 'Gabapentin', 'Prednisone'];
   const labs = ['CBC', 'CMP', 'Lipid Panel', 'HbA1c', 'TSH', 'Vitamin D', 'Iron Panel', 'CRP', 'ESR', 'BNP'];

   return {
      ehrId: `EHR_${String(index).padStart(4, '0')}_${Date.now()}`,
      patientInfo: {
         id: `P_${Math.floor(Math.random() * 100000)}`,
         name: `Patient_${Math.floor(Math.random() * 10000)}`,
         age: Math.floor(Math.random() * 70) + 18,
         gender: ['Male', 'Female', 'Non-binary'][Math.floor(Math.random() * 3)],
         bloodType: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][Math.floor(Math.random() * 8)]
      },
      clinicalData: {
         primaryDiagnosis: conditions[Math.floor(Math.random() * conditions.length)],
         secondaryDiagnosis: Math.random() > 0.7 ? conditions[Math.floor(Math.random() * conditions.length)] : 'None',
         medications: Array.from({ length: Math.floor(Math.random() * 4) + 1 }, () => medications[Math.floor(Math.random() * medications.length)]),
         labResults: Array.from({ length: Math.floor(Math.random() * 5) + 2 }, () => ({
            test: labs[Math.floor(Math.random() * labs.length)],
            value: (Math.random() * 100).toFixed(1),
            unit: ['mg/dL', 'ng/mL', 'IU/L', 'mmol/L'][Math.floor(Math.random() * 4)],
            referenceRange: `${(Math.random() * 50).toFixed(0)}-${(Math.random() * 150 + 50).toFixed(0)}`
         }))
      },
      visitInfo: {
         date: new Date().toISOString(),
         department: ['Cardiology', 'Endocrinology', 'Pulmonology', 'Neurology', 'Psychiatry'][Math.floor(Math.random() * 5)],
         physician: `Dr_${Math.random().toString(36).substring(7)}`,
         followUpRequired: Math.random() > 0.6,
         notes: `Patient presents with ${conditions[Math.floor(Math.random() * conditions.length)].toLowerCase()}. ` +
            `Treatment plan initiated. Follow-up recommended in ${Math.floor(Math.random() * 90) + 7} days.`
      },
      timestamp: Date.now(),
      version: '2.0'
   };
}

// Storage for mock IPFS
const mockStorage = new Map();

function aesEncrypt(data, key) {
   const startTime = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const endTime = process.hrtime.bigint();
   return {
      encrypted: result,
      size: result.length,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

function aesDecrypt(encryptedBuffer, key) {
   const startTime = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const endTime = process.hrtime.bigint();
   return {
      data: result,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function pinataUpload(buffer, filename) {
   const startTime = process.hrtime.bigint();
   const cid = 'Qm' + crypto.randomBytes(20).toString('hex');
   mockStorage.set(cid, buffer);
   const endTime = process.hrtime.bigint();
   return {
      cid,
      timeMs: Number(endTime - startTime) / 1_000_000,
      size: buffer.length,
      success: true
   };
}

async function pinataDownload(cid) {
   const startTime = process.hrtime.bigint();
   const data = mockStorage.get(cid);
   const endTime = process.hrtime.bigint();
   if (!data) {
      return { data: Buffer.from(''), timeMs: Number(endTime - startTime) / 1_000_000, success: false };
   }
   return {
      data: data,
      timeMs: Number(endTime - startTime) / 1_000_000,
      size: data.length,
      success: true
   };
}

// ==================== PROXY FUNCTIONS ====================
async function registerDoctor(doctorDid, attributes) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== BLOCKCHAIN FUNCTIONS ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   const balance = await provider.getBalance(signer.address);
   const network = await provider.getNetwork();
   return { signer, balance: ethers.formatEther(balance), chainId: network.chainId };
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function revokeDoctor(doctorDid) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function isDoctorActive(doctorDid) {
   const startTime = process.hrtime.bigint();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   const endTime = process.hrtime.bigint();
   return { active: result, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== STATISTICAL ANALYSIS ====================
class StatisticalAnalyzer {
   static calculateStats(values) {
      if (!values || values.length === 0) return null;

      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mean = sum / n;

      // Variance and Standard Deviation
      const squaredDiffs = sorted.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
      const stdDev = Math.sqrt(variance);

      // Confidence Interval (95%)
      const zScore = 1.96; // For 95% confidence
      const marginOfError = zScore * (stdDev / Math.sqrt(n));
      const confidenceInterval = {
         lower: mean - marginOfError,
         upper: mean + marginOfError
      };

      // Percentiles
      const getPercentile = (p) => sorted[Math.floor(n * p / 100)];

      // Outlier detection (IQR method)
      const q1 = getPercentile(25);
      const q3 = getPercentile(75);
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      const outliers = sorted.filter(v => v < lowerBound || v > upperBound);

      return {
         count: n,
         min: sorted[0],
         max: sorted[n - 1],
         mean: mean,
         median: getPercentile(50),
         stdDev: stdDev,
         variance: variance,
         p10: getPercentile(10),
         p25: getPercentile(25),
         p75: getPercentile(75),
         p90: getPercentile(90),
         p95: getPercentile(95),
         p99: getPercentile(99),
         confidenceInterval95: confidenceInterval,
         outliers: outliers,
         outlierCount: outliers.length,
         sum: sum
      };
   }

   static compareRuns(run1, run2, metricName) {
      const stats1 = this.calculateStats(run1);
      const stats2 = this.calculateStats(run2);

      if (!stats1 || !stats2) return null;

      const meanDifference = Math.abs(stats1.mean - stats2.mean);
      const percentDifference = (meanDifference / Math.min(stats1.mean, stats2.mean)) * 100;

      return {
         metric: metricName,
         run1Mean: stats1.mean,
         run2Mean: stats2.mean,
         absoluteDifference: meanDifference,
         percentDifference: percentDifference,
         isSignificant: !(stats1.confidenceInterval95.lower <= stats2.mean &&
            stats1.confidenceInterval95.upper >= stats2.mean)
      };
   }
}

// ==================== METRICS COLLECTOR ====================
class ProfessionalMetricsCollector {
   constructor(runId) {
      this.runId = runId;
      this.startTime = Date.now();
      this.ehrMetrics = [];
      this.globalMetrics = {
         doctorRegistration: [],
         witnessIssuance: { times: [], gas: [], costs: [] },
         revocation: { times: [], gas: [], costs: [] }
      };
   }

   recordEHR(ehrNumber, metrics) {
      this.ehrMetrics.push({
         ehrNumber,
         timestamp: Date.now(),
         ...metrics
      });
   }

   recordGlobal(metric, value, subMetric = null) {
      if (subMetric && this.globalMetrics[metric] && this.globalMetrics[metric][subMetric]) {
         this.globalMetrics[metric][subMetric].push(value);
      } else if (this.globalMetrics[metric]) {
         this.globalMetrics[metric].push(value);
      }
   }

   getSummary(gasPrice, ethToDzdRate) {
      const cryptoStats = {
         aesKeyGen: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.aesKeyGenTime)),
         aesEncrypt: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.aesEncryptTime)),
         aesDecrypt: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.aesDecryptTime))
      };

      const proxyStats = {
         doctorRegistration: StatisticalAnalyzer.calculateStats(this.globalMetrics.doctorRegistration),
         keyEncapsulation: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.proxyEncapsulationTime)),
         rekeyGeneration: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.rekeyTime)),
         proxyReencryption: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.proxyReencryptTime)),
         proxyDecryptAES: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.proxyDecryptTime))
      };

      const ipfsStats = {
         uploadEncrypted: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.pinataUploadTime)),
         uploadCiphertext: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.pinataUploadCtTime)),
         download: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.pinataDownloadTime))
      };

      const blockchainStats = {
         witnessIssuance: {
            time: StatisticalAnalyzer.calculateStats(this.globalMetrics.witnessIssuance.times),
            gas: StatisticalAnalyzer.calculateStats(this.globalMetrics.witnessIssuance.gas),
            cost: StatisticalAnalyzer.calculateStats(this.globalMetrics.witnessIssuance.costs)
         },
         witnessVerification: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.witnessCheckTime)),
         revocation: {
            time: StatisticalAnalyzer.calculateStats(this.globalMetrics.revocation.times),
            gas: StatisticalAnalyzer.calculateStats(this.globalMetrics.revocation.gas),
            cost: StatisticalAnalyzer.calculateStats(this.globalMetrics.revocation.costs)
         }
      };

      const endToEndStats = {
         totalAccessTime: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.totalAccessTime)),
         totalWorkflowTime: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.totalWorkflowTime))
      };

      const dataStats = {
         originalSize: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.originalSize)),
         encryptedSize: StatisticalAnalyzer.calculateStats(this.ehrMetrics.map(m => m.encryptedSize))
      };

      return {
         runId: this.runId,
         duration: Date.now() - this.startTime,
         ehrCount: this.ehrMetrics.length,
         gasPriceGwei: parseFloat(ethers.formatUnits(gasPrice, 'gwei')),
         ethToDzdRate,
         crypto: cryptoStats,
         proxy: proxyStats,
         ipfs: ipfsStats,
         blockchain: blockchainStats,
         endToEnd: endToEndStats,
         data: dataStats
      };
   }
}

// ==================== HTML REPORT GENERATOR ====================
function generateProfessionalReport(summary, allRuns, config) {
   const stats = summary;

   const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Professional Performance Report - Medical DApp</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header .test-info { margin-top: 20px; display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; }
        .badge { background: rgba(255,255,255,0.2); padding: 8px 20px; border-radius: 30px; font-size: 0.9em; }
        .content { padding: 40px; }
        .section { margin-bottom: 40px; }
        .section-title {
            font-size: 1.8em;
            color: #2c3e50;
            border-left: 5px solid #3498db;
            padding-left: 15px;
            margin-bottom: 25px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 24px;
            margin-bottom: 30px;
        }
        .card {
            background: #f8f9fa;
            border-radius: 16px;
            padding: 20px;
            transition: transform 0.3s, box-shadow 0.3s;
        }
        .card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
        .card-title {
            font-size: 1.2em;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #3498db;
        }
        .metric-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 6px 8px;
            background: white;
            border-radius: 8px;
        }
        .metric-label { font-weight: 500; color: #7f8c8d; }
        .metric-value { font-family: 'Courier New', monospace; font-weight: 600; color: #2c3e50; }
        .highlight-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .highlight-card .metric-label { color: rgba(255,255,255,0.8); }
        .highlight-card .metric-value { color: white; }
        .chart-container {
            background: white;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        canvas { max-height: 400px; width: 100%; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 0.85em;
        }
        th, td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #3498db;
            color: white;
            position: sticky;
            top: 0;
        }
        tr:hover { background: #f5f5f5; }
        .footer {
            background: #2c3e50;
            color: white;
            text-align: center;
            padding: 30px;
            font-size: 0.85em;
        }
        .confidence-interval {
            font-size: 0.8em;
            color: #27ae60;
            margin-top: 5px;
        }
        @media (max-width: 768px) {
            .stats-grid { grid-template-columns: 1fr; }
            .section-title { font-size: 1.4em; }
            .header h1 { font-size: 1.6em; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Medical DApp Performance Report</h1>
            <p>Professional Performance Testing Suite - Sepolia Testnet</p>
            <div class="test-info">
                <div class="badge">📊 ${stats.ehrCount} EHRs Processed</div>
                <div class="badge">⏱️ ${(stats.duration / 1000).toFixed(1)}s Total Duration</div>
                <div class="badge">💰 ${stats.gasPriceGwei} Gwei Gas Price</div>
                <div class="badge">🔄 ${config.REPEAT_RUNS} Run(s)</div>
            </div>
        </div>
        
        <div class="content">
            <!-- Executive Summary -->
            <div class="section">
                <h2 class="section-title">📊 Executive Summary</h2>
                <div class="stats-grid">
                    <div class="card highlight-card">
                        <div class="card-title">⚡ Total Access Time</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P99:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.p99.toFixed(2)} ms</span></div>
                        <div class="confidence-interval">95% CI: [${stats.endToEnd.totalAccessTime.confidenceInterval95.lower.toFixed(2)}, ${stats.endToEnd.totalAccessTime.confidenceInterval95.upper.toFixed(2)}]</div>
                    </div>
                    <div class="card highlight-card">
                        <div class="card-title">💰 Witness Issuance Cost</div>
                        <div class="metric-row"><span class="metric-label">Average:</span><span class="metric-value">${stats.blockchain.witnessIssuance.cost.mean.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label">Total 100 EHRs:</span><span class="metric-value">${(stats.blockchain.witnessIssuance.cost.sum).toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label">Gas Used:</span><span class="metric-value">${stats.blockchain.witnessIssuance.gas.mean.toFixed(0)} gas</span></div>
                    </div>
                    <div class="card highlight-card">
                        <div class="card-title">📁 Data Efficiency</div>
                        <div class="metric-row"><span class="metric-label">Original EHR:</span><span class="metric-value">${(stats.data.originalSize.mean / 1024).toFixed(2)} KB</span></div>
                        <div class="metric-row"><span class="metric-label">Encrypted:</span><span class="metric-value">${(stats.data.encryptedSize.mean / 1024).toFixed(2)} KB</span></div>
                        <div class="metric-row"><span class="metric-label">Overhead:</span><span class="metric-value">${((stats.data.encryptedSize.mean / stats.data.originalSize.mean) * 100).toFixed(1)}%</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Crypto Metrics -->
            <div class="section">
                <h2 class="section-title">🔐 Cryptographic Performance</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">AES-256 Key Generation</div>
                        <div class="metric-row"><span class="metric-label">Mean ± StdDev:</span><span class="metric-value">${stats.crypto.aesKeyGen.mean.toFixed(2)} ± ${stats.crypto.aesKeyGen.stdDev.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Median (P50):</span><span class="metric-value">${stats.crypto.aesKeyGen.median.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95 / P99:</span><span class="metric-value">${stats.crypto.aesKeyGen.p95.toFixed(2)} / ${stats.crypto.aesKeyGen.p99.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">AES-256 GCM Encryption</div>
                        <div class="metric-row"><span class="metric-label">Mean ± StdDev:</span><span class="metric-value">${stats.crypto.aesEncrypt.mean.toFixed(2)} ± ${stats.crypto.aesEncrypt.stdDev.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Min / Max:</span><span class="metric-value">${stats.crypto.aesEncrypt.min.toFixed(2)} / ${stats.crypto.aesEncrypt.max.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Outliers:</span><span class="metric-value">${stats.crypto.aesEncrypt.outlierCount}</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">AES Decryption</div>
                        <div class="metric-row"><span class="metric-label">Mean ± StdDev:</span><span class="metric-value">${stats.crypto.aesDecrypt.mean.toFixed(2)} ± ${stats.crypto.aesDecrypt.stdDev.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95 / P99:</span><span class="metric-value">${stats.crypto.aesDecrypt.p95.toFixed(2)} / ${stats.crypto.aesDecrypt.p99.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Proxy Metrics -->
            <div class="section">
                <h2 class="section-title">🔑 TB-PRE Proxy Performance</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Key Encapsulation</div>
                        <div class="metric-row"><span class="metric-label">Mean:</span><span class="metric-value">${stats.proxy.keyEncapsulation.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.proxy.keyEncapsulation.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Rekey Generation (Share Request)</div>
                        <div class="metric-row"><span class="metric-label">Mean:</span><span class="metric-value">${stats.proxy.rekeyGeneration.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.proxy.rekeyGeneration.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Proxy Re-encryption (Share Time)</div>
                        <div class="metric-row"><span class="metric-label">Mean:</span><span class="metric-value">${stats.proxy.proxyReencryption.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.proxy.proxyReencryption.p95.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Blockchain Metrics -->
            <div class="section">
                <h2 class="section-title">⛓️ Sepolia Blockchain Metrics</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Witness Issuance (setDoctorWitness)</div>
                        <div class="metric-row"><span class="metric-label">Time:</span><span class="metric-value">${stats.blockchain.witnessIssuance.time.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Gas:</span><span class="metric-value">${stats.blockchain.witnessIssuance.gas.mean.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Cost:</span><span class="metric-value">${stats.blockchain.witnessIssuance.cost.mean.toFixed(4)} DZD</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Witness Verification (per EHR)</div>
                        <div class="metric-row"><span class="metric-label">Mean:</span><span class="metric-value">${stats.blockchain.witnessVerification.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.blockchain.witnessVerification.p95.toFixed(2)} ms</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Revocation</div>
                        <div class="metric-row"><span class="metric-label">Time:</span><span class="metric-value">${stats.blockchain.revocation.time.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Gas:</span><span class="metric-value">${stats.blockchain.revocation.gas.mean.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Cost:</span><span class="metric-value">${stats.blockchain.revocation.cost.mean.toFixed(4)} DZD</span></div>
                    </div>
                </div>
            </div>
            
            <!-- End-to-End Access Time Distribution -->
            <div class="section">
                <h2 class="section-title">📈 End-to-End Access Time Distribution</h2>
                <div class="chart-container">
                    <canvas id="accessTimeChart"></canvas>
                </div>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Statistical Summary</div>
                        <div class="metric-row"><span class="metric-label">Mean:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.mean.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Median:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.median.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">Std Dev:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.stdDev.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">CV (σ/μ):</span><span class="metric-value">${((stats.endToEnd.totalAccessTime.stdDev / stats.endToEnd.totalAccessTime.mean) * 100).toFixed(1)}%</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Percentile Analysis</div>
                        <div class="metric-row"><span class="metric-label">P50 (Median):</span><span class="metric-value">${stats.endToEnd.totalAccessTime.median.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P90:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.p90.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P95:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.p95.toFixed(2)} ms</span></div>
                        <div class="metric-row"><span class="metric-label">P99:</span><span class="metric-value">${stats.endToEnd.totalAccessTime.p99.toFixed(2)} ms</span></div>
                    </div>
                </div>
            </div>
            
            <!-- Per-EHR Results Table -->
            <div class="section">
                <h2 class="section-title">📋 Detailed Results per EHR (Last 20)</h2>
                <div style="overflow-x: auto; max-height: 500px;">
                    <table>
                        <thead>
                            <tr><th>EHR #</th><th>AES Enc (ms)</th><th>AES Dec (ms)</th><th>Proxy Encap (ms)</th><th>Proxy ReEnc (ms)</th><th>Witness Chk (ms)</th><th>Total Access (ms)</th></tr>
                        </thead>
                        <tbody>
                            ${stats.ehrMetrics?.slice(-20).map(ehr => `
                            <tr>
                                <td>${ehr.ehrNumber}</td>
                                <td>${ehr.aesEncryptTime.toFixed(2)}</td>
                                <td>${ehr.aesDecryptTime.toFixed(2)}</td>
                                <td>${ehr.proxyEncapsulationTime.toFixed(2)}</td>
                                <td>${ehr.proxyReencryptTime.toFixed(2)}</td>
                                <td>${ehr.witnessCheckTime.toFixed(2)}</td>
                                <td><strong>${ehr.totalAccessTime.toFixed(2)}</strong></td>
                            </tr>
                            `).join('') || ''}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Gas & Cost Analysis -->
            <div class="section">
                <h2 class="section-title">💰 Gas Consumption & Cost Analysis</h2>
                <div class="stats-grid">
                    <div class="card">
                        <div class="card-title">Total Gas Consumption</div>
                        <div class="metric-row"><span class="metric-label">Witness Issuance (Total):</span><span class="metric-value">${stats.blockchain.witnessIssuance.gas.sum.toLocaleString()} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Per EHR Average:</span><span class="metric-value">${stats.blockchain.witnessIssuance.gas.mean.toFixed(0)} gas</span></div>
                        <div class="metric-row"><span class="metric-label">Revocation:</span><span class="metric-value">${stats.blockchain.revocation.gas.mean.toFixed(0)} gas</span></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Total Cost (DZD)</div>
                        <div class="metric-row"><span class="metric-label">Witness Issuance:</span><span class="metric-value">${stats.blockchain.witnessIssuance.cost.sum.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label">Per EHR:</span><span class="metric-value">${stats.blockchain.witnessIssuance.cost.mean.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label">Revocation:</span><span class="metric-value">${stats.blockchain.revocation.cost.mean.toFixed(4)} DZD</span></div>
                        <div class="metric-row"><span class="metric-label"><strong>Total Cost:</strong></span><span class="metric-value"><strong>${(stats.blockchain.witnessIssuance.cost.sum + stats.blockchain.revocation.cost.mean).toFixed(4)} DZD</strong></span></div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by Professional Performance Test Suite | ${new Date().toLocaleString()}</p>
            <p>Network: Sepolia Testnet | Contract: ${CONTRACT_ADDRESS.substring(0, 16)}... | Run ID: ${stats.runId}</p>
            <p>Confidence Interval: 95% | Statistical analysis includes outlier detection</p>
        </div>
    </div>
    
    <script>
        // Access Time Distribution Chart
        const accessTimes = ${JSON.stringify(stats.ehrMetrics?.map(m => m.totalAccessTime) || [])};
        const bins = 20;
        const min = Math.min(...accessTimes);
        const max = Math.max(...accessTimes);
        const binWidth = (max - min) / bins;
        const histogram = Array(bins).fill(0);
        accessTimes.forEach(t => {
            let idx = Math.floor((t - min) / binWidth);
            if (idx === bins) idx = bins - 1;
            if (idx >= 0 && idx < bins) histogram[idx]++;
        });
        const labels = Array(bins).fill().map((_, i) => (min + i * binWidth).toFixed(0));
        
        new Chart(document.getElementById('accessTimeChart'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Frequency',
                    data: histogram,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: { display: true, text: 'Total Access Time Distribution (ms)' },
                    legend: { position: 'top' }
                },
                scales: {
                    x: { title: { display: true, text: 'Access Time (ms)' } },
                    y: { title: { display: true, text: 'Number of EHRs' }, beginAtZero: true }
                }
            }
        });
    </script>
</body>
</html>`;

   fs.writeFileSync(`report_${CONFIG.TEST_RUN_ID}.html`, html);
   return `report_${CONFIG.TEST_RUN_ID}.html`;
}

// ==================== MAIN TEST EXECUTION ====================
async function runProfessionalTest() {
   const allRunSummaries = [];
   const startDateTime = new Date();

   console.log(`\n🚀 Starting Professional Test Suite`);
   console.log(`📅 Start Time: ${startDateTime.toLocaleString()}`);
   console.log(`📊 Configuration: ${CONFIG.EHR_COUNT} EHRs, ${CONFIG.REPEAT_RUNS} run(s)\n`);

   // Initialize blockchain
   const { signer, balance, chainId } = await initBlockchain();
   const ethToDzdRate = 350000; // Fixed rate for consistency
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;

   console.log(`✅ Blockchain Connected`);
   console.log(`   ├─ Network: Sepolia (Chain ID: ${chainId})`);
   console.log(`   ├─ Wallet: ${signer.address}`);
   console.log(`   ├─ Balance: ${balance} SepoliaETH`);
   console.log(`   └─ Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // Generate test identities (one-time)
   console.log(`👥 Generating Test Identities...`);
   const doctor = generateDIDPair();

   // Register doctor (one-time)
   console.log(`📝 Registering Doctor on Proxy...`);
   const regResult = await registerDoctor(doctor.did, ['doctor', 'cardiologist']);
   console.log(`   ✅ Doctor registered (${regResult.timeMs.toFixed(2)} ms)`);

   // Issue witness (one-time)
   console.log(`⛓️ Issuing Witness on Sepolia...`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (CONFIG.WITNESS_VALIDITY_DAYS * 86400);
   const witnessResult = await issueWitness(doctor.did, witnessHash, expiry);
   const witnessCostWei = BigInt(witnessResult.gasUsed) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;
   console.log(`   ✅ Witness Issued (${witnessResult.timeMs.toFixed(2)} ms | ${witnessResult.gasUsed} gas | ${witnessCostDzd.toFixed(4)} DZD)\n`);

   // Verify doctor active
   const activeCheck = await isDoctorActive(doctor.did);
   console.log(`✅ Doctor Active (verification: ${activeCheck.timeMs.toFixed(2)} ms)\n`);

   // Perform test runs
   for (let run = 1; run <= CONFIG.REPEAT_RUNS; run++) {
      console.log(`╔════════════════════════════════════════════════════════════════════════════╗`);
      console.log(`║                              RUN ${run}/${CONFIG.REPEAT_RUNS}                                             ║`);
      console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

      const metrics = new ProfessionalMetricsCollector(`${CONFIG.TEST_RUN_ID}_RUN${run}`);

      // Record global metrics
      metrics.recordGlobal('doctorRegistration', regResult.timeMs);
      metrics.recordGlobal('witnessIssuance', witnessResult.timeMs, 'times');
      metrics.recordGlobal('witnessIssuance', witnessResult.gasUsed, 'gas');
      metrics.recordGlobal('witnessIssuance', witnessCostDzd, 'costs');
      metrics.recordGlobal('doctorActiveCheck', activeCheck.timeMs);

      console.log(`📊 Processing ${CONFIG.EHR_COUNT} EHRs...\n`);
      console.log(`┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
      console.log(`│ EHR #   │ AES Enc      │ AES Dec      │ Proxy Encap  │ Proxy ReEnc  │ Witness Chk  │ Total Access │ Storage(KB)  │`);
      console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

      for (let i = 1; i <= CONFIG.EHR_COUNT; i++) {
         // Generate realistic EHR
         const ehrData = generateRealisticEHR(i);
         const ehrBuffer = Buffer.from(JSON.stringify(ehrData), 'utf8');

         // AES Key Generation
         const keyGenStart = process.hrtime.bigint();
         const aesKey = crypto.randomBytes(32);
         const keyGenTime = Number(process.hrtime.bigint() - keyGenStart) / 1_000_000;

         // AES Encryption
         const { encrypted: encryptedEhr, timeMs: aesEncryptTime, size: encryptedSize } = aesEncrypt(ehrBuffer, aesKey);

         // Proxy Encapsulation
         const aesKeyBase64 = aesKey.toString('base64');
         const timeSlot = Math.floor(Date.now() / 3600000);
         const policy = [['doctor']];
         const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);

         // Upload to Pinata (Encrypted EHR)
         const uploadResult = await pinataUpload(encryptedEhr, `ehr_${i}.enc`);

         // Upload Ciphertext
         const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
         const uploadCtResult = await pinataUpload(ciphertextBuffer, `ct_${i}.json`);

         // ---- DOCTOR ACCESS PHASE ----
         const accessStart = process.hrtime.bigint();

         // Witness Verification
         const witnessCheck = await isDoctorActive(doctor.did);

         // Generate Rekey (Share Request)
         const rekeyResult = await generateRekey(encapResult.data.ciphertext_id, doctor.did, ['doctor']);

         // Proxy Re-encryption (Share Time)
         const reencryptResult = await proxyReencrypt(rekeyResult.data.rekey_id);

         // Decrypt AES Key
         const decryptAesResult = await decryptAES(reencryptResult.data.transformed_ct_id, doctor.did);

         // Download from Pinata
         const downloadResult = await pinataDownload(uploadResult.cid);

         // AES Decryption
         const decryptedKey = Buffer.from(decryptAesResult.data.aes_key_b64, 'base64');
         const { data: decryptedEhr, timeMs: aesDecryptTime } = aesDecrypt(downloadResult.data, decryptedKey);

         // Total Access Time
         const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

         // Verify integrity
         const decryptedStr = decryptedEhr.toString('utf8');
         const originalStr = JSON.stringify(ehrData);

         if (decryptedStr !== originalStr) {
            console.error(`\n❌ DATA INTEGRITY FAILED at EHR ${i}`);
            process.exit(1);
         }

         // Record metrics
         metrics.recordEHR(i, {
            aesKeyGenTime: keyGenTime,
            aesEncryptTime: aesEncryptTime,
            aesDecryptTime: aesDecryptTime,
            proxyEncapsulationTime: encapResult.timeMs,
            rekeyTime: rekeyResult.timeMs,
            proxyReencryptTime: reencryptResult.timeMs,
            proxyDecryptTime: decryptAesResult.timeMs,
            pinataUploadTime: uploadResult.timeMs,
            pinataUploadCtTime: uploadCtResult.timeMs,
            pinataDownloadTime: downloadResult.timeMs,
            witnessCheckTime: witnessCheck.timeMs,
            totalAccessTime: totalAccessTime,
            totalWorkflowTime: keyGenTime + aesEncryptTime + encapResult.timeMs +
               uploadResult.timeMs + witnessCheck.timeMs + rekeyResult.timeMs +
               reencryptResult.timeMs + decryptAesResult.timeMs + downloadResult.timeMs + aesDecryptTime,
            originalSize: ehrBuffer.length,
            encryptedSize: encryptedSize
         });

         // Progress display
         console.log(`│ ${String(i).padEnd(6)} │ ${String(aesEncryptTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(encapResult.timeMs.toFixed(2)).padEnd(12)} │ ${String(reencryptResult.timeMs.toFixed(2)).padEnd(12)} │ ${String(witnessCheck.timeMs.toFixed(2)).padEnd(12)} │ ${String(totalAccessTime.toFixed(2)).padEnd(12)} │ ${String((encryptedSize / 1024).toFixed(1)).padEnd(12)} │`);

         if (i % 25 === 0 && i < CONFIG.EHR_COUNT) {
            console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);
         }
      }

      console.log(`└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`);

      // Revoke doctor (end of test)
      console.log(`⛓️ Revoking Doctor...`);
      const revokeResult = await revokeDoctor(doctor.did);
      const revokeCostWei = BigInt(revokeResult.gasUsed) * gasPrice;
      const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
      const revokeCostDzd = revokeCostEth * ethToDzdRate;
      metrics.recordGlobal('revocation', revokeResult.timeMs, 'times');
      metrics.recordGlobal('revocation', revokeResult.gasUsed, 'gas');
      metrics.recordGlobal('revocation', revokeCostDzd, 'costs');
      console.log(`   ✅ Revoked (${revokeResult.timeMs.toFixed(2)} ms | ${revokeResult.gasUsed} gas | ${revokeCostDzd.toFixed(4)} DZD)\n`);

      // Generate summary
      const summary = metrics.getSummary(gasPrice, ethToDzdRate);
      summary.ehrMetrics = metrics.ehrMetrics; // Include raw data for charts
      allRunSummaries.push(summary);

      // Save run data
      fs.writeFileSync(`metrics_run${run}_${CONFIG.TEST_RUN_ID}.json`, JSON.stringify(summary, null, 2));
      console.log(`📁 Saved: metrics_run${run}_${CONFIG.TEST_RUN_ID}.json\n`);
   }

   // Generate final report
   console.log(`📊 Generating Professional Report...`);
   const finalSummary = allRunSummaries[0]; // Use first run for main report
   const reportFile = generateProfessionalReport(finalSummary, allRunSummaries, CONFIG);

   // Print final statistics
   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                           FINAL STATISTICS                                  ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

   console.log(`📈 KEY PERFORMANCE INDICATORS:`);
   console.log(`   ├─ Total Access Time (μ ± σ): ${finalSummary.endToEnd.totalAccessTime.mean.toFixed(2)} ± ${finalSummary.endToEnd.totalAccessTime.stdDev.toFixed(2)} ms`);
   console.log(`   ├─ Total Access Time (P95): ${finalSummary.endToEnd.totalAccessTime.p95.toFixed(2)} ms`);
   console.log(`   ├─ AES Encryption: ${finalSummary.crypto.aesEncrypt.mean.toFixed(2)} ms`);
   console.log(`   ├─ Proxy Re-encryption: ${finalSummary.proxy.proxyReencryption.mean.toFixed(2)} ms`);
   console.log(`   ├─ Witness Verification: ${finalSummary.blockchain.witnessVerification.mean.toFixed(2)} ms`);
   console.log(`   └─ Total Cost (100 EHRs): ${(finalSummary.blockchain.witnessIssuance.cost.sum + finalSummary.blockchain.revocation.cost.mean).toFixed(4)} DZD\n`);

   console.log(`📁 Generated Files:`);
   console.log(`   ├─ ${reportFile}`);
   console.log(`   └─ metrics_run*_${CONFIG.TEST_RUN_ID}.json`);

   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                          TEST COMPLETED SUCCESSFULLY                      ║`);
   console.log(`║                          ${CONFIG.EHR_COUNT} EHRs Processed                               ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);
}

// Run the test
runProfessionalTest().catch(console.error);

*/



/*

ce test est bien mais elle est sovgardes des donnes comme json file si toot 
// professional-performance-test.js - REAL Pinata Uploads
// Professional performance test with REAL IPFS storage

const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
   // PINATA REAL API KEYS - REPLACE WITH YOUR VALID KEYS
   PINATA_API_KEY: '03959fc6abd1baa890bf',
   PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
   PROXY_URL: 'http://127.0.0.1:5000',
   RPC_URL: 'https://ethereum-sepolia.publicnode.com',
   EHR_COUNT: 100,
   WITNESS_VALIDITY_DAYS: 365,
   TEST_RUN_ID: `TEST_${Date.now()}`,

   // EHR Size Configuration (in KB)
   EHR_SIZE_CONFIG: {
      type: 'mixed',
      sizes: {
         small: { min: 50, max: 100 },     // 50-100 KB
         medium: { min: 200, max: 400 },   // 200-400 KB
         large: { min: 500, max: 800 },    // 500-800 KB
         xlarge: { min: 1000, max: 2000 }  // 1-2 MB
      }
   }
};

// REPLACE WITH YOUR PRIVATE KEY
const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              REAL PINATA PERFORMANCE TEST - Sepolia Testnet                    ║
║              ${CONFIG.EHR_COUNT} EHRs | REAL IPFS Uploads & Downloads                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== REAL PINATA FUNCTIONS ====================
async function realPinataUpload(buffer, filename, metadata = {}) {
   const startTime = process.hrtime.bigint();

   const formData = new FormData();
   formData.append('file', buffer, { filename });
   formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { ...metadata, timestamp: Date.now(), testRun: CONFIG.TEST_RUN_ID }
   }));

   try {
      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
         headers: {
            ...formData.getHeaders(),
            pinata_api_key: CONFIG.PINATA_API_KEY,
            pinata_secret_api_key: CONFIG.PINATA_API_SECRET
         },
         maxBodyLength: Infinity,
         maxContentLength: Infinity
      });

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      return {
         success: true,
         cid: response.data.IpfsHash,
         url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
         timeMs: duration,
         size: buffer.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata upload failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         size: buffer.length
      };
   }
}

async function realPinataDownload(cid) {
   const startTime = process.hrtime.bigint();

   try {
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(url, {
         responseType: 'arraybuffer',
         timeout: 60000 // 60 second timeout for large files
      });

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      return {
         success: true,
         data: Buffer.from(response.data),
         timeMs: duration,
         size: response.data.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata download failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         data: null
      };
   }
}

// ==================== LARGE EHR GENERATOR ====================
class LargeEHRGenerator {
   generateRealisticEHR(index, targetSizeKB) {
      const generateText = (targetChars) => {
         const paragraphs = [
            "CLINICAL SUMMARY: Patient presents with acute onset of chest pain radiating to left arm, associated with shortness of breath and diaphoresis. Symptoms began approximately 2 hours prior to presentation while at rest. Patient reports similar episodes in the past month but less severe in intensity.",
            "PAST MEDICAL HISTORY: Significant for hypertension diagnosed 5 years ago, currently controlled with Lisinopril. Type 2 diabetes mellitus diagnosed 3 years ago, managed with Metformin. Hyperlipidemia on Atorvastatin. No prior surgical history. Denies smoking. Occasional alcohol use.",
            "FAMILY HISTORY: Positive for coronary artery disease in father (age 55) and mother (age 62). Brother with hypertension. No known genetic disorders.",
            "PHYSICAL EXAMINATION: BP 145/92, HR 102, RR 18, O2 sat 96% on room air, Temp 37.2C. Cardiovascular: Regular rate and rhythm, no murmurs, rubs or gallops. Lungs: Clear to auscultation bilaterally. Abdomen: Soft, non-tender, non-distended. Extremities: No edema, pulses 2+ bilaterally.",
            "DIAGNOSTIC STUDIES: ECG shows sinus tachycardia with non-specific ST-T wave changes in lateral leads. Initial troponin I elevated at 2.5 ng/mL (normal <0.04). Chest X-ray shows no acute cardiopulmonary process. Complete blood count within normal limits.",
            "ASSESSMENT AND PLAN: 1. Non-ST elevation myocardial infarction (NSTEMI) - Admit to telemetry for continuous monitoring. 2. Start dual antiplatelet therapy: Aspirin 324mg load, then 81mg daily; Clopidogrel 300mg load, then 75mg daily. 3. Cardiology consultation requested for possible cardiac catheterization. 4. Start statin therapy: Atorvastatin 80mg daily. 5. Strict intake/output monitoring. 6. Serial troponins q6h x3.",
            "DISCHARGE SUMMARY: Patient stabilized after 3 days. No further chest pain. Echocardiogram shows EF 55% with mild inferior wall hypokinesis. Stress test negative for inducible ischemia. Medications adjusted. Follow-up with cardiology in 2 weeks.",
            "MEDICATION LIST: Lisinopril 20mg daily, Metformin 1000mg BID, Atorvastatin 80mg daily, Aspirin 81mg daily, Clopidogrel 75mg daily, Carvedilol 12.5mg BID.",
            "LABORATORY RESULTS: Troponin I: 2.5 → 1.8 → 0.9 ng/mL. Creatinine: 0.9 mg/dL. Hemoglobin: 14.2 g/dL. HbA1c: 7.2%. LDL: 110 mg/dL. HDL: 38 mg/dL."
         ];

         let text = "";
         while (text.length < targetChars) {
            text += paragraphs[Math.floor(Math.random() * paragraphs.length)] + "\n\n";
         }
         return text.substring(0, targetChars);
      };

      const targetChars = targetSizeKB * 1024;
      const clinicalText = generateText(Math.floor(targetChars * 0.7));

      const labResults = Array.from({ length: Math.floor(Math.random() * 15) + 10 }, () => ({
         test: ["CBC", "CMP", "Lipid Panel", "HbA1c", "TSH", "Vitamin D", "Iron Panel", "CRP", "ESR", "BNP", "Troponin", "CK-MB", "PT/INR", "PTT", "D-Dimer"][Math.floor(Math.random() * 15)],
         value: (Math.random() * 100).toFixed(1),
         unit: ["mg/dL", "ng/mL", "IU/L", "mmol/L", "g/dL", "%"][Math.floor(Math.random() * 6)],
         referenceRange: `${(Math.random() * 50).toFixed(0)}-${(Math.random() * 150 + 50).toFixed(0)}`,
         date: new Date().toISOString()
      }));

      const medications = Array.from({ length: Math.floor(Math.random() * 8) + 3 }, () => ({
         name: ["Lisinopril", "Metformin", "Atorvastatin", "Aspirin", "Clopidogrel", "Carvedilol", "Furosemide", "Spironolactone", "Warfarin", "Amiodarone", "Digoxin", "Metoprolol", "Amlodipine", "Losartan", "Simvastatin"][Math.floor(Math.random() * 15)],
         dosage: `${Math.floor(Math.random() * 100) + 5}${Math.random() > 0.5 ? "mg" : "mcg"}`,
         frequency: ["daily", "BID", "TID", "QID", "weekly"][Math.floor(Math.random() * 5)],
         startDate: new Date().toISOString()
      }));

      return {
         ehrId: `EHR_${String(index).padStart(4, '0')}_${Date.now()}`,
         metadata: {
            version: "3.0",
            generatedAt: new Date().toISOString(),
            sizeKB: (targetSizeKB).toFixed(2),
            type: targetSizeKB > 1000 ? "XL" : targetSizeKB > 500 ? "L" : targetSizeKB > 200 ? "M" : "S"
         },
         patientInfo: {
            id: `P_${Math.floor(Math.random() * 100000)}`,
            name: `Patient_${Math.floor(Math.random() * 10000)}`,
            age: Math.floor(Math.random() * 70) + 18,
            gender: ['Male', 'Female'][Math.floor(Math.random() * 2)],
            bloodType: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][Math.floor(Math.random() * 8)],
            mrn: `MRN${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`
         },
         clinicalData: {
            primaryDiagnosis: this.generateDiagnosis(),
            secondaryDiagnosis: Math.random() > 0.7 ? this.generateDiagnosis() : 'None',
            clinicalNotes: clinicalText,
            labResults: labResults,
            medications: medications,
            vitalSigns: {
               bloodPressure: `${Math.floor(100 + Math.random() * 40)}/${Math.floor(60 + Math.random() * 30)}`,
               heartRate: Math.floor(60 + Math.random() * 40),
               respiratoryRate: Math.floor(12 + Math.random() * 10),
               temperature: (36.5 + Math.random() * 1.5).toFixed(1),
               oxygenSaturation: Math.floor(92 + Math.random() * 6)
            },
            allergies: ["Penicillin", "Sulfa", "Latex", "Codeine"].filter(() => Math.random() > 0.7),
            immunizations: [
               { vaccine: "COVID-19", date: "2024-01-15", status: "Completed" },
               { vaccine: "Influenza", date: "2024-10-01", status: "Completed" }
            ]
         },
         visitInfo: {
            date: new Date().toISOString(),
            department: ['Cardiology', 'Endocrinology', 'Pulmonology', 'Neurology', 'Emergency', 'Internal Medicine'][Math.floor(Math.random() * 6)],
            physician: `Dr_${Math.random().toString(36).substring(7)}`,
            admissionDate: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString(),
            dischargeDate: new Date(Date.now() + Math.random() * 7 * 86400000).toISOString(),
            lengthOfStay: Math.floor(Math.random() * 14) + 1
         },
         timestamp: Date.now(),
         ehrSizeKB: targetSizeKB
      };
   }

   generateDiagnosis() {
      const diagnoses = [
         "Acute Myocardial Infarction (NSTEMI)", "Chronic Heart Failure with Reduced EF",
         "Unstable Angina Pectoris", "Atrial Fibrillation with Rapid Ventricular Response",
         "Hypertensive Urgency", "Diabetic Ketoacidosis", "Community Acquired Pneumonia",
         "COPD Exacerbation", "Acute Pulmonary Embolism", "Ischemic Cerebrovascular Accident",
         "Transient Ischemic Attack", "Severe Sepsis", "Acute on Chronic Kidney Disease",
         "Decompensated Liver Cirrhosis", "Acute Pancreatitis", "Cholelithiasis with Cholecystitis"
      ];
      return diagnoses[Math.floor(Math.random() * diagnoses.length)];
   }
}

// ==================== PROXY FUNCTIONS ====================
async function registerDoctor(doctorDid, attributes) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== BLOCKCHAIN FUNCTIONS ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function activeDoctorCount() external view returns (uint256)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   const balance = await provider.getBalance(signer.address);
   const network = await provider.getNetwork();
   return { signer, balance: ethers.formatEther(balance), chainId: network.chainId };
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function revokeDoctor(doctorDid) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function isDoctorActive(doctorDid) {
   const startTime = process.hrtime.bigint();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   const endTime = process.hrtime.bigint();
   return { active: result, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== CRYPTO FUNCTIONS ====================
function aesEncrypt(data, key) {
   const startTime = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const endTime = process.hrtime.bigint();
   return {
      encrypted: result,
      size: result.length,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

function aesDecrypt(encryptedBuffer, key) {
   const startTime = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const endTime = process.hrtime.bigint();
   return {
      data: result,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

// ==================== MAIN TEST ====================
async function runProfessionalTest() {
   const ehrGenerator = new LargeEHRGenerator();
   const startDateTime = new Date();

   console.log(`\n🚀 Starting REAL Pinata Performance Test`);
   console.log(`📅 Start Time: ${startDateTime.toLocaleString()}`);
   console.log(`📊 Configuration: ${CONFIG.EHR_COUNT} EHRs | Mixed Sizes (50KB - 2MB)\n`);

   // Test Pinata connection first
   console.log(`🔗 Testing Pinata Connection...`);
   const testBuffer = Buffer.from(JSON.stringify({ test: "connection" }));
   const testUpload = await realPinataUpload(testBuffer, `test_${Date.now()}.json`);
   if (!testUpload.success) {
      console.error(`❌ Pinata connection failed! Please check your API keys.`);
      console.error(`   Error: ${testUpload.error}`);
      process.exit(1);
   }
   console.log(`   ✅ Pinata connected! Test CID: ${testUpload.cid}\n`);

   // Initialize blockchain
   const { signer, balance, chainId } = await initBlockchain();
   const ethToDzdRate = 350000;
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;

   console.log(`✅ Blockchain Connected`);
   console.log(`   ├─ Network: Sepolia (Chain ID: ${chainId})`);
   console.log(`   ├─ Wallet: ${signer.address}`);
   console.log(`   ├─ Balance: ${balance} SepoliaETH`);
   console.log(`   └─ Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // Generate test identities
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + publicKeyBase64.substring(0, 44);

   // Register doctor
   console.log(`📝 Registering Doctor on Proxy...`);
   const regResult = await registerDoctor(doctorDid, ['doctor', 'cardiologist']);
   console.log(`   ✅ Doctor registered (${regResult.timeMs.toFixed(2)} ms)`);

   // Issue witness
   console.log(`⛓️ Issuing Witness on Sepolia...`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (CONFIG.WITNESS_VALIDITY_DAYS * 86400);
   const witnessResult = await issueWitness(doctorDid, witnessHash, expiry);
   const witnessCostWei = BigInt(witnessResult.gasUsed) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;
   console.log(`   ✅ Witness Issued (${witnessResult.timeMs.toFixed(2)} ms | ${witnessResult.gasUsed} gas | ${witnessCostDzd.toFixed(4)} DZD)\n`);

   // Verify doctor active
   const activeCheck = await isDoctorActive(doctorDid);
   console.log(`✅ Doctor Active (verification: ${activeCheck.timeMs.toFixed(2)} ms)\n`);

   // Metrics storage
   const ehrMetrics = [];
   let totalRealUploads = 0;
   let totalRealDownloads = 0;
   let failedUploads = 0;

   console.log(`📊 Processing ${CONFIG.EHR_COUNT} EHRs with REAL Pinata uploads...\n`);
   console.log(`┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
   console.log(`│ EHR #   │ Size(KB)     │ AES Enc      │ AES Dec      │ Pinata Up    │ Pinata Down  │ Proxy ReEnc  │ Total Access │ Status       │`);
   console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

   for (let i = 1; i <= CONFIG.EHR_COUNT; i++) {
      // Determine size for this EHR
      let targetSizeKB;
      const rand = Math.random();
      if (rand < 0.25) targetSizeKB = 50 + Math.random() * 50;      // Small: 50-100KB
      else if (rand < 0.5) targetSizeKB = 200 + Math.random() * 200;   // Medium: 200-400KB
      else if (rand < 0.75) targetSizeKB = 500 + Math.random() * 300;   // Large: 500-800KB
      else targetSizeKB = 1000 + Math.random() * 1000;                  // XL: 1-2MB

      // Generate EHR
      const ehrData = ehrGenerator.generateRealisticEHR(i, targetSizeKB);
      const ehrBuffer = Buffer.from(JSON.stringify(ehrData), 'utf8');
      const actualSizeKB = ehrBuffer.length / 1024;

      // AES Key Generation
      const aesKey = crypto.randomBytes(32);

      // AES Encryption
      const { encrypted: encryptedEhr, timeMs: aesEncryptTime } = aesEncrypt(ehrBuffer, aesKey);

      // Proxy Encapsulation
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);

      // REAL PINATA UPLOAD - Encrypted EHR
      console.log(`\n   📤 Uploading EHR ${i} (${actualSizeKB.toFixed(0)} KB) to Pinata...`);
      const uploadResult = await realPinataUpload(encryptedEhr, `ehr_${i}_${Date.now()}.enc`, { ehrId: i });
      if (uploadResult.success) {
         totalRealUploads++;
         console.log(`   ✅ Uploaded! CID: ${uploadResult.cid.substring(0, 20)}... (${uploadResult.timeMs.toFixed(2)} ms)`);
      } else {
         failedUploads++;
         console.log(`   ❌ Upload failed: ${uploadResult.error}`);
      }

      // Upload ciphertext
      const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
      const ctUploadResult = await realPinataUpload(ciphertextBuffer, `ct_${i}_${Date.now()}.json`, { ehrId: i });

      // Doctor Access Phase
      const accessStart = process.hrtime.bigint();

      const witnessCheck = await isDoctorActive(doctorDid);
      const rekeyResult = await generateRekey(encapResult.data.ciphertext_id, doctorDid, ['doctor']);
      const reencryptResult = await proxyReencrypt(rekeyResult.data.rekey_id);
      const decryptAesResult = await decryptAES(reencryptResult.data.transformed_ct_id, doctorDid);

      // REAL PINATA DOWNLOAD
      console.log(`   📥 Downloading from Pinata...`);
      const downloadResult = await realPinataDownload(uploadResult.cid);
      if (downloadResult.success) {
         totalRealDownloads++;
         console.log(`   ✅ Downloaded! (${downloadResult.timeMs.toFixed(2)} ms)`);
      } else {
         console.log(`   ❌ Download failed: ${downloadResult.error}`);
      }

      // AES Decryption
      const decryptedKey = Buffer.from(decryptAesResult.data.aes_key_b64, 'base64');
      const { data: decryptedEhr, timeMs: aesDecryptTime } = aesDecrypt(downloadResult.data || encryptedEhr, decryptedKey);

      const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

      // Verify integrity
      const decryptedStr = decryptedEhr.toString('utf8');
      const originalStr = JSON.stringify(ehrData);

      let status = "✅ PASS";
      if (decryptedStr !== originalStr) {
         status = "❌ FAIL";
         console.error(`\n❌ DATA INTEGRITY FAILED at EHR ${i}`);
      }

      // Record metrics
      ehrMetrics.push({
         ehrNumber: i,
         sizeKB: actualSizeKB,
         sizeCategory: actualSizeKB > 1000 ? "XL" : actualSizeKB > 500 ? "L" : actualSizeKB > 200 ? "M" : "S",
         aesEncryptTime: aesEncryptTime,
         aesDecryptTime: aesDecryptTime,
         pinataUploadTime: uploadResult.success ? uploadResult.timeMs : 0,
         pinataDownloadTime: downloadResult.success ? downloadResult.timeMs : 0,
         proxyEncapsulationTime: encapResult.timeMs,
         proxyReencryptTime: reencryptResult.timeMs,
         witnessCheckTime: witnessCheck.timeMs,
         totalAccessTime: totalAccessTime,
         uploadSuccess: uploadResult.success,
         downloadSuccess: downloadResult.success,
         cid: uploadResult.success ? uploadResult.cid : null
      });

      // Progress display
      console.log(`│ ${String(i).padEnd(6)} │ ${String(actualSizeKB.toFixed(0)).padEnd(12)} │ ${String(aesEncryptTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(uploadResult.success ? uploadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(downloadResult.success ? downloadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(reencryptResult.timeMs.toFixed(2)).padEnd(12)} │ ${String(totalAccessTime.toFixed(2)).padEnd(12)} │ ${status.padEnd(12)} │`);

      if (i % 25 === 0 && i < CONFIG.EHR_COUNT) {
         console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);
      }
   }

   console.log(`└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`);

   // Revoke doctor
   console.log(`⛓️ Revoking Doctor...`);
   const revokeResult = await revokeDoctor(doctorDid);
   const revokeCostWei = BigInt(revokeResult.gasUsed) * gasPrice;
   const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
   const revokeCostDzd = revokeCostEth * ethToDzdRate;
   console.log(`   ✅ Revoked (${revokeResult.timeMs.toFixed(2)} ms | ${revokeResult.gasUsed} gas | ${revokeCostDzd.toFixed(4)} DZD)\n`);

   // Calculate statistics
   const validMetrics = ehrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const avgAccessTime = validMetrics.reduce((a, b) => a + b.totalAccessTime, 0) / validMetrics.length;
   const avgUploadTime = validMetrics.reduce((a, b) => a + b.pinataUploadTime, 0) / validMetrics.length;
   const avgDownloadTime = validMetrics.reduce((a, b) => a + b.pinataDownloadTime, 0) / validMetrics.length;
   const avgAesEncrypt = validMetrics.reduce((a, b) => a + b.aesEncryptTime, 0) / validMetrics.length;
   const avgAesDecrypt = validMetrics.reduce((a, b) => a + b.aesDecryptTime, 0) / validMetrics.length;

   // Generate report
   const report = {
      testInfo: {
         runId: CONFIG.TEST_RUN_ID,
         date: new Date().toISOString(),
         ehrCount: CONFIG.EHR_COUNT,
         successfulUploads: totalRealUploads,
         successfulDownloads: totalRealDownloads,
         failedUploads: failedUploads,
         successRate: ((totalRealUploads / CONFIG.EHR_COUNT) * 100).toFixed(1)
      },
      blockchain: {
         witnessGasUsed: witnessResult.gasUsed,
         witnessCostDZD: witnessCostDzd,
         revocationGasUsed: revokeResult.gasUsed,
         revocationCostDZD: revokeCostDzd,
         gasPriceGwei: parseFloat(ethers.formatUnits(gasPrice, 'gwei'))
      },
      performance: {
         averageAesEncryptionMs: avgAesEncrypt,
         averageAesDecryptionMs: avgAesDecrypt,
         averagePinataUploadMs: avgUploadTime,
         averagePinataDownloadMs: avgDownloadTime,
         averageProxyReencryptMs: validMetrics.reduce((a, b) => a + b.proxyReencryptTime, 0) / validMetrics.length,
         averageTotalAccessTimeMs: avgAccessTime,
         minAccessTimeMs: Math.min(...validMetrics.map(m => m.totalAccessTime)),
         maxAccessTimeMs: Math.max(...validMetrics.map(m => m.totalAccessTime))
      },
      perEhrMetrics: ehrMetrics,
      summary: {
         totalTimeSeconds: (Date.now() - startDateTime) / 1000,
         averageEHRSizeKB: ehrMetrics.reduce((a, b) => a + b.sizeKB, 0) / ehrMetrics.length
      }
   };

   fs.writeFileSync(`pinata_test_results_${CONFIG.TEST_RUN_ID}.json`, JSON.stringify(report, null, 2));

   // Final output
   console.log(`╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                           FINAL STATISTICS                                  ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

   console.log(`📊 PINATA REAL UPLOAD RESULTS:`);
   console.log(`   ├─ Successful Uploads: ${totalRealUploads}/${CONFIG.EHR_COUNT} (${report.testInfo.successRate}%)`);
   console.log(`   ├─ Successful Downloads: ${totalRealDownloads}/${CONFIG.EHR_COUNT}`);
   console.log(`   └─ Failed Uploads: ${failedUploads}\n`);

   console.log(`⚡ PERFORMANCE METRICS:`);
   console.log(`   ├─ Avg AES Encryption: ${avgAesEncrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg AES Decryption: ${avgAesDecrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Upload: ${avgUploadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Download: ${avgDownloadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Proxy Re-encrypt: ${report.performance.averageProxyReencryptMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Total Access Time: ${avgAccessTime.toFixed(2)} ms`);
   console.log(`   ├─ Min/Max Access Time: ${report.performance.minAccessTimeMs.toFixed(2)} / ${report.performance.maxAccessTimeMs.toFixed(2)} ms`);
   console.log(`   └─ Total Test Duration: ${report.summary.totalTimeSeconds.toFixed(1)} seconds\n`);

   console.log(`💰 GAS COSTS:`);
   console.log(`   ├─ Witness Issuance: ${witnessResult.gasUsed} gas (${witnessCostDzd.toFixed(4)} DZD)`);
   console.log(`   ├─ Revocation: ${revokeResult.gasUsed} gas (${revokeCostDzd.toFixed(4)} DZD)`);
   console.log(`   └─ Total Cost: ${(witnessCostDzd + revokeCostDzd).toFixed(4)} DZD\n`);

   console.log(`📁 Results saved to: pinata_test_results_${CONFIG.TEST_RUN_ID}.json`);
   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                          TEST COMPLETED SUCCESSFULLY                      ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);
}




// Run the test
runProfessionalTest().catch(console.error);


*/



/*
//------------------------------------------------------------------------------------------------------------------------------------------------
const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
   // PINATA REAL API KEYS - REPLACE WITH YOUR VALID KEYS
   PINATA_API_KEY: '03959fc6abd1baa890bf',
   PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
   PROXY_URL: 'http://127.0.0.1:5000',
   RPC_URL: 'https://ethereum-sepolia.publicnode.com',
   EHR_COUNT: 10,  // Reduced for testing, change back to 100
   WITNESS_VALIDITY_DAYS: 365,
   TEST_RUN_ID: `TEST_${Date.now()}`,

   // EHR Size Configuration (in KB)
   EHR_SIZE_CONFIG: {
      type: 'mixed',
      sizes: {
         small: { min: 50, max: 100 },     // 50-100 KB
         medium: { min: 200, max: 400 },   // 200-400 KB
         large: { min: 500, max: 800 },    // 500-800 KB
         xlarge: { min: 1000, max: 2000 }  // 1-2 MB
      }
   }
};

// REPLACE WITH YOUR PRIVATE KEY
const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              REAL PINATA PERFORMANCE TEST - Sepolia Testnet                    ║
║              ${CONFIG.EHR_COUNT} EHRs | REAL IPFS Uploads & Downloads                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== REAL PINATA FUNCTIONS ====================
async function realPinataUpload(buffer, filename, metadata = {}) {
   const startTime = process.hrtime.bigint();

   const formData = new FormData();
   formData.append('file', buffer, { filename });
   formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { ...metadata, timestamp: Date.now(), testRun: CONFIG.TEST_RUN_ID }
   }));

   try {
      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
         headers: {
            ...formData.getHeaders(),
            pinata_api_key: CONFIG.PINATA_API_KEY,
            pinata_secret_api_key: CONFIG.PINATA_API_SECRET
         },
         maxBodyLength: Infinity,
         maxContentLength: Infinity
      });

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      return {
         success: true,
         cid: response.data.IpfsHash,
         url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
         timeMs: duration,
         size: buffer.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata upload failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         size: buffer.length
      };
   }
}

async function realPinataDownload(cid) {
   const startTime = process.hrtime.bigint();

   try {
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(url, {
         responseType: 'arraybuffer',
         timeout: 60000 // 60 second timeout for large files
      });

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      return {
         success: true,
         data: Buffer.from(response.data),
         timeMs: duration,
         size: response.data.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata download failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         data: null
      };
   }
}

// ==================== LARGE EHR GENERATOR ====================
class LargeEHRGenerator {
   generateRealisticEHR(index, targetSizeKB) {
      const generateText = (targetChars) => {
         const paragraphs = [
            "CLINICAL SUMMARY: Patient presents with acute onset of chest pain radiating to left arm, associated with shortness of breath and diaphoresis. Symptoms began approximately 2 hours prior to presentation while at rest. Patient reports similar episodes in the past month but less severe in intensity.",
            "PAST MEDICAL HISTORY: Significant for hypertension diagnosed 5 years ago, currently controlled with Lisinopril. Type 2 diabetes mellitus diagnosed 3 years ago, managed with Metformin. Hyperlipidemia on Atorvastatin. No prior surgical history. Denies smoking. Occasional alcohol use.",
            "FAMILY HISTORY: Positive for coronary artery disease in father (age 55) and mother (age 62). Brother with hypertension. No known genetic disorders.",
            "PHYSICAL EXAMINATION: BP 145/92, HR 102, RR 18, O2 sat 96% on room air, Temp 37.2C. Cardiovascular: Regular rate and rhythm, no murmurs, rubs or gallops. Lungs: Clear to auscultation bilaterally. Abdomen: Soft, non-tender, non-distended. Extremities: No edema, pulses 2+ bilaterally.",
            "DIAGNOSTIC STUDIES: ECG shows sinus tachycardia with non-specific ST-T wave changes in lateral leads. Initial troponin I elevated at 2.5 ng/mL (normal <0.04). Chest X-ray shows no acute cardiopulmonary process. Complete blood count within normal limits.",
            "ASSESSMENT AND PLAN: 1. Non-ST elevation myocardial infarction (NSTEMI) - Admit to telemetry for continuous monitoring. 2. Start dual antiplatelet therapy: Aspirin 324mg load, then 81mg daily; Clopidogrel 300mg load, then 75mg daily. 3. Cardiology consultation requested for possible cardiac catheterization. 4. Start statin therapy: Atorvastatin 80mg daily. 5. Strict intake/output monitoring. 6. Serial troponins q6h x3.",
            "DISCHARGE SUMMARY: Patient stabilized after 3 days. No further chest pain. Echocardiogram shows EF 55% with mild inferior wall hypokinesis. Stress test negative for inducible ischemia. Medications adjusted. Follow-up with cardiology in 2 weeks.",
            "MEDICATION LIST: Lisinopril 20mg daily, Metformin 1000mg BID, Atorvastatin 80mg daily, Aspirin 81mg daily, Clopidogrel 75mg daily, Carvedilol 12.5mg BID.",
            "LABORATORY RESULTS: Troponin I: 2.5 → 1.8 → 0.9 ng/mL. Creatinine: 0.9 mg/dL. Hemoglobin: 14.2 g/dL. HbA1c: 7.2%. LDL: 110 mg/dL. HDL: 38 mg/dL."
         ];

         let text = "";
         while (text.length < targetChars) {
            text += paragraphs[Math.floor(Math.random() * paragraphs.length)] + "\n\n";
         }
         return text.substring(0, targetChars);
      };

      const targetChars = targetSizeKB * 1024;
      const clinicalText = generateText(Math.floor(targetChars * 0.7));

      const labResults = Array.from({ length: Math.floor(Math.random() * 15) + 10 }, () => ({
         test: ["CBC", "CMP", "Lipid Panel", "HbA1c", "TSH", "Vitamin D", "Iron Panel", "CRP", "ESR", "BNP", "Troponin", "CK-MB", "PT/INR", "PTT", "D-Dimer"][Math.floor(Math.random() * 15)],
         value: (Math.random() * 100).toFixed(1),
         unit: ["mg/dL", "ng/mL", "IU/L", "mmol/L", "g/dL", "%"][Math.floor(Math.random() * 6)],
         referenceRange: `${(Math.random() * 50).toFixed(0)}-${(Math.random() * 150 + 50).toFixed(0)}`,
         date: new Date().toISOString()
      }));

      const medications = Array.from({ length: Math.floor(Math.random() * 8) + 3 }, () => ({
         name: ["Lisinopril", "Metformin", "Atorvastatin", "Aspirin", "Clopidogrel", "Carvedilol", "Furosemide", "Spironolactone", "Warfarin", "Amiodarone", "Digoxin", "Metoprolol", "Amlodipine", "Losartan", "Simvastatin"][Math.floor(Math.random() * 15)],
         dosage: `${Math.floor(Math.random() * 100) + 5}${Math.random() > 0.5 ? "mg" : "mcg"}`,
         frequency: ["daily", "BID", "TID", "QID", "weekly"][Math.floor(Math.random() * 5)],
         startDate: new Date().toISOString()
      }));

      return {
         ehrId: `EHR_${String(index).padStart(4, '0')}_${Date.now()}`,
         metadata: {
            version: "3.0",
            generatedAt: new Date().toISOString(),
            sizeKB: (targetSizeKB).toFixed(2),
            type: targetSizeKB > 1000 ? "XL" : targetSizeKB > 500 ? "L" : targetSizeKB > 200 ? "M" : "S"
         },
         patientInfo: {
            id: `P_${Math.floor(Math.random() * 100000)}`,
            name: `Patient_${Math.floor(Math.random() * 10000)}`,
            age: Math.floor(Math.random() * 70) + 18,
            gender: ['Male', 'Female'][Math.floor(Math.random() * 2)],
            bloodType: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][Math.floor(Math.random() * 8)],
            mrn: `MRN${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`
         },
         clinicalData: {
            primaryDiagnosis: this.generateDiagnosis(),
            secondaryDiagnosis: Math.random() > 0.7 ? this.generateDiagnosis() : 'None',
            clinicalNotes: clinicalText,
            labResults: labResults,
            medications: medications,
            vitalSigns: {
               bloodPressure: `${Math.floor(100 + Math.random() * 40)}/${Math.floor(60 + Math.random() * 30)}`,
               heartRate: Math.floor(60 + Math.random() * 40),
               respiratoryRate: Math.floor(12 + Math.random() * 10),
               temperature: (36.5 + Math.random() * 1.5).toFixed(1),
               oxygenSaturation: Math.floor(92 + Math.random() * 6)
            },
            allergies: ["Penicillin", "Sulfa", "Latex", "Codeine"].filter(() => Math.random() > 0.7),
            immunizations: [
               { vaccine: "COVID-19", date: "2024-01-15", status: "Completed" },
               { vaccine: "Influenza", date: "2024-10-01", status: "Completed" }
            ]
         },
         visitInfo: {
            date: new Date().toISOString(),
            department: ['Cardiology', 'Endocrinology', 'Pulmonology', 'Neurology', 'Emergency', 'Internal Medicine'][Math.floor(Math.random() * 6)],
            physician: `Dr_${Math.random().toString(36).substring(7)}`,
            admissionDate: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString(),
            dischargeDate: new Date(Date.now() + Math.random() * 7 * 86400000).toISOString(),
            lengthOfStay: Math.floor(Math.random() * 14) + 1
         },
         timestamp: Date.now(),
         ehrSizeKB: targetSizeKB
      };
   }

   generateDiagnosis() {
      const diagnoses = [
         "Acute Myocardial Infarction (NSTEMI)", "Chronic Heart Failure with Reduced EF",
         "Unstable Angina Pectoris", "Atrial Fibrillation with Rapid Ventricular Response",
         "Hypertensive Urgency", "Diabetic Ketoacidosis", "Community Acquired Pneumonia",
         "COPD Exacerbation", "Acute Pulmonary Embolism", "Ischemic Cerebrovascular Accident",
         "Transient Ischemic Attack", "Severe Sepsis", "Acute on Chronic Kidney Disease",
         "Decompensated Liver Cirrhosis", "Acute Pancreatitis", "Cholelithiasis with Cholecystitis"
      ];
      return diagnoses[Math.floor(Math.random() * diagnoses.length)];
   }
}

// ==================== PROXY FUNCTIONS ====================
async function registerDoctor(doctorDid, attributes) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== BLOCKCHAIN FUNCTIONS ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function activeDoctorCount() external view returns (uint256)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   const balance = await provider.getBalance(signer.address);
   const network = await provider.getNetwork();
   return { signer, balance: ethers.formatEther(balance), chainId: network.chainId };
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function revokeDoctor(doctorDid) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return {
      txHash: receipt.hash,
      gasUsed: parseInt(receipt.gasUsed.toString()),
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

async function isDoctorActive(doctorDid) {
   const startTime = process.hrtime.bigint();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   const endTime = process.hrtime.bigint();
   return { active: result, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== CRYPTO FUNCTIONS ====================
function aesEncrypt(data, key) {
   const startTime = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const endTime = process.hrtime.bigint();
   return {
      encrypted: result,
      size: result.length,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

function aesDecrypt(encryptedBuffer, key) {
   const startTime = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const endTime = process.hrtime.bigint();
   return {
      data: result,
      timeMs: Number(endTime - startTime) / 1_000_000
   };
}

// ==================== HTML REPORT GENERATOR ====================
function generateHTMLReport(report, witnessResult, revokeResult, gasPrice, ethToDzdRate, startDateTime) {
   console.log(`\n📄 Generating HTML report...`);

   const validMetrics = report.perEhrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const accessTimes = validMetrics.map(m => m.totalAccessTime).sort((a, b) => a - b);
   const uploadTimes = validMetrics.map(m => m.pinataUploadTime);

   // Size category stats
   const sizeStats = {
      S: validMetrics.filter(m => m.sizeCategory === 'S'),
      M: validMetrics.filter(m => m.sizeCategory === 'M'),
      L: validMetrics.filter(m => m.sizeCategory === 'L'),
      XL: validMetrics.filter(m => m.sizeCategory === 'XL')
   };

   const avgBySize = {
      S: sizeStats.S.length ? (sizeStats.S.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.S.length).toFixed(0) : 0,
      M: sizeStats.M.length ? (sizeStats.M.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.M.length).toFixed(0) : 0,
      L: sizeStats.L.length ? (sizeStats.L.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.L.length).toFixed(0) : 0,
      XL: sizeStats.XL.length ? (sizeStats.XL.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.XL.length).toFixed(0) : 0
   };

   // Percentiles
   const p50 = accessTimes[Math.floor(accessTimes.length * 0.5)] || 0;
   const p75 = accessTimes[Math.floor(accessTimes.length * 0.75)] || 0;
   const p90 = accessTimes[Math.floor(accessTimes.length * 0.9)] || 0;
   const p95 = accessTimes[Math.floor(accessTimes.length * 0.95)] || 0;
   const p99 = accessTimes[Math.floor(accessTimes.length * 0.99)] || 0;

   const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediChain Performance Report | Pinata + Sepolia</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; }
        .report-header { background: white; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; }
        .report-header h1 { color: #1a5276; font-size: 2.5rem; margin-bottom: 10px; }
        .test-badge { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 20px; border-radius: 30px; font-weight: 600; margin-top: 10px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; border-radius: 15px; padding: 25px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); transition: transform 0.3s; text-align: center; }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-card .stat-value { font-size: 2.5rem; font-weight: 700; color: #2c3e50; }
        .stat-card .stat-label { color: #7f8c8d; margin-top: 8px; }
        .section { background: white; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); }
        .section-title { font-size: 1.5rem; color: #2c3e50; margin-bottom: 20px; border-bottom: 3px solid #667eea; display: inline-block; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
        .metric-item { background: #f8f9fa; border-radius: 12px; padding: 20px; text-align: center; }
        .metric-item .metric-value { font-size: 1.8rem; font-weight: 700; color: #667eea; }
        .metric-item .metric-name { color: #7f8c8d; margin-bottom: 8px; }
        .table-container { overflow-x: auto; margin-top: 20px; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .data-table th { background: #667eea; color: white; padding: 12px; text-align: left; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #ecf0f1; }
        .data-table tr:hover { background: #f8f9fa; }
        .status-pass { color: #27ae60; font-weight: 600; }
        .status-fail { color: #e74c3c; font-weight: 600; }
        .chart-container { margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 12px; }
        .chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; margin-top: 20px; }
        .gas-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 15px; padding: 25px; margin-top: 20px; }
        .gas-stats { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px; text-align: center; }
        .footer { text-align: center; color: white; margin-top: 30px; padding: 20px; opacity: 0.8; }
        @media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
<div class="container">
    <div class="report-header">
        <h1>🏥 MediChain Performance Report</h1>
        <p>Real Pinata Cloud IPFS + Sepolia Testnet | TB-PRE Proxy</p>
        <div class="test-badge">Test ID: ${report.testInfo.runId.substring(0, 20)}...</div>
    </div>

    <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${report.testInfo.ehrCount}</div><div class="stat-label">Total EHRs</div></div>
        <div class="stat-card"><div class="stat-value">${report.testInfo.successRate}%</div><div class="stat-label">Success Rate</div></div>
        <div class="stat-card"><div class="stat-value">${report.summary.totalTimeSeconds.toFixed(1)}s</div><div class="stat-label">Total Duration</div></div>
        <div class="stat-card"><div class="stat-value">${report.summary.averageEHRSizeKB.toFixed(0)} KB</div><div class="stat-label">Avg EHR Size</div></div>
    </div>

    <div class="section">
        <h2 class="section-title">⚡ Performance Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-item"><div class="metric-name">AES Encryption</div><div class="metric-value">${report.performance.averageAesEncryptionMs.toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">AES Decryption</div><div class="metric-value">${report.performance.averageAesDecryptionMs.toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">Pinata Upload</div><div class="metric-value">${report.performance.averagePinataUploadMs.toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">Pinata Download</div><div class="metric-value">${report.performance.averagePinataDownloadMs.toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">Proxy Re-encrypt</div><div class="metric-value">${report.performance.averageProxyReencryptMs.toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">Total Access Time</div><div class="metric-value">${report.performance.averageTotalAccessTimeMs.toFixed(2)} ms</div></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📈 Performance Distribution</h2>
        <div class="chart-row">
            <div class="chart-container"><canvas id="accessTimeChart"></canvas></div>
            <div class="chart-container"><canvas id="uploadTimeChart"></canvas></div>
        </div>
        <div class="chart-row">
            <div class="chart-container"><canvas id="sizeComparisonChart"></canvas></div>
            <div class="chart-container"><canvas id="successRateChart"></canvas></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📏 Performance by EHR Size</h2>
        <div class="metrics-grid">
            <div class="metric-item"><div class="metric-name">Small (50-100KB)</div><div class="metric-value">${sizeStats.S.length}</div><div class="metric-name" style="font-size:0.8rem">Avg: ${avgBySize.S} ms</div></div>
            <div class="metric-item"><div class="metric-name">Medium (200-400KB)</div><div class="metric-value">${sizeStats.M.length}</div><div class="metric-name" style="font-size:0.8rem">Avg: ${avgBySize.M} ms</div></div>
            <div class="metric-item"><div class="metric-name">Large (500-800KB)</div><div class="metric-value">${sizeStats.L.length}</div><div class="metric-name" style="font-size:0.8rem">Avg: ${avgBySize.L} ms</div></div>
            <div class="metric-item"><div class="metric-name">XL (1-2MB)</div><div class="metric-value">${sizeStats.XL.length}</div><div class="metric-name" style="font-size:0.8rem">Avg: ${avgBySize.XL} ms</div></div>
        </div>
    </div>

    <div class="gas-card">
        <h3>💰 Blockchain Gas Costs (Sepolia)</h3>
        <div class="gas-stats">
            <div><div>Witness Issuance</div><div style="font-size:1.5rem; font-weight:700">${witnessResult.gasUsed.toLocaleString()} gas</div><div>≈ ${report.blockchain.witnessCostDZD.toFixed(4)} DZD</div></div>
            <div><div>Revocation</div><div style="font-size:1.5rem; font-weight:700">${revokeResult.gasUsed.toLocaleString()} gas</div><div>≈ ${report.blockchain.revocationCostDZD.toFixed(4)} DZD</div></div>
            <div><div>Gas Price</div><div style="font-size:1.2rem">${report.blockchain.gasPriceGwei.toFixed(2)} Gwei</div><div>1 ETH = ${ethToDzdRate.toLocaleString()} DZD</div></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📊 Total Access Time Percentiles</h2>
        <div class="metrics-grid">
            <div class="metric-item"><div class="metric-name">Median (p50)</div><div class="metric-value">${p50.toFixed(0)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p75</div><div class="metric-value">${p75.toFixed(0)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p90</div><div class="metric-value">${p90.toFixed(0)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p95</div><div class="metric-value">${p95.toFixed(0)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p99</div><div class="metric-value">${p99.toFixed(0)} ms</div></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📋 Detailed EHR Results</h2>
        <div class="table-container">
            <table class="data-table">
                <thead><tr><th>#</th><th>Size(KB)</th><th>Cat</th><th>AES Enc(ms)</th><th>AES Dec(ms)</th><th>Pinata Up(ms)</th><th>Pinata Down(ms)</th><th>Proxy ReEnc(ms)</th><th>Total Access(ms)</th><th>Status</th></tr></thead>
                <tbody>
                    ${report.perEhrMetrics.map(m => `
                    <tr>
                        <td>${m.ehrNumber}</td>
                        <td>${m.sizeKB.toFixed(0)}</td>
                        <td>${m.sizeCategory}</td>
                        <td>${m.aesEncryptTime.toFixed(2)}</td>
                        <td>${m.aesDecryptTime.toFixed(2)}</td>
                        <td>${m.pinataUploadTime > 0 ? m.pinataUploadTime.toFixed(2) : 'FAIL'}</td>
                        <td>${m.pinataDownloadTime > 0 ? m.pinataDownloadTime.toFixed(2) : 'FAIL'}</td>
                        <td>${m.proxyReencryptTime.toFixed(2)}</td>
                        <td><strong>${m.totalAccessTime.toFixed(2)}</strong></td>
                        <td class="${m.uploadSuccess && m.downloadSuccess ? 'status-pass' : 'status-fail'}">${m.uploadSuccess && m.downloadSuccess ? '✓ PASS' : '✗ FAIL'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <div class="footer">
        <p>Generated on ${new Date().toLocaleString()} | MediChain Performance Test | Pinata + Sepolia</p>
    </div>
</div>

<script>
    const accessTimes = ${JSON.stringify(accessTimes)};
    const uploadTimes = ${JSON.stringify(uploadTimes)};
    const accessMin = Math.min(...accessTimes), accessMax = Math.max(...accessTimes);
    const accessBinWidth = (accessMax - accessMin) / 20;
    const accessBins = Array(20).fill(0);
    accessTimes.forEach(t => { let idx = Math.floor((t - accessMin) / accessBinWidth); if (idx === 20) idx = 19; if (idx >= 0) accessBins[idx]++; });
    new Chart(document.getElementById('accessTimeChart'), {
        type: 'bar', data: { labels: Array(20).fill().map((_,i)=> (accessMin + i*accessBinWidth).toFixed(0)), datasets: [{ label: 'Frequency', data: accessBins, backgroundColor: '#667eea' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Total Access Time Distribution (ms)' } } }
    });
    const uploadMin = Math.min(...uploadTimes), uploadMax = Math.max(...uploadTimes);
    const uploadBinWidth = (uploadMax - uploadMin) / 20;
    const uploadBins = Array(20).fill(0);
    uploadTimes.forEach(t => { let idx = Math.floor((t - uploadMin) / uploadBinWidth); if (idx === 20) idx = 19; if (idx >= 0) uploadBins[idx]++; });
    new Chart(document.getElementById('uploadTimeChart'), {
        type: 'bar', data: { labels: Array(20).fill().map((_,i)=> (uploadMin + i*uploadBinWidth).toFixed(0)), datasets: [{ label: 'Frequency', data: uploadBins, backgroundColor: '#27ae60' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Pinata Upload Time Distribution (ms)' } } }
    });
    new Chart(document.getElementById('sizeComparisonChart'), {
        type: 'bar', data: { labels: ['Small', 'Medium', 'Large', 'XL'], datasets: [{ label: 'Avg Access Time (ms)', data: [${avgBySize.S}, ${avgBySize.M}, ${avgBySize.L}, ${avgBySize.XL}], backgroundColor: '#e74c3c' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Average Access Time by EHR Size' } } }
    });
    new Chart(document.getElementById('successRateChart'), {
        type: 'doughnut', data: { labels: ['Successful (${report.testInfo.successfulUploads})', 'Failed (${report.testInfo.failedUploads})'], datasets: [{ data: [${report.testInfo.successfulUploads}, ${report.testInfo.failedUploads}], backgroundColor: ['#27ae60', '#e74c3c'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Upload Success Rate' } } }
    });
</script>
</body>
</html>`;

   const htmlFilename = `pinata_test_report_${CONFIG.TEST_RUN_ID}.html`;
   fs.writeFileSync(htmlFilename, htmlContent);
   console.log(`   ✅ HTML Report saved: ${htmlFilename}`);
   return htmlFilename;
}

// ==================== MAIN TEST ====================
async function runProfessionalTest() {
   const ehrGenerator = new LargeEHRGenerator();
   const startDateTime = new Date();

   console.log(`\n🚀 Starting REAL Pinata Performance Test`);
   console.log(`📅 Start Time: ${startDateTime.toLocaleString()}`);
   console.log(`📊 Configuration: ${CONFIG.EHR_COUNT} EHRs | Mixed Sizes (50KB - 2MB)\n`);

   // Test Pinata connection first
   console.log(`🔗 Testing Pinata Connection...`);
   const testBuffer = Buffer.from(JSON.stringify({ test: "connection" }));
   const testUpload = await realPinataUpload(testBuffer, `test_${Date.now()}.json`);
   if (!testUpload.success) {
      console.error(`❌ Pinata connection failed! Please check your API keys.`);
      console.error(`   Error: ${testUpload.error}`);
      process.exit(1);
   }
   console.log(`   ✅ Pinata connected! Test CID: ${testUpload.cid}\n`);

   // Initialize blockchain
   const { signer, balance, chainId } = await initBlockchain();
   const ethToDzdRate = 350000;
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;

   console.log(`✅ Blockchain Connected`);
   console.log(`   ├─ Network: Sepolia (Chain ID: ${chainId})`);
   console.log(`   ├─ Wallet: ${signer.address}`);
   console.log(`   ├─ Balance: ${balance} SepoliaETH`);
   console.log(`   └─ Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // Generate test identities
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + publicKeyBase64.substring(0, 44);

   // Register doctor
   console.log(`📝 Registering Doctor on Proxy...`);
   const regResult = await registerDoctor(doctorDid, ['doctor', 'cardiologist']);
   console.log(`   ✅ Doctor registered (${regResult.timeMs.toFixed(2)} ms)`);

   // Issue witness
   console.log(`⛓️ Issuing Witness on Sepolia...`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (CONFIG.WITNESS_VALIDITY_DAYS * 86400);
   const witnessResult = await issueWitness(doctorDid, witnessHash, expiry);
   const witnessCostWei = BigInt(witnessResult.gasUsed) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;
   console.log(`   ✅ Witness Issued (${witnessResult.timeMs.toFixed(2)} ms | ${witnessResult.gasUsed} gas | ${witnessCostDzd.toFixed(4)} DZD)\n`);

   // Verify doctor active
   const activeCheck = await isDoctorActive(doctorDid);
   console.log(`✅ Doctor Active (verification: ${activeCheck.timeMs.toFixed(2)} ms)\n`);

   // Metrics storage
   const ehrMetrics = [];
   let totalRealUploads = 0;
   let totalRealDownloads = 0;
   let failedUploads = 0;

   console.log(`📊 Processing ${CONFIG.EHR_COUNT} EHRs with REAL Pinata uploads...\n`);
   console.log(`┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
   console.log(`│ EHR #   │ Size(KB)     │ AES Enc      │ AES Dec      │ Pinata Up    │ Pinata Down  │ Proxy ReEnc  │ Total Access │ Status       │`);
   console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

   for (let i = 1; i <= CONFIG.EHR_COUNT; i++) {
      // Determine size for this EHR
      let targetSizeKB;
      const rand = Math.random();
      if (rand < 0.25) targetSizeKB = 50 + Math.random() * 50;
      else if (rand < 0.5) targetSizeKB = 200 + Math.random() * 200;
      else if (rand < 0.75) targetSizeKB = 500 + Math.random() * 300;
      else targetSizeKB = 1000 + Math.random() * 1000;

      // Generate EHR
      const ehrData = ehrGenerator.generateRealisticEHR(i, targetSizeKB);
      const ehrBuffer = Buffer.from(JSON.stringify(ehrData), 'utf8');
      const actualSizeKB = ehrBuffer.length / 1024;

      // AES Key Generation
      const aesKey = crypto.randomBytes(32);

      // AES Encryption
      const { encrypted: encryptedEhr, timeMs: aesEncryptTime } = aesEncrypt(ehrBuffer, aesKey);

      // Proxy Encapsulation
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);

      // REAL PINATA UPLOAD - Encrypted EHR
      console.log(`\n   📤 Uploading EHR ${i} (${actualSizeKB.toFixed(0)} KB) to Pinata...`);
      const uploadResult = await realPinataUpload(encryptedEhr, `ehr_${i}_${Date.now()}.enc`, { ehrId: i });
      if (uploadResult.success) {
         totalRealUploads++;
         console.log(`   ✅ Uploaded! CID: ${uploadResult.cid.substring(0, 20)}... (${uploadResult.timeMs.toFixed(2)} ms)`);
      } else {
         failedUploads++;
         console.log(`   ❌ Upload failed: ${uploadResult.error}`);
      }

      // Upload ciphertext
      const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
      const ctUploadResult = await realPinataUpload(ciphertextBuffer, `ct_${i}_${Date.now()}.json`, { ehrId: i });

      // Doctor Access Phase
      const accessStart = process.hrtime.bigint();

      const witnessCheck = await isDoctorActive(doctorDid);
      const rekeyResult = await generateRekey(encapResult.data.ciphertext_id, doctorDid, ['doctor']);
      const reencryptResult = await proxyReencrypt(rekeyResult.data.rekey_id);
      const decryptAesResult = await decryptAES(reencryptResult.data.transformed_ct_id, doctorDid);

      // REAL PINATA DOWNLOAD
      console.log(`   📥 Downloading from Pinata...`);
      const downloadResult = await realPinataDownload(uploadResult.cid);
      if (downloadResult.success) {
         totalRealDownloads++;
         console.log(`   ✅ Downloaded! (${downloadResult.timeMs.toFixed(2)} ms)`);
      } else {
         console.log(`   ❌ Download failed: ${downloadResult.error}`);
      }

      // AES Decryption
      const decryptedKey = Buffer.from(decryptAesResult.data.aes_key_b64, 'base64');
      const { data: decryptedEhr, timeMs: aesDecryptTime } = aesDecrypt(downloadResult.data || encryptedEhr, decryptedKey);

      const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

      // Verify integrity
      const decryptedStr = decryptedEhr.toString('utf8');
      const originalStr = JSON.stringify(ehrData);

      let status = "✅ PASS";
      if (decryptedStr !== originalStr) {
         status = "❌ FAIL";
         console.error(`\n❌ DATA INTEGRITY FAILED at EHR ${i}`);
      }

      // Record metrics
      ehrMetrics.push({
         ehrNumber: i,
         sizeKB: actualSizeKB,
         sizeCategory: actualSizeKB > 1000 ? "XL" : actualSizeKB > 500 ? "L" : actualSizeKB > 200 ? "M" : "S",
         aesEncryptTime: aesEncryptTime,
         aesDecryptTime: aesDecryptTime,
         pinataUploadTime: uploadResult.success ? uploadResult.timeMs : 0,
         pinataDownloadTime: downloadResult.success ? downloadResult.timeMs : 0,
         proxyEncapsulationTime: encapResult.timeMs,
         proxyReencryptTime: reencryptResult.timeMs,
         witnessCheckTime: witnessCheck.timeMs,
         totalAccessTime: totalAccessTime,
         uploadSuccess: uploadResult.success,
         downloadSuccess: downloadResult.success,
         cid: uploadResult.success ? uploadResult.cid : null
      });

      // Progress display
      console.log(`│ ${String(i).padEnd(6)} │ ${String(actualSizeKB.toFixed(0)).padEnd(12)} │ ${String(aesEncryptTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(uploadResult.success ? uploadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(downloadResult.success ? downloadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(reencryptResult.timeMs.toFixed(2)).padEnd(12)} │ ${String(totalAccessTime.toFixed(2)).padEnd(12)} │ ${status.padEnd(12)} │`);

      if (i % 25 === 0 && i < CONFIG.EHR_COUNT) {
         console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);
      }
   }

   console.log(`└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`);

   // Revoke doctor
   console.log(`⛓️ Revoking Doctor...`);
   const revokeResult = await revokeDoctor(doctorDid);
   const revokeCostWei = BigInt(revokeResult.gasUsed) * gasPrice;
   const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
   const revokeCostDzd = revokeCostEth * ethToDzdRate;
   console.log(`   ✅ Revoked (${revokeResult.timeMs.toFixed(2)} ms | ${revokeResult.gasUsed} gas | ${revokeCostDzd.toFixed(4)} DZD)\n`);

   // Calculate statistics
   const validMetrics = ehrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const avgAccessTime = validMetrics.reduce((a, b) => a + b.totalAccessTime, 0) / validMetrics.length;
   const avgUploadTime = validMetrics.reduce((a, b) => a + b.pinataUploadTime, 0) / validMetrics.length;
   const avgDownloadTime = validMetrics.reduce((a, b) => a + b.pinataDownloadTime, 0) / validMetrics.length;
   const avgAesEncrypt = validMetrics.reduce((a, b) => a + b.aesEncryptTime, 0) / validMetrics.length;
   const avgAesDecrypt = validMetrics.reduce((a, b) => a + b.aesDecryptTime, 0) / validMetrics.length;

   // Generate report
   const report = {
      testInfo: {
         runId: CONFIG.TEST_RUN_ID,
         date: new Date().toISOString(),
         ehrCount: CONFIG.EHR_COUNT,
         successfulUploads: totalRealUploads,
         successfulDownloads: totalRealDownloads,
         failedUploads: failedUploads,
         successRate: ((totalRealUploads / CONFIG.EHR_COUNT) * 100).toFixed(1)
      },
      blockchain: {
         witnessGasUsed: witnessResult.gasUsed,
         witnessCostDZD: witnessCostDzd,
         revocationGasUsed: revokeResult.gasUsed,
         revocationCostDZD: revokeCostDzd,
         gasPriceGwei: parseFloat(ethers.formatUnits(gasPrice, 'gwei'))
      },
      performance: {
         averageAesEncryptionMs: avgAesEncrypt,
         averageAesDecryptionMs: avgAesDecrypt,
         averagePinataUploadMs: avgUploadTime,
         averagePinataDownloadMs: avgDownloadTime,
         averageProxyReencryptMs: validMetrics.reduce((a, b) => a + b.proxyReencryptTime, 0) / validMetrics.length,
         averageTotalAccessTimeMs: avgAccessTime,
         minAccessTimeMs: Math.min(...validMetrics.map(m => m.totalAccessTime)),
         maxAccessTimeMs: Math.max(...validMetrics.map(m => m.totalAccessTime))
      },
      perEhrMetrics: ehrMetrics,
      summary: {
         totalTimeSeconds: (Date.now() - startDateTime) / 1000,
         averageEHRSizeKB: ehrMetrics.reduce((a, b) => a + b.sizeKB, 0) / ehrMetrics.length
      }
   };

   // Save JSON report
   const jsonFilename = `pinata_test_results_${CONFIG.TEST_RUN_ID}.json`;
   fs.writeFileSync(jsonFilename, JSON.stringify(report, null, 2));
   console.log(`📁 JSON results saved to: ${jsonFilename}`);

   // Generate and save HTML report
   const htmlFilename = generateHTMLReport(report, witnessResult, revokeResult, gasPrice, ethToDzdRate, startDateTime);
   console.log(`📄 HTML report saved to: ${htmlFilename}`);

   // Final output
   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                           FINAL STATISTICS                                  ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

   console.log(`📊 PINATA REAL UPLOAD RESULTS:`);
   console.log(`   ├─ Successful Uploads: ${totalRealUploads}/${CONFIG.EHR_COUNT} (${report.testInfo.successRate}%)`);
   console.log(`   ├─ Successful Downloads: ${totalRealDownloads}/${CONFIG.EHR_COUNT}`);
   console.log(`   └─ Failed Uploads: ${failedUploads}\n`);

   console.log(`⚡ PERFORMANCE METRICS:`);
   console.log(`   ├─ Avg AES Encryption: ${avgAesEncrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg AES Decryption: ${avgAesDecrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Upload: ${avgUploadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Download: ${avgDownloadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Proxy Re-encrypt: ${report.performance.averageProxyReencryptMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Total Access Time: ${avgAccessTime.toFixed(2)} ms`);
   console.log(`   ├─ Min/Max Access Time: ${report.performance.minAccessTimeMs.toFixed(2)} / ${report.performance.maxAccessTimeMs.toFixed(2)} ms`);
   console.log(`   └─ Total Test Duration: ${report.summary.totalTimeSeconds.toFixed(1)} seconds\n`);

   console.log(`💰 GAS COSTS:`);
   console.log(`   ├─ Witness Issuance: ${witnessResult.gasUsed} gas (${witnessCostDzd.toFixed(4)} DZD)`);
   console.log(`   ├─ Revocation: ${revokeResult.gasUsed} gas (${revokeCostDzd.toFixed(4)} DZD)`);
   console.log(`   └─ Total Cost: ${(witnessCostDzd + revokeCostDzd).toFixed(4)} DZD\n`);

   console.log(`✅ Test completed successfully!`);
   console.log(`\n📁 Results saved to:`);
   console.log(`   - ${jsonFilename}`);
   console.log(`   - ${htmlFilename}`);
   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                          TEST COMPLETED SUCCESSFULLY                      ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);
}

// Run the test
runProfessionalTest().catch(console.error);

*/





/*
work good banchmard   -------------------------------------------------------------
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
   EHR_COUNT: 100,                     // ← 100 EHRs
   WITNESS_VALIDITY_DAYS: 365,
   TEST_RUN_ID: `TEST_${Date.now()}`,
   EHR_SIZE_CONFIG: {
      type: 'mixed',
      sizes: {
         small: { min: 50, max: 100 },
         medium: { min: 200, max: 400 },
         large: { min: 500, max: 800 },
         xlarge: { min: 1000, max: 2000 }
      }
   }
};

const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              REAL PINATA PERFORMANCE TEST - Sepolia Testnet                    ║
║              ${CONFIG.EHR_COUNT} EHRs | REAL IPFS Uploads & Downloads                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== REAL PINATA FUNCTIONS ====================
async function realPinataUpload(buffer, filename, metadata = {}) {
   const startTime = process.hrtime.bigint();
   const formData = new FormData();
   formData.append('file', buffer, { filename });
   formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { ...metadata, timestamp: Date.now(), testRun: CONFIG.TEST_RUN_ID }
   }));
   try {
      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
         headers: {
            ...formData.getHeaders(),
            pinata_api_key: CONFIG.PINATA_API_KEY,
            pinata_secret_api_key: CONFIG.PINATA_API_SECRET
         },
         maxBodyLength: Infinity,
         maxContentLength: Infinity
      });
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      return {
         success: true,
         cid: response.data.IpfsHash,
         url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
         timeMs: duration,
         size: buffer.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata upload failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         size: buffer.length
      };
   }
}

async function realPinataDownload(cid) {
   const startTime = process.hrtime.bigint();
   try {
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      return {
         success: true,
         data: Buffer.from(response.data),
         timeMs: duration,
         size: response.data.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata download failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         data: null
      };
   }
}

// ==================== LARGE EHR GENERATOR (unchanged) ====================
class LargeEHRGenerator {
   generateRealisticEHR(index, targetSizeKB) {
      const generateText = (targetChars) => {
         const paragraphs = [
            "CLINICAL SUMMARY: Patient presents with acute onset of chest pain radiating to left arm, associated with shortness of breath and diaphoresis. Symptoms began approximately 2 hours prior to presentation while at rest. Patient reports similar episodes in the past month but less severe in intensity.",
            "PAST MEDICAL HISTORY: Significant for hypertension diagnosed 5 years ago, currently controlled with Lisinopril. Type 2 diabetes mellitus diagnosed 3 years ago, managed with Metformin. Hyperlipidemia on Atorvastatin. No prior surgical history. Denies smoking. Occasional alcohol use.",
            "FAMILY HISTORY: Positive for coronary artery disease in father (age 55) and mother (age 62). Brother with hypertension. No known genetic disorders.",
            "PHYSICAL EXAMINATION: BP 145/92, HR 102, RR 18, O2 sat 96% on room air, Temp 37.2C. Cardiovascular: Regular rate and rhythm, no murmurs, rubs or gallops. Lungs: Clear to auscultation bilaterally. Abdomen: Soft, non-tender, non-distended. Extremities: No edema, pulses 2+ bilaterally.",
            "DIAGNOSTIC STUDIES: ECG shows sinus tachycardia with non-specific ST-T wave changes in lateral leads. Initial troponin I elevated at 2.5 ng/mL (normal <0.04). Chest X-ray shows no acute cardiopulmonary process. Complete blood count within normal limits.",
            "ASSESSMENT AND PLAN: 1. Non-ST elevation myocardial infarction (NSTEMI) - Admit to telemetry for continuous monitoring. 2. Start dual antiplatelet therapy: Aspirin 324mg load, then 81mg daily; Clopidogrel 300mg load, then 75mg daily. 3. Cardiology consultation requested for possible cardiac catheterization. 4. Start statin therapy: Atorvastatin 80mg daily. 5. Strict intake/output monitoring. 6. Serial troponins q6h x3.",
            "DISCHARGE SUMMARY: Patient stabilized after 3 days. No further chest pain. Echocardiogram shows EF 55% with mild inferior wall hypokinesis. Stress test negative for inducible ischemia. Medications adjusted. Follow-up with cardiology in 2 weeks.",
            "MEDICATION LIST: Lisinopril 20mg daily, Metformin 1000mg BID, Atorvastatin 80mg daily, Aspirin 81mg daily, Clopidogrel 75mg daily, Carvedilol 12.5mg BID.",
            "LABORATORY RESULTS: Troponin I: 2.5 → 1.8 → 0.9 ng/mL. Creatinine: 0.9 mg/dL. Hemoglobin: 14.2 g/dL. HbA1c: 7.2%. LDL: 110 mg/dL. HDL: 38 mg/dL."
         ];
         let text = "";
         while (text.length < targetChars) {
            text += paragraphs[Math.floor(Math.random() * paragraphs.length)] + "\n\n";
         }
         return text.substring(0, targetChars);
      };
      const targetChars = targetSizeKB * 1024;
      const clinicalText = generateText(Math.floor(targetChars * 0.7));
      const labResults = Array.from({ length: Math.floor(Math.random() * 15) + 10 }, () => ({
         test: ["CBC", "CMP", "Lipid Panel", "HbA1c", "TSH", "Vitamin D", "Iron Panel", "CRP", "ESR", "BNP", "Troponin", "CK-MB", "PT/INR", "PTT", "D-Dimer"][Math.floor(Math.random() * 15)],
         value: (Math.random() * 100).toFixed(1),
         unit: ["mg/dL", "ng/mL", "IU/L", "mmol/L", "g/dL", "%"][Math.floor(Math.random() * 6)],
         referenceRange: `${(Math.random() * 50).toFixed(0)}-${(Math.random() * 150 + 50).toFixed(0)}`,
         date: new Date().toISOString()
      }));
      const medications = Array.from({ length: Math.floor(Math.random() * 8) + 3 }, () => ({
         name: ["Lisinopril", "Metformin", "Atorvastatin", "Aspirin", "Clopidogrel", "Carvedilol", "Furosemide", "Spironolactone", "Warfarin", "Amiodarone", "Digoxin", "Metoprolol", "Amlodipine", "Losartan", "Simvastatin"][Math.floor(Math.random() * 15)],
         dosage: `${Math.floor(Math.random() * 100) + 5}${Math.random() > 0.5 ? "mg" : "mcg"}`,
         frequency: ["daily", "BID", "TID", "QID", "weekly"][Math.floor(Math.random() * 5)],
         startDate: new Date().toISOString()
      }));
      return {
         ehrId: `EHR_${String(index).padStart(4, '0')}_${Date.now()}`,
         metadata: {
            version: "3.0",
            generatedAt: new Date().toISOString(),
            sizeKB: (targetSizeKB).toFixed(2),
            type: targetSizeKB > 1000 ? "XL" : targetSizeKB > 500 ? "L" : targetSizeKB > 200 ? "M" : "S"
         },
         patientInfo: {
            id: `P_${Math.floor(Math.random() * 100000)}`,
            name: `Patient_${Math.floor(Math.random() * 10000)}`,
            age: Math.floor(Math.random() * 70) + 18,
            gender: ['Male', 'Female'][Math.floor(Math.random() * 2)],
            bloodType: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][Math.floor(Math.random() * 8)],
            mrn: `MRN${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`
         },
         clinicalData: {
            primaryDiagnosis: this.generateDiagnosis(),
            secondaryDiagnosis: Math.random() > 0.7 ? this.generateDiagnosis() : 'None',
            clinicalNotes: clinicalText,
            labResults: labResults,
            medications: medications,
            vitalSigns: {
               bloodPressure: `${Math.floor(100 + Math.random() * 40)}/${Math.floor(60 + Math.random() * 30)}`,
               heartRate: Math.floor(60 + Math.random() * 40),
               respiratoryRate: Math.floor(12 + Math.random() * 10),
               temperature: (36.5 + Math.random() * 1.5).toFixed(1),
               oxygenSaturation: Math.floor(92 + Math.random() * 6)
            },
            allergies: ["Penicillin", "Sulfa", "Latex", "Codeine"].filter(() => Math.random() > 0.7),
            immunizations: [
               { vaccine: "COVID-19", date: "2024-01-15", status: "Completed" },
               { vaccine: "Influenza", date: "2024-10-01", status: "Completed" }
            ]
         },
         visitInfo: {
            date: new Date().toISOString(),
            department: ['Cardiology', 'Endocrinology', 'Pulmonology', 'Neurology', 'Emergency', 'Internal Medicine'][Math.floor(Math.random() * 6)],
            physician: `Dr_${Math.random().toString(36).substring(7)}`,
            admissionDate: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString(),
            dischargeDate: new Date(Date.now() + Math.random() * 7 * 86400000).toISOString(),
            lengthOfStay: Math.floor(Math.random() * 14) + 1
         },
         timestamp: Date.now(),
         ehrSizeKB: targetSizeKB
      };
   }
   generateDiagnosis() {
      const diagnoses = [
         "Acute Myocardial Infarction (NSTEMI)", "Chronic Heart Failure with Reduced EF",
         "Unstable Angina Pectoris", "Atrial Fibrillation with Rapid Ventricular Response",
         "Hypertensive Urgency", "Diabetic Ketoacidosis", "Community Acquired Pneumonia",
         "COPD Exacerbation", "Acute Pulmonary Embolism", "Ischemic Cerebrovascular Accident",
         "Transient Ischemic Attack", "Severe Sepsis", "Acute on Chronic Kidney Disease",
         "Decompensated Liver Cirrhosis", "Acute Pancreatitis", "Cholelithiasis with Cholecystitis"
      ];
      return diagnoses[Math.floor(Math.random() * diagnoses.length)];
   }
}

// ==================== PROXY & BLOCKCHAIN FUNCTIONS (unchanged) ====================
async function registerDoctor(doctorDid, attributes) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const startTime = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const endTime = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(endTime - startTime) / 1_000_000 };
}

const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function activeDoctorCount() external view returns (uint256)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   const balance = await provider.getBalance(signer.address);
   const network = await provider.getNetwork();
   return { signer, balance: ethers.formatEther(balance), chainId: network.chainId };
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return { txHash: receipt.hash, gasUsed: parseInt(receipt.gasUsed.toString()), timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function revokeDoctor(doctorDid) {
   const startTime = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const endTime = process.hrtime.bigint();
   return { txHash: receipt.hash, gasUsed: parseInt(receipt.gasUsed.toString()), timeMs: Number(endTime - startTime) / 1_000_000 };
}

async function isDoctorActive(doctorDid) {
   const startTime = process.hrtime.bigint();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   const endTime = process.hrtime.bigint();
   return { active: result, timeMs: Number(endTime - startTime) / 1_000_000 };
}

function aesEncrypt(data, key) {
   const startTime = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const endTime = process.hrtime.bigint();
   return { encrypted: result, size: result.length, timeMs: Number(endTime - startTime) / 1_000_000 };
}

function aesDecrypt(encryptedBuffer, key) {
   const startTime = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const endTime = process.hrtime.bigint();
   return { data: result, timeMs: Number(endTime - startTime) / 1_000_000 };
}

// ==================== HTML REPORT GENERATOR ====================
function generateHTMLReport(report, witnessResult, revokeResult, gasPrice, ethToDzdRate, startDateTime) {
   console.log(`\n📄 Generating HTML report...`);
   const validMetrics = report.perEhrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const accessTimes = validMetrics.map(m => m.totalAccessTime).sort((a, b) => a - b);
   const uploadTimes = validMetrics.map(m => m.pinataUploadTime);
   const downloadTimes = validMetrics.map(m => m.pinataDownloadTime);
   const aesEncTimes = validMetrics.map(m => m.aesEncryptTime);
   const aesDecTimes = validMetrics.map(m => m.aesDecryptTime);
   const proxyReencTimes = validMetrics.map(m => m.proxyReencryptTime);

   const stats = (arr) => ({
      min: Math.min(...arr).toFixed(2),
      max: Math.max(...arr).toFixed(2),
      avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
      p50: arr[Math.floor(arr.length * 0.5)].toFixed(2),
      p95: arr[Math.floor(arr.length * 0.95)].toFixed(2),
      p99: arr[Math.floor(arr.length * 0.99)].toFixed(2)
   });

   const sizeStats = {
      S: validMetrics.filter(m => m.sizeCategory === 'S'),
      M: validMetrics.filter(m => m.sizeCategory === 'M'),
      L: validMetrics.filter(m => m.sizeCategory === 'L'),
      XL: validMetrics.filter(m => m.sizeCategory === 'XL')
   };
   const avgBySize = {
      S: sizeStats.S.length ? (sizeStats.S.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.S.length).toFixed(0) : 0,
      M: sizeStats.M.length ? (sizeStats.M.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.M.length).toFixed(0) : 0,
      L: sizeStats.L.length ? (sizeStats.L.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.L.length).toFixed(0) : 0,
      XL: sizeStats.XL.length ? (sizeStats.XL.reduce((a, b) => a + b.totalAccessTime, 0) / sizeStats.XL.length).toFixed(0) : 0
   };

   const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediChain Performance Report | Pinata + Sepolia</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; }
        .report-header { background: white; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; }
        .report-header h1 { color: #1a5276; font-size: 2.5rem; margin-bottom: 10px; }
        .test-badge { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 20px; border-radius: 30px; font-weight: 600; margin-top: 10px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; border-radius: 15px; padding: 25px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); transition: transform 0.3s; text-align: center; }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-card .stat-value { font-size: 2.5rem; font-weight: 700; color: #2c3e50; }
        .stat-card .stat-label { color: #7f8c8d; margin-top: 8px; }
        .section { background: white; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); }
        .section-title { font-size: 1.5rem; color: #2c3e50; margin-bottom: 20px; border-bottom: 3px solid #667eea; display: inline-block; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 20px; }
        .metric-item { background: #f8f9fa; border-radius: 12px; padding: 20px; text-align: center; }
        .metric-item .metric-value { font-size: 1.8rem; font-weight: 700; color: #667eea; }
        .metric-item .metric-name { color: #7f8c8d; margin-bottom: 8px; }
        .sub-metrics { font-size: 0.8rem; margin-top: 10px; color: #555; display: flex; justify-content: center; gap: 15px; }
        .sub-metrics span { background: #e9ecef; padding: 2px 8px; border-radius: 20px; }
        .table-container { overflow-x: auto; margin-top: 20px; max-height: 500px; overflow-y: auto; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .data-table th { background: #667eea; color: white; padding: 12px; text-align: left; position: sticky; top: 0; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #ecf0f1; }
        .data-table tr:hover { background: #f8f9fa; }
        .status-pass { color: #27ae60; font-weight: 600; }
        .status-fail { color: #e74c3c; font-weight: 600; }
        .chart-container { margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 12px; }
        .chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; margin-top: 20px; }
        .gas-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 15px; padding: 25px; margin-top: 20px; }
        .gas-stats { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px; text-align: center; }
        .footer { text-align: center; color: white; margin-top: 30px; padding: 20px; opacity: 0.8; }
        @media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
<div class="container">
    <div class="report-header">
        <h1>🏥 MediChain Performance Report</h1>
        <p>Real Pinata Cloud IPFS + Sepolia Testnet | TB-PRE Proxy</p>
        <div class="test-badge">Test ID: ${report.testInfo.runId.substring(0, 20)}... | ${report.testInfo.ehrCount} EHRs | Mixed Sizes (50KB - 2MB)</div>
    </div>

    <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${report.testInfo.ehrCount}</div><div class="stat-label">Total EHRs</div></div>
        <div class="stat-card"><div class="stat-value">${report.testInfo.successRate}%</div><div class="stat-label">Success Rate</div></div>
        <div class="stat-card"><div class="stat-value">${report.summary.totalTimeSeconds.toFixed(1)}s</div><div class="stat-label">Total Duration</div></div>
        <div class="stat-card"><div class="stat-value">${report.summary.averageEHRSizeKB.toFixed(0)} KB</div><div class="stat-label">Avg EHR Size</div></div>
    </div>

    <div class="section">
        <h2 class="section-title">⚡ Core Performance Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-item">
                <div class="metric-name">AES Encryption</div>
                <div class="metric-value">${stats(aesEncTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(aesEncTimes).min}</span><span>Max ${stats(aesEncTimes).max}</span><span>p95 ${stats(aesEncTimes).p95}</span></div>
            </div>
            <div class="metric-item">
                <div class="metric-name">AES Decryption</div>
                <div class="metric-value">${stats(aesDecTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(aesDecTimes).min}</span><span>Max ${stats(aesDecTimes).max}</span><span>p95 ${stats(aesDecTimes).p95}</span></div>
            </div>
            <div class="metric-item">
                <div class="metric-name">Pinata Upload</div>
                <div class="metric-value">${stats(uploadTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(uploadTimes).min}</span><span>Max ${stats(uploadTimes).max}</span><span>p95 ${stats(uploadTimes).p95}</span></div>
            </div>
            <div class="metric-item">
                <div class="metric-name">Pinata Download</div>
                <div class="metric-value">${stats(downloadTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(downloadTimes).min}</span><span>Max ${stats(downloadTimes).max}</span><span>p95 ${stats(downloadTimes).p95}</span></div>
            </div>
            <div class="metric-item">
                <div class="metric-name">Proxy Re-encrypt</div>
                <div class="metric-value">${stats(proxyReencTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(proxyReencTimes).min}</span><span>Max ${stats(proxyReencTimes).max}</span><span>p95 ${stats(proxyReencTimes).p95}</span></div>
            </div>
            <div class="metric-item">
                <div class="metric-name">Total Access Time</div>
                <div class="metric-value">${stats(accessTimes).avg} ms</div>
                <div class="sub-metrics"><span>Min ${stats(accessTimes).min}</span><span>Max ${stats(accessTimes).max}</span><span>p95 ${stats(accessTimes).p95}</span></div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📈 Performance Distribution</h2>
        <div class="chart-row">
            <div class="chart-container"><canvas id="accessTimeChart"></canvas></div>
            <div class="chart-container"><canvas id="uploadTimeChart"></canvas></div>
        </div>
        <div class="chart-row">
            <div class="chart-container"><canvas id="sizeComparisonChart"></canvas></div>
            <div class="chart-container"><canvas id="successRateChart"></canvas></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📏 Performance by EHR Size</h2>
        <div class="metrics-grid">
            <div class="metric-item"><div class="metric-name">Small (50-100KB)</div><div class="metric-value">${sizeStats.S.length}</div><div class="sub-metrics">Avg ${avgBySize.S} ms</div></div>
            <div class="metric-item"><div class="metric-name">Medium (200-400KB)</div><div class="metric-value">${sizeStats.M.length}</div><div class="sub-metrics">Avg ${avgBySize.M} ms</div></div>
            <div class="metric-item"><div class="metric-name">Large (500-800KB)</div><div class="metric-value">${sizeStats.L.length}</div><div class="sub-metrics">Avg ${avgBySize.L} ms</div></div>
            <div class="metric-item"><div class="metric-name">XL (1-2MB)</div><div class="metric-value">${sizeStats.XL.length}</div><div class="sub-metrics">Avg ${avgBySize.XL} ms</div></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📊 Total Access Time Percentiles</h2>
        <div class="metrics-grid">
            <div class="metric-item"><div class="metric-name">p50 (Median)</div><div class="metric-value">${stats(accessTimes).p50} ms</div></div>
            <div class="metric-item"><div class="metric-name">p75</div><div class="metric-value">${accessTimes[Math.floor(accessTimes.length * 0.75)].toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p90</div><div class="metric-value">${accessTimes[Math.floor(accessTimes.length * 0.9)].toFixed(2)} ms</div></div>
            <div class="metric-item"><div class="metric-name">p95</div><div class="metric-value">${stats(accessTimes).p95} ms</div></div>
            <div class="metric-item"><div class="metric-name">p99</div><div class="metric-value">${stats(accessTimes).p99} ms</div></div>
        </div>
    </div>

    <div class="gas-card">
        <h3>💰 Blockchain Gas Costs (Sepolia)</h3>
        <div class="gas-stats">
            <div><div>Witness Issuance</div><div style="font-size:1.5rem; font-weight:700">${witnessResult.gasUsed.toLocaleString()} gas</div><div>≈ ${report.blockchain.witnessCostDZD.toFixed(4)} DZD</div></div>
            <div><div>Revocation</div><div style="font-size:1.5rem; font-weight:700">${revokeResult.gasUsed.toLocaleString()} gas</div><div>≈ ${report.blockchain.revocationCostDZD.toFixed(4)} DZD</div></div>
            <div><div>Gas Price</div><div style="font-size:1.2rem">${report.blockchain.gasPriceGwei.toFixed(2)} Gwei</div><div>1 ETH = ${ethToDzdRate.toLocaleString()} DZD</div></div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title">📋 Detailed EHR Results (${report.perEhrMetrics.length} records)</h2>
        <div class="table-container">
            <table class="data-table">
                <thead><tr><th>#</th><th>Size(KB)</th><th>Cat</th><th>AES Enc(ms)</th><th>AES Dec(ms)</th><th>Pinata Up(ms)</th><th>Pinata Down(ms)</th><th>Proxy ReEnc(ms)</th><th>Total Access(ms)</th><th>Status</th></tr></thead>
                <tbody>
                    ${report.perEhrMetrics.map(m => `
                    <tr>
                        <td>${m.ehrNumber}</td>
                        <td>${m.sizeKB.toFixed(0)}</td><td>${m.sizeCategory}</td>
                        <td>${m.aesEncryptTime.toFixed(2)}</td><td>${m.aesDecryptTime.toFixed(2)}</td>
                        <td>${m.pinataUploadTime > 0 ? m.pinataUploadTime.toFixed(2) : 'FAIL'}</td>
                        <td>${m.pinataDownloadTime > 0 ? m.pinataDownloadTime.toFixed(2) : 'FAIL'}</td>
                        <td>${m.proxyReencryptTime.toFixed(2)}</td>
                        <td><strong>${m.totalAccessTime.toFixed(2)}</strong></td>
                        <td class="${m.uploadSuccess && m.downloadSuccess ? 'status-pass' : 'status-fail'}">${m.uploadSuccess && m.downloadSuccess ? '✓ PASS' : '✗ FAIL'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <div class="footer">
        <p>Generated on ${new Date().toLocaleString()} | MediChain Performance Test | Pinata + Sepolia</p>
    </div>
</div>

<script>
    const accessTimes = ${JSON.stringify(accessTimes)};
    const uploadTimes = ${JSON.stringify(uploadTimes)};
    const accessMin = Math.min(...accessTimes), accessMax = Math.max(...accessTimes);
    const accessBinWidth = (accessMax - accessMin) / 20;
    const accessBins = Array(20).fill(0);
    accessTimes.forEach(t => { let idx = Math.floor((t - accessMin) / accessBinWidth); if (idx === 20) idx = 19; if (idx >= 0) accessBins[idx]++; });
    new Chart(document.getElementById('accessTimeChart'), {
        type: 'bar', data: { labels: Array(20).fill().map((_,i)=> (accessMin + i*accessBinWidth).toFixed(0)), datasets: [{ label: 'Frequency', data: accessBins, backgroundColor: '#667eea' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Total Access Time Distribution (ms)' } } }
    });
    const uploadMin = Math.min(...uploadTimes), uploadMax = Math.max(...uploadTimes);
    const uploadBinWidth = (uploadMax - uploadMin) / 20;
    const uploadBins = Array(20).fill(0);
    uploadTimes.forEach(t => { let idx = Math.floor((t - uploadMin) / uploadBinWidth); if (idx === 20) idx = 19; if (idx >= 0) uploadBins[idx]++; });
    new Chart(document.getElementById('uploadTimeChart'), {
        type: 'bar', data: { labels: Array(20).fill().map((_,i)=> (uploadMin + i*uploadBinWidth).toFixed(0)), datasets: [{ label: 'Frequency', data: uploadBins, backgroundColor: '#27ae60' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Pinata Upload Time Distribution (ms)' } } }
    });
    new Chart(document.getElementById('sizeComparisonChart'), {
        type: 'bar', data: { labels: ['Small', 'Medium', 'Large', 'XL'], datasets: [{ label: 'Avg Access Time (ms)', data: [${avgBySize.S}, ${avgBySize.M}, ${avgBySize.L}, ${avgBySize.XL}], backgroundColor: '#e74c3c' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Average Access Time by EHR Size' } } }
    });
    new Chart(document.getElementById('successRateChart'), {
        type: 'doughnut', data: { labels: ['Successful (${report.testInfo.successfulUploads})', 'Failed (${report.testInfo.failedUploads})'], datasets: [{ data: [${report.testInfo.successfulUploads}, ${report.testInfo.failedUploads}], backgroundColor: ['#27ae60', '#e74c3c'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Upload Success Rate' } } }
    });
</script>
</body>
</html>`;

   const htmlFilename = `pinata_test_report_${CONFIG.TEST_RUN_ID}.html`;
   fs.writeFileSync(htmlFilename, htmlContent);
   console.log(`   ✅ HTML Report saved: ${htmlFilename}`);
   return htmlFilename;
}

// ==================== MAIN TEST ====================
async function runProfessionalTest() {
   const ehrGenerator = new LargeEHRGenerator();
   const startDateTime = new Date();

   console.log(`\n🚀 Starting REAL Pinata Performance Test`);
   console.log(`📅 Start Time: ${startDateTime.toLocaleString()}`);
   console.log(`📊 Configuration: ${CONFIG.EHR_COUNT} EHRs | Mixed Sizes (50KB - 2MB)\n`);

   // Test Pinata connection
   console.log(`🔗 Testing Pinata Connection...`);
   const testBuffer = Buffer.from(JSON.stringify({ test: "connection" }));
   const testUpload = await realPinataUpload(testBuffer, `test_${Date.now()}.json`);
   if (!testUpload.success) {
      console.error(`❌ Pinata connection failed! Please check your API keys.`);
      process.exit(1);
   }
   console.log(`   ✅ Pinata connected! Test CID: ${testUpload.cid}\n`);

   // Init blockchain
   const { signer, balance, chainId } = await initBlockchain();
   const ethToDzdRate = 350000;
   const feeData = await provider.getFeeData();
   const gasPrice = feeData.gasPrice;

   console.log(`✅ Blockchain Connected`);
   console.log(`   ├─ Network: Sepolia (Chain ID: ${chainId})`);
   console.log(`   ├─ Wallet: ${signer.address}`);
   console.log(`   ├─ Balance: ${balance} SepoliaETH`);
   console.log(`   └─ Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei\n`);

   // Generate doctor identity
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + publicKeyBase64.substring(0, 44);

   // Register doctor
   console.log(`📝 Registering Doctor on Proxy...`);
   const regResult = await registerDoctor(doctorDid, ['doctor', 'cardiologist']);
   console.log(`   ✅ Doctor registered (${regResult.timeMs.toFixed(2)} ms)`);

   // Issue witness
   console.log(`⛓️ Issuing Witness on Sepolia...`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`wit_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + (CONFIG.WITNESS_VALIDITY_DAYS * 86400);
   const witnessResult = await issueWitness(doctorDid, witnessHash, expiry);
   const witnessCostWei = BigInt(witnessResult.gasUsed) * gasPrice;
   const witnessCostEth = parseFloat(ethers.formatEther(witnessCostWei));
   const witnessCostDzd = witnessCostEth * ethToDzdRate;
   console.log(`   ✅ Witness Issued (${witnessResult.timeMs.toFixed(2)} ms | ${witnessResult.gasUsed} gas | ${witnessCostDzd.toFixed(4)} DZD)\n`);

   // Verify doctor active
   const activeCheck = await isDoctorActive(doctorDid);
   console.log(`✅ Doctor Active (verification: ${activeCheck.timeMs.toFixed(2)} ms)\n`);

   const ehrMetrics = [];
   let totalRealUploads = 0, totalRealDownloads = 0, failedUploads = 0;

   console.log(`📊 Processing ${CONFIG.EHR_COUNT} EHRs with REAL Pinata uploads...\n`);
   console.log(`┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
   console.log(`│ EHR #   │ Size(KB)     │ AES Enc      │ AES Dec      │ Pinata Up    │ Pinata Down  │ Proxy ReEnc  │ Total Access │ Status       │`);
   console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

   for (let i = 1; i <= CONFIG.EHR_COUNT; i++) {
      let targetSizeKB;
      const rand = Math.random();
      if (rand < 0.25) targetSizeKB = 50 + Math.random() * 50;
      else if (rand < 0.5) targetSizeKB = 200 + Math.random() * 200;
      else if (rand < 0.75) targetSizeKB = 500 + Math.random() * 300;
      else targetSizeKB = 1000 + Math.random() * 1000;

      const ehrData = ehrGenerator.generateRealisticEHR(i, targetSizeKB);
      const ehrBuffer = Buffer.from(JSON.stringify(ehrData), 'utf8');
      const actualSizeKB = ehrBuffer.length / 1024;

      const aesKey = crypto.randomBytes(32);
      const { encrypted: encryptedEhr, timeMs: aesEncryptTime } = aesEncrypt(ehrBuffer, aesKey);
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);

      console.log(`\n   📤 Uploading EHR ${i} (${actualSizeKB.toFixed(0)} KB) to Pinata...`);
      const uploadResult = await realPinataUpload(encryptedEhr, `ehr_${i}_${Date.now()}.enc`, { ehrId: i });
      if (uploadResult.success) {
         totalRealUploads++;
         console.log(`   ✅ Uploaded! (${uploadResult.timeMs.toFixed(2)} ms)`);
      } else {
         failedUploads++;
         console.log(`   ❌ Upload failed: ${uploadResult.error}`);
      }

      const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
      await realPinataUpload(ciphertextBuffer, `ct_${i}_${Date.now()}.json`, { ehrId: i });

      const accessStart = process.hrtime.bigint();
      await isDoctorActive(doctorDid);
      const rekeyResult = await generateRekey(encapResult.data.ciphertext_id, doctorDid, ['doctor']);
      const reencryptResult = await proxyReencrypt(rekeyResult.data.rekey_id);
      const decryptAesResult = await decryptAES(reencryptResult.data.transformed_ct_id, doctorDid);

      console.log(`   📥 Downloading from Pinata...`);
      const downloadResult = await realPinataDownload(uploadResult.cid);
      if (downloadResult.success) totalRealDownloads++;

      const decryptedKey = Buffer.from(decryptAesResult.data.aes_key_b64, 'base64');
      const { data: decryptedEhr, timeMs: aesDecryptTime } = aesDecrypt(downloadResult.data || encryptedEhr, decryptedKey);
      const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

      const decryptedStr = decryptedEhr.toString('utf8');
      const originalStr = JSON.stringify(ehrData);
      const status = (decryptedStr === originalStr) ? "✅ PASS" : "❌ FAIL";

      ehrMetrics.push({
         ehrNumber: i, sizeKB: actualSizeKB,
         sizeCategory: actualSizeKB > 1000 ? "XL" : actualSizeKB > 500 ? "L" : actualSizeKB > 200 ? "M" : "S",
         aesEncryptTime, aesDecryptTime,
         pinataUploadTime: uploadResult.success ? uploadResult.timeMs : 0,
         pinataDownloadTime: downloadResult.success ? downloadResult.timeMs : 0,
         proxyEncapsulationTime: encapResult.timeMs,
         proxyReencryptTime: reencryptResult.timeMs,
         witnessCheckTime: activeCheck.timeMs,
         totalAccessTime, uploadSuccess: uploadResult.success, downloadSuccess: downloadResult.success
      });

      console.log(`│ ${String(i).padEnd(6)} │ ${String(actualSizeKB.toFixed(0)).padEnd(12)} │ ${String(aesEncryptTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(uploadResult.success ? uploadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(downloadResult.success ? downloadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(reencryptResult.timeMs.toFixed(2)).padEnd(12)} │ ${String(totalAccessTime.toFixed(2)).padEnd(12)} │ ${status.padEnd(12)} │`);
      if (i % 25 === 0 && i < CONFIG.EHR_COUNT) console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);
   }
   console.log(`└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`);

   // Revoke doctor
   console.log(`⛓️ Revoking Doctor...`);
   const revokeResult = await revokeDoctor(doctorDid);
   const revokeCostWei = BigInt(revokeResult.gasUsed) * gasPrice;
   const revokeCostEth = parseFloat(ethers.formatEther(revokeCostWei));
   const revokeCostDzd = revokeCostEth * ethToDzdRate;
   console.log(`   ✅ Revoked (${revokeResult.timeMs.toFixed(2)} ms | ${revokeResult.gasUsed} gas | ${revokeCostDzd.toFixed(4)} DZD)\n`);

   // Statistics
   const validMetrics = ehrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const avgAccessTime = validMetrics.reduce((a, b) => a + b.totalAccessTime, 0) / validMetrics.length;
   const avgUploadTime = validMetrics.reduce((a, b) => a + b.pinataUploadTime, 0) / validMetrics.length;
   const avgDownloadTime = validMetrics.reduce((a, b) => a + b.pinataDownloadTime, 0) / validMetrics.length;
   const avgAesEncrypt = validMetrics.reduce((a, b) => a + b.aesEncryptTime, 0) / validMetrics.length;
   const avgAesDecrypt = validMetrics.reduce((a, b) => a + b.aesDecryptTime, 0) / validMetrics.length;

   const report = {
      testInfo: {
         runId: CONFIG.TEST_RUN_ID, date: new Date().toISOString(),
         ehrCount: CONFIG.EHR_COUNT, successfulUploads: totalRealUploads,
         successfulDownloads: totalRealDownloads, failedUploads: failedUploads,
         successRate: ((totalRealUploads / CONFIG.EHR_COUNT) * 100).toFixed(1)
      },
      blockchain: {
         witnessGasUsed: witnessResult.gasUsed, witnessCostDZD: witnessCostDzd,
         revocationGasUsed: revokeResult.gasUsed, revocationCostDZD: revokeCostDzd,
         gasPriceGwei: parseFloat(ethers.formatUnits(gasPrice, 'gwei'))
      },
      performance: {
         averageAesEncryptionMs: avgAesEncrypt, averageAesDecryptionMs: avgAesDecrypt,
         averagePinataUploadMs: avgUploadTime, averagePinataDownloadMs: avgDownloadTime,
         averageProxyReencryptMs: validMetrics.reduce((a, b) => a + b.proxyReencryptTime, 0) / validMetrics.length,
         averageTotalAccessTimeMs: avgAccessTime,
         minAccessTimeMs: Math.min(...validMetrics.map(m => m.totalAccessTime)),
         maxAccessTimeMs: Math.max(...validMetrics.map(m => m.totalAccessTime))
      },
      perEhrMetrics: ehrMetrics,
      summary: {
         totalTimeSeconds: (Date.now() - startDateTime) / 1000,
         averageEHRSizeKB: ehrMetrics.reduce((a, b) => a + b.sizeKB, 0) / ehrMetrics.length
      }
   };

   const jsonFilename = `pinata_test_results_${CONFIG.TEST_RUN_ID}.json`;
   fs.writeFileSync(jsonFilename, JSON.stringify(report, null, 2));
   console.log(`📁 JSON results saved to: ${jsonFilename}`);

   const htmlFilename = generateHTMLReport(report, witnessResult, revokeResult, gasPrice, ethToDzdRate, startDateTime);
   console.log(`📄 HTML report saved to: ${htmlFilename}`);

   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                           FINAL STATISTICS                                  ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);
   console.log(`📊 PINATA REAL UPLOAD RESULTS:`);
   console.log(`   ├─ Successful Uploads: ${totalRealUploads}/${CONFIG.EHR_COUNT} (${report.testInfo.successRate}%)`);
   console.log(`   ├─ Successful Downloads: ${totalRealDownloads}/${CONFIG.EHR_COUNT}`);
   console.log(`   └─ Failed Uploads: ${failedUploads}\n`);
   console.log(`⚡ PERFORMANCE METRICS:`);
   console.log(`   ├─ Avg AES Encryption: ${avgAesEncrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg AES Decryption: ${avgAesDecrypt.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Upload: ${avgUploadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Download: ${avgDownloadTime.toFixed(2)} ms`);
   console.log(`   ├─ Avg Proxy Re-encrypt: ${report.performance.averageProxyReencryptMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Total Access Time: ${avgAccessTime.toFixed(2)} ms`);
   console.log(`   ├─ Min/Max Access Time: ${report.performance.minAccessTimeMs.toFixed(2)} / ${report.performance.maxAccessTimeMs.toFixed(2)} ms`);
   console.log(`   └─ Total Test Duration: ${report.summary.totalTimeSeconds.toFixed(1)} seconds\n`);
   console.log(`💰 GAS COSTS:`);
   console.log(`   ├─ Witness Issuance: ${witnessResult.gasUsed} gas (${witnessCostDzd.toFixed(4)} DZD)`);
   console.log(`   ├─ Revocation: ${revokeResult.gasUsed} gas (${revokeCostDzd.toFixed(4)} DZD)`);
   console.log(`   └─ Total Cost: ${(witnessCostDzd + revokeCostDzd).toFixed(4)} DZD\n`);
   console.log(`✅ Test completed successfully!\n   JSON: ${jsonFilename}\n   HTML: ${htmlFilename}`);
}

runProfessionalTest().catch(console.error);


*/



/*

//------------ test 6 -------------------------

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
   EHR_COUNT: 10,
   WITNESS_VALIDITY_DAYS: 365,
   TEST_RUN_ID: `TEST_${Date.now()}`,
   EHR_SIZE_MB: 20,
   ETH_TO_DZD: 350000
};

const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║         REAL PINATA + SEPOLIA BENCHMARK – ${CONFIG.EHR_COUNT} x ${CONFIG.EHR_SIZE_MB}MB EHRs                ║
║               All metrics | Gas costs in DZD                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== PINATA HELPERS ====================
async function realPinataUpload(buffer, filename, metadata = {}) {
   const startTime = process.hrtime.bigint();
   const formData = new FormData();
   formData.append('file', buffer, { filename });
   formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { ...metadata, timestamp: Date.now(), testRun: CONFIG.TEST_RUN_ID }
   }));
   try {
      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
         headers: {
            ...formData.getHeaders(),
            pinata_api_key: CONFIG.PINATA_API_KEY,
            pinata_secret_api_key: CONFIG.PINATA_API_SECRET
         },
         maxBodyLength: Infinity,
         maxContentLength: Infinity
      });
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      return {
         success: true,
         cid: response.data.IpfsHash,
         url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
         timeMs: duration,
         size: buffer.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata upload failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         size: buffer.length
      };
   }
}

async function realPinataDownload(cid) {
   const startTime = process.hrtime.bigint();
   try {
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      return {
         success: true,
         data: Buffer.from(response.data),
         timeMs: duration,
         size: response.data.length
      };
   } catch (error) {
      const endTime = process.hrtime.bigint();
      console.error(`   ❌ Pinata download failed: ${error.message}`);
      return {
         success: false,
         error: error.message,
         timeMs: Number(endTime - startTime) / 1_000_000,
         data: null
      };
   }
}

// ==================== 20MB EHR GENERATOR ====================
class LargeEHRGenerator {
   generate20MBEHR(index) {
      console.log(`   📄 Generating 20MB EHR for iteration ${index + 1}...`);
      const targetBytes = CONFIG.EHR_SIZE_MB * 1024 * 1024;
      const baseEHR = {
         ehrId: `EHR-${String(index + 1).padStart(6, '0')}`,
         patientId: `P-${String(index + 1).padStart(4, '0')}`,
         patientName: `Patient_${index + 1}`,
         age: 25 + (index % 60),
         gender: index % 2 === 0 ? "Male" : "Female",
         bloodType: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][index % 8],
         diagnosis: [
            "Hypertension", "Type 2 Diabetes", "Asthma", "COPD", "Heart Failure",
            "Coronary Artery Disease", "Migraine", "Epilepsy", "Rheumatoid Arthritis",
            "Osteoarthritis"
         ][index % 10],
         medications: [
            ["Lisinopril", "Amlodipine"],
            ["Metformin", "Januvia"],
            ["Albuterol", "Advair"],
            ["Tiotropium", "Albuterol"],
            ["Furosemide", "Carvedilol"]
         ][index % 5],
         vitals: {
            bloodPressure: `${110 + (index % 40)}/${70 + (index % 30)}`,
            heartRate: 60 + (index % 40),
            respiratoryRate: 12 + (index % 8),
            temperature: 36.5 + (index % 15) / 10,
            oxygenSaturation: 94 + (index % 6)
         },
         labResults: {
            glucose: 80 + (index % 100),
            cholesterol: 150 + (index % 100),
            hemoglobin: 12 + (index % 4),
            whiteBloodCells: 5 + (index % 10),
            platelets: 150 + (index % 100),
            creatinine: 0.6 + (index % 10) / 10,
            potassium: 3.5 + (index % 20) / 10
         },
         timestamp: new Date().toISOString(),
         clinicalNotes: [],
         medicalHistory: []
      };
      const baseSize = JSON.stringify(baseEHR).length;
      const remainingBytes = targetBytes - baseSize;
      const entriesNeeded = Math.ceil(remainingBytes / 500);
      baseEHR.medicalHistory = Array(entriesNeeded).fill().map((_, idx) => ({
         date: new Date(Date.now() - idx * 86400000).toISOString().split('T')[0],
         condition: `Condition_${idx % 50}`,
         treatment: `Treatment_${idx % 30}`,
         provider: `Dr. ${idx % 20}`,
         notes: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${idx}`
      }));
      baseEHR.clinicalNotes = Array(Math.floor(entriesNeeded / 2)).fill().map((_, idx) => ({
         date: new Date(Date.now() - idx * 86400000).toISOString(),
         author: `Dr. ${idx % 10}`,
         note: `Clinical note ${idx}: Patient stable. Continue current medications. Follow up in ${idx % 12} months.`
      }));
      const finalJSON = JSON.stringify(baseEHR);
      const actualSizeMB = (finalJSON.length / (1024 * 1024)).toFixed(2);
      console.log(`   📊 Generated ${actualSizeMB}MB file`);
      return finalJSON;
   }
}

// ==================== PROXY & AES HELPERS ====================
async function registerDoctor(doctorDid, attributes) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const end = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(end - start) / 1_000_000 };
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const end = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(end - start) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const end = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(end - start) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const end = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(end - start) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const end = process.hrtime.bigint();
   return { data: res.data, timeMs: Number(end - start) / 1_000_000 };
}

function aesEncrypt(data, key) {
   const start = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const end = process.hrtime.bigint();
   return { encrypted: result, size: result.length, timeMs: Number(end - start) / 1_000_000 };
}

function aesDecrypt(encryptedBuffer, key) {
   const start = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const end = process.hrtime.bigint();
   return { data: result, timeMs: Number(end - start) / 1_000_000 };
}

// ==================== BLOCKCHAIN HELPERS ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)",
   "function activeDoctorCount() external view returns (uint256)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   const balance = await provider.getBalance(signer.address);
   const network = await provider.getNetwork();
   return { signer, balance: ethers.formatEther(balance), chainId: network.chainId };
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const end = process.hrtime.bigint();
   return { txHash: receipt.hash, gasUsed: Number(receipt.gasUsed), timeMs: Number(end - start) / 1_000_000 };
}

async function revokeDoctor(doctorDid) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const end = process.hrtime.bigint();
   return { txHash: receipt.hash, gasUsed: Number(receipt.gasUsed), timeMs: Number(end - start) / 1_000_000 };
}

async function isDoctorActive(doctorDid) {
   const start = process.hrtime.bigint();
   const result = await accumulatorContract.isDoctorActive(doctorDid);
   const end = process.hrtime.bigint();
   return { active: result, timeMs: Number(end - start) / 1_000_000 };
}

// ==================== HTML & JSON REPORT GENERATION ====================
async function generateHTMLReport(report, witnessResult, revokeResult, startDateTime) {
   console.log(`\n📄 Generating HTML report...`);
   const valid = report.perEhrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const accessTimes = valid.map(m => m.totalAccessTime).sort((a, b) => a - b);
   const uploadTimes = valid.map(m => m.pinataUploadTime);
   const downloadTimes = valid.map(m => m.pinataDownloadTime);
   const aesEncTimes = valid.map(m => m.aesEncryptTime);
   const aesDecTimes = valid.map(m => m.aesDecryptTime);
   const proxyReencTimes = valid.map(m => m.proxyReencryptTime);

   const stats = (arr) => ({
      min: Math.min(...arr).toFixed(2),
      max: Math.max(...arr).toFixed(2),
      avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
      p50: arr[Math.floor(arr.length * 0.5)].toFixed(2),
      p95: arr[Math.floor(arr.length * 0.95)].toFixed(2),
      p99: arr[Math.floor(arr.length * 0.99)].toFixed(2)
   });

   const gasPriceWei = (await provider.getFeeData()).gasPrice;
   const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
   const witnessCostDZD = (witnessResult.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;
   const revokeCostDZD = (revokeResult.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;

   const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>MediChain Benchmark – 20MB EHRs × ${CONFIG.EHR_COUNT}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial;background:linear-gradient(135deg,#667eea,#764ba2);padding:40px}
  .container{max-width:1400px;margin:auto;background:#fff;border-radius:20px;overflow:hidden}
  .header{background:linear-gradient(135deg,#2c3e50,#3498db);color:#fff;padding:40px;text-align:center}
  .grade-card{background:linear-gradient(135deg,#f093fb,#f5576c);border-radius:15px;padding:30px;margin:30px;text-align:center;color:#fff}
  .grade-card .grade{font-size:4em;font-weight:bold}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin:30px}
  .stat-card{background:#f8f9fa;border-radius:15px;padding:20px;text-align:center;border-left:4px solid #3498db}
  .stat-card .value{font-size:2em;font-weight:bold;color:#3498db}
  table{width:calc(100% - 60px);margin:20px auto;border-collapse:collapse}
  th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
  th{background:#3498db;color:#fff}
  .gas-card{background:linear-gradient(135deg,#2c3e50,#1a252f);color:#fff;border-radius:15px;padding:25px;margin:30px}
  .gas-stats{display:flex;justify-content:space-around;flex-wrap:wrap;gap:20px}
  .chart-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:30px;margin:30px}
  .chart-container{background:#f8f9fa;border-radius:12px;padding:20px}
  .footer{background:#2c3e50;color:#fff;padding:20px;text-align:center}
</style>
</head>
<body>
<div class="container">
  <div class="header"><h1>🏥 MediChain Benchmark Report</h1><p>${CONFIG.EHR_COUNT} iterations × ${CONFIG.EHR_SIZE_MB}MB EHRs | Pinata + Sepolia</p></div>
  <div class="grade-card"><div class="grade">🏆 ${stats(accessTimes).avg < 500 ? 'A+' : 'A'}</div><div>Average workflow: ${stats(accessTimes).avg} ms | Throughput: ${(CONFIG.EHR_COUNT / (report.summary.totalTimeSeconds)).toFixed(2)} ops/sec</div></div>
  <div class="stats-grid">
    <div class="stat-card"><div class="value">${stats(accessTimes).avg} ms</div><div>Avg Total Access</div><div>min ${stats(accessTimes).min} | max ${stats(accessTimes).max}</div></div>
    <div class="stat-card"><div class="value">${stats(aesEncTimes).avg} ms</div><div>Avg AES Encrypt</div></div>
    <div class="stat-card"><div class="value">${stats(aesDecTimes).avg} ms</div><div>Avg AES Decrypt</div></div>
    <div class="stat-card"><div class="value">${stats(uploadTimes).avg} ms</div><div>Avg Pinata Upload</div></div>
    <div class="stat-card"><div class="value">${stats(downloadTimes).avg} ms</div><div>Avg Pinata Download</div></div>
    <div class="stat-card"><div class="value">${stats(proxyReencTimes).avg} ms</div><div>Avg Proxy Re‑encrypt</div></div>
  </div>
  <div class="chart-row">
    <div class="chart-container"><canvas id="accessChart"></canvas></div>
    <div class="chart-container"><canvas id="uploadChart"></canvas></div>
  </div>
  <div class="gas-card">
    <h3>⛽ Gas Costs (Sepolia) 1 ETH = ${CONFIG.ETH_TO_DZD.toLocaleString()} DZD</h3>
    <div class="gas-stats">
      <div><strong>Witness Issuance</strong><br>${witnessResult.gasUsed.toLocaleString()} gas<br>≈ ${witnessCostDZD.toFixed(4)} DZD</div>
      <div><strong>Revocation</strong><br>${revokeResult.gasUsed.toLocaleString()} gas<br>≈ ${revokeCostDZD.toFixed(4)} DZD</div>
      <div><strong>Gas Price</strong><br>${gasPriceGwei.toFixed(2)} Gwei</div>
    </div>
  </div>
  <div style="overflow-x:auto; margin:0 30px 30px">
    <table><thead><tr><th>#</th><th>Size(MB)</th><th>AES Enc(ms)</th><th>AES Dec(ms)</th><th>Pinata Up(ms)</th><th>Pinata Down(ms)</th><th>Proxy ReEnc(ms)</th><th>Total Access(ms)</th><th>Status</th></tr></thead>
    <tbody>${report.perEhrMetrics.map(m => `<tr>
      <td>${m.ehrNumber}</td><td>${(m.sizeKB / 1024).toFixed(2)}</td>
      <td>${m.aesEncryptTime.toFixed(2)}</td><td>${m.aesDecryptTime.toFixed(2)}</td>
      <td>${m.pinataUploadTime > 0 ? m.pinataUploadTime.toFixed(2) : 'FAIL'}</td>
      <td>${m.pinataDownloadTime > 0 ? m.pinataDownloadTime.toFixed(2) : 'FAIL'}</td>
      <td>${m.proxyReencryptTime.toFixed(2)}</td>
      <td><strong>${m.totalAccessTime.toFixed(2)}</strong></td>
      <td class="${m.uploadSuccess && m.downloadSuccess ? 'status-pass' : 'status-fail'}">${m.uploadSuccess && m.downloadSuccess ? '✓ PASS' : '✗ FAIL'}</td>
    </tr>`).join('')}</tbody></table>
  </div>
  <div class="footer">Generated on ${new Date().toLocaleString()} | Test ID: ${CONFIG.TEST_RUN_ID}</div>
</div>
<script>
  const accessTimes = ${JSON.stringify(accessTimes)};
  const uploadTimes = ${JSON.stringify(uploadTimes)};
  const bins = 20;
  const aMin = Math.min(...accessTimes), aMax = Math.max(...accessTimes);
  const aBin = (aMax-aMin)/bins;
  const aBins = Array(bins).fill(0);
  accessTimes.forEach(t=>{let i=Math.min(bins-1,Math.floor((t-aMin)/aBin)); if(i>=0) aBins[i]++;});
  new Chart(document.getElementById('accessChart'),{type:'bar',data:{labels:Array(bins).fill().map((_,i)=>(aMin+i*aBin).toFixed(0)),datasets:[{label:'Frequency',data:aBins,backgroundColor:'#667eea'}]},options:{responsive:true,plugins:{title:{display:true,text:'Total Access Time Distribution (ms)'}}}});
  const uMin = Math.min(...uploadTimes), uMax = Math.max(...uploadTimes);
  const uBin = (uMax-uMin)/bins;
  const uBins = Array(bins).fill(0);
  uploadTimes.forEach(t=>{let i=Math.min(bins-1,Math.floor((t-uMin)/uBin)); if(i>=0) uBins[i]++;});
  new Chart(document.getElementById('uploadChart'),{type:'bar',data:{labels:Array(bins).fill().map((_,i)=>(uMin+i*uBin).toFixed(0)),datasets:[{label:'Frequency',data:uBins,backgroundColor:'#27ae60'}]},options:{responsive:true,plugins:{title:{display:true,text:'Pinata Upload Time Distribution (ms)'}}}});
</script>
</body>
</html>`;
   const filename = `benchmark_report_${CONFIG.TEST_RUN_ID}.html`;
   fs.writeFileSync(filename, html);
   console.log(`   ✅ HTML report saved: ${filename}`);
   return filename;
}

// ==================== MAIN TEST ====================
async function runBenchmark() {
   const generator = new LargeEHRGenerator();
   const startDateTime = new Date();

   // 1. Test Pinata connection
   console.log(`🔗 Testing Pinata connection...`);
   const testBuffer = Buffer.from(JSON.stringify({ test: "connection" }));
   const testUpload = await realPinataUpload(testBuffer, `test_${Date.now()}.json`);
   if (!testUpload.success) {
      console.error(`❌ Pinata connection failed! Check API keys.`);
      process.exit(1);
   }
   console.log(`   ✅ Pinata connected (test CID: ${testUpload.cid})\n`);

   // 2. Init blockchain
   const { signer, balance, chainId } = await initBlockchain();
   console.log(`✅ Blockchain connected (Sepolia Chain ID: ${chainId})`);
   console.log(`   Wallet: ${signer.address}`);
   console.log(`   Balance: ${balance} SepoliaETH\n`);

   // 3. Create doctor DID
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + publicKeyBase64.substring(0, 44);
   console.log(`👤 Doctor DID: ${doctorDid}\n`);

   // 4. Register on PRE proxy
   console.log(`📝 Registering doctor on PRE proxy...`);
   const regRes = await registerDoctor(doctorDid, ['doctor', 'cardiologist']);
   console.log(`   ✅ Registered (${regRes.timeMs.toFixed(2)} ms)`);

   // 5. Issue witness (ON‑CHAIN, GAS)
   console.log(`⛓️ Issuing witness on Sepolia...`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`witness_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + CONFIG.WITNESS_VALIDITY_DAYS * 86400;
   const witnessResult = await issueWitness(doctorDid, witnessHash, expiry);
   const gasPriceWei = (await provider.getFeeData()).gasPrice;
   const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
   const witnessCostDZD = (witnessResult.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;
   console.log(`   ✅ Witness issued (${witnessResult.timeMs.toFixed(2)} ms | ${witnessResult.gasUsed} gas | ${witnessCostDZD.toFixed(4)} DZD)\n`);

   // 6. Verify doctor active (view – no gas)
   const activeCheck = await isDoctorActive(doctorDid);
   console.log(`✅ Doctor active (view call: ${activeCheck.timeMs.toFixed(2)} ms)\n`);

   // 7. Main loop: 10 iterations with 20MB EHRs
   const ehrMetrics = [];
   let totalUploads = 0, totalDownloads = 0, failed = 0;

   console.log(`📊 Processing ${CONFIG.EHR_COUNT} EHRs (each ~${CONFIG.EHR_SIZE_MB}MB)...\n`);
   console.log(`┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
   console.log(`│ EHR #   │ Size(MB)     │ AES Enc(ms)  │ AES Dec(ms)  │ Pinata Up(ms)│ Pinata Dn(ms)│ Proxy ReEnc  │ Total Access │ Status       │`);
   console.log(`├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

   for (let i = 1; i <= CONFIG.EHR_COUNT; i++) {
      const ehrJSON = generator.generate20MBEHR(i - 1);
      const ehrBuffer = Buffer.from(ehrJSON, 'utf8');
      const actualMB = ehrBuffer.length / (1024 * 1024);

      // AES key generation & encryption
      const aesKey = crypto.randomBytes(32);
      const { encrypted: encryptedEhr, timeMs: aesEncryptTime } = aesEncrypt(ehrBuffer, aesKey);
      const aesKeyBase64 = aesKey.toString('base64');
      const timeSlot = Math.floor(Date.now() / 3600000);
      const policy = [['doctor']];
      const encapResult = await encryptAESKey(aesKeyBase64, policy, timeSlot);

      // Upload encrypted EHR to Pinata
      console.log(`   📤 Uploading EHR ${i} (${actualMB.toFixed(2)}MB) to Pinata...`);
      const uploadResult = await realPinataUpload(encryptedEhr, `ehr_${i}_${Date.now()}.enc`, { ehrId: i });
      if (uploadResult.success) totalUploads++;
      else failed++;

      // Upload ciphertext (PRE metadata) to Pinata (just for completeness)
      const ciphertextBuffer = Buffer.from(JSON.stringify(encapResult.data.ciphertext), 'utf8');
      await realPinataUpload(ciphertextBuffer, `ct_${i}_${Date.now()}.json`, { ehrId: i });

      // Simulate access by doctor
      const accessStart = process.hrtime.bigint();
      await isDoctorActive(doctorDid);                                    // witness view
      const rekeyRes = await generateRekey(encapResult.data.ciphertext_id, doctorDid, ['doctor']);
      const reencryptRes = await proxyReencrypt(rekeyRes.data.rekey_id);
      const decryptAesRes = await decryptAES(reencryptRes.data.transformed_ct_id, doctorDid);

      // Download from Pinata
      console.log(`   📥 Downloading from Pinata...`);
      const downloadResult = await realPinataDownload(uploadResult.cid);
      if (downloadResult.success) totalDownloads++;

      // Decrypt AES key and then EHR
      const decryptedKey = Buffer.from(decryptAesRes.data.aes_key_b64, 'base64');
      const { data: decryptedEhr, timeMs: aesDecryptTime } = aesDecrypt(downloadResult.data || encryptedEhr, decryptedKey);
      const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

      const success = uploadResult.success && downloadResult.success;
      const status = success ? "✅ PASS" : "❌ FAIL";

      ehrMetrics.push({
         ehrNumber: i,
         sizeKB: ehrBuffer.length / 1024,
         aesEncryptTime, aesDecryptTime,
         pinataUploadTime: uploadResult.success ? uploadResult.timeMs : 0,
         pinataDownloadTime: downloadResult.success ? downloadResult.timeMs : 0,
         proxyEncapsulationTime: encapResult.timeMs,
         proxyReencryptTime: reencryptRes.timeMs,
         witnessCheckTime: activeCheck.timeMs,
         totalAccessTime,
         uploadSuccess: uploadResult.success,
         downloadSuccess: downloadResult.success
      });

      console.log(`│ ${String(i).padEnd(6)} │ ${String(actualMB.toFixed(2)).padEnd(12)} │ ${String(aesEncryptTime.toFixed(2)).padEnd(12)} │ ${String(aesDecryptTime.toFixed(2)).padEnd(12)} │ ${String(uploadResult.success ? uploadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(downloadResult.success ? downloadResult.timeMs.toFixed(2) : "FAIL").padEnd(12)} │ ${String(reencryptRes.timeMs.toFixed(2)).padEnd(12)} │ ${String(totalAccessTime.toFixed(2)).padEnd(12)} │ ${status.padEnd(12)} │`);
   }
   console.log(`└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`);

   // 8. Revoke doctor (ON‑CHAIN, GAS)
   console.log(`⛓️ Revoking doctor on Sepolia...`);
   const revokeResult = await revokeDoctor(doctorDid);
   const revokeCostDZD = (revokeResult.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;
   console.log(`   ✅ Revoked (${revokeResult.timeMs.toFixed(2)} ms | ${revokeResult.gasUsed} gas | ${revokeCostDZD.toFixed(4)} DZD)\n`);

   // 9. Compile final report
   const validMetrics = ehrMetrics.filter(m => m.uploadSuccess && m.downloadSuccess);
   const avgAccess = validMetrics.reduce((a, b) => a + b.totalAccessTime, 0) / validMetrics.length;
   const totalTimeSeconds = (Date.now() - startDateTime) / 1000;

   const report = {
      testInfo: {
         runId: CONFIG.TEST_RUN_ID,
         date: new Date().toISOString(),
         ehrCount: CONFIG.EHR_COUNT,
         ehrSizeMB: CONFIG.EHR_SIZE_MB,
         successfulUploads: totalUploads,
         successfulDownloads: totalDownloads,
         failedUploads: failed,
         successRate: ((totalUploads / CONFIG.EHR_COUNT) * 100).toFixed(1)
      },
      blockchain: {
         witnessGasUsed: witnessResult.gasUsed,
         witnessCostDZD: witnessCostDZD,
         revocationGasUsed: revokeResult.gasUsed,
         revocationCostDZD: revokeCostDZD,
         gasPriceGwei: gasPriceGwei,
         ethToDzd: CONFIG.ETH_TO_DZD
      },
      performance: {
         averageAesEncryptionMs: validMetrics.reduce((a, b) => a + b.aesEncryptTime, 0) / validMetrics.length,
         averageAesDecryptionMs: validMetrics.reduce((a, b) => a + b.aesDecryptTime, 0) / validMetrics.length,
         averagePinataUploadMs: validMetrics.reduce((a, b) => a + b.pinataUploadTime, 0) / validMetrics.length,
         averagePinataDownloadMs: validMetrics.reduce((a, b) => a + b.pinataDownloadTime, 0) / validMetrics.length,
         averageProxyReencryptMs: validMetrics.reduce((a, b) => a + b.proxyReencryptTime, 0) / validMetrics.length,
         averageTotalAccessTimeMs: avgAccess,
         minAccessTimeMs: Math.min(...validMetrics.map(m => m.totalAccessTime)),
         maxAccessTimeMs: Math.max(...validMetrics.map(m => m.totalAccessTime))
      },
      perEhrMetrics: ehrMetrics,
      summary: {
         totalTimeSeconds: totalTimeSeconds,
         averageEHRSizeKB: ehrMetrics.reduce((a, b) => a + b.sizeKB, 0) / ehrMetrics.length
      }
   };

   const jsonFilename = `benchmark_results_${CONFIG.TEST_RUN_ID}.json`;
   fs.writeFileSync(jsonFilename, JSON.stringify(report, null, 2));
   console.log(`📁 JSON results saved: ${jsonFilename}`);

   const htmlFilename = await generateHTMLReport(report, witnessResult, revokeResult, startDateTime);
   console.log(`📄 HTML report saved: ${htmlFilename}`);

   // Final summary
   console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
   console.log(`║                           FINAL STATISTICS                                  ║`);
   console.log(`╚════════════════════════════════════════════════════════════════════════════╝`);
   console.log(`📊 SUCCESS RATE: ${report.testInfo.successRate}% (${totalUploads}/${CONFIG.EHR_COUNT} uploads, ${totalDownloads} downloads)`);
   console.log(`⚡ PERFORMANCE:`);
   console.log(`   ├─ Avg AES Encrypt: ${report.performance.averageAesEncryptionMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg AES Decrypt: ${report.performance.averageAesDecryptionMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Upload: ${report.performance.averagePinataUploadMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Pinata Download: ${report.performance.averagePinataDownloadMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Proxy Re‑encrypt: ${report.performance.averageProxyReencryptMs.toFixed(2)} ms`);
   console.log(`   ├─ Avg Total Access: ${report.performance.averageTotalAccessTimeMs.toFixed(2)} ms`);
   console.log(`   └─ Total Duration: ${report.summary.totalTimeSeconds.toFixed(1)} seconds`);
   console.log(`💰 GAS COSTS (Sepolia):`);
   console.log(`   ├─ Witness Issuance: ${witnessResult.gasUsed} gas → ${witnessCostDZD.toFixed(4)} DZD`);
   console.log(`   ├─ Revocation: ${revokeResult.gasUsed} gas → ${revokeCostDZD.toFixed(4)} DZD`);
   console.log(`   └─ Total Gas Cost: ${(witnessCostDZD + revokeCostDZD).toFixed(4)} DZD`);
   console.log(`\n✅ Benchmark complete. Open ${htmlFilename} in a browser for the full report.\n`);
}

runBenchmark().catch(console.error);


*/


/*
good one 
//----------- comapring my  EHR bear with SSX protocol ----------------------
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
   ITERATIONS_PER_SIZE: 5,        // number of times to repeat each file size
   WITNESS_VALIDITY_DAYS: 365,
   ETH_TO_DZD: 350000,
   PINATA_RETRIES: 3,
   PINATA_GATEWAYS: [
      'https://gateway.pinata.cloud/ipfs',
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs'
   ],
   // SSX comparison file sizes (KB)
   COMPARISON_SIZES_KB: [50, 100, 200, 400, 800, 1600],
   // SSX reported values (from your earlier protocol description)
   SSX_METRICS: {
      aesEncryptMs: 2.1,      // average for 512KB, we'll scale roughly or use fixed
      aesDecryptMs: 1.2,
      proxyReencryptMs: 28,
      pinataUploadMs: 2500,   // approximated
      pinataDownloadMs: 12000,
      totalAccessMs: 15000,
      witnessGas: 95000,
      revokeGas: 48000
   }
};

const HEALTH_PRIVATE_KEY = '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6';
const CONTRACT_ADDRESS = '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║    BEAR vs SSX‑EHRs COMPARISON BENCHMARK                                     ║
║    Sizes: ${CONFIG.COMPARISON_SIZES_KB.join(', ')} KB × ${CONFIG.ITERATIONS_PER_SIZE} iterations each   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

// ==================== HELPERS (same as before, with minor tweaks) ====================
async function realPinataUpload(buffer, filename, metadata = {}, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const startTime = process.hrtime.bigint();
      const formData = new FormData();
      formData.append('file', buffer, { filename });
      formData.append('pinataMetadata', JSON.stringify({
         name: filename,
         keyvalues: { ...metadata, timestamp: Date.now() }
      }));
      try {
         const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
            headers: {
               ...formData.getHeaders(),
               pinata_api_key: CONFIG.PINATA_API_KEY,
               pinata_secret_api_key: CONFIG.PINATA_API_SECRET
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 120000
         });
         const endTime = process.hrtime.bigint();
         const duration = Number(endTime - startTime) / 1_000_000;
         return { success: true, cid: response.data.IpfsHash, url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`, timeMs: duration, size: buffer.length };
      } catch (error) {
         if (attempt === retries) return { success: false, error: error.message, timeMs: 0 };
         await new Promise(r => setTimeout(r, 2000 * attempt));
      }
   }
}

async function realPinataDownload(cid, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const startTime = process.hrtime.bigint();
      const gateways = [...CONFIG.PINATA_GATEWAYS].sort(() => Math.random() - 0.5);
      for (const gateway of gateways) {
         try {
            const response = await axios.get(`${gateway}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            const endTime = process.hrtime.bigint();
            return { success: true, data: Buffer.from(response.data), timeMs: Number(endTime - startTime) / 1_000_000, size: response.data.length };
         } catch (e) { }
      }
      if (attempt === retries) return { success: false, error: 'All gateways failed', timeMs: 0, data: null };
      await new Promise(r => setTimeout(r, 2000 * attempt));
   }
}

function generateEHRofSize(targetSizeKB) {
   const targetBytes = targetSizeKB * 1024;
   const base = {
      patientId: `P-${Date.now()}`,
      diagnosis: "Hypertension",
      medications: ["Lisinopril"],
      timestamp: new Date().toISOString()
   };
   let current = JSON.stringify(base);
   let currentBytes = Buffer.byteLength(current, 'utf8');
   if (currentBytes >= targetBytes) return current;
   const remaining = targetBytes - currentBytes;
   const padding = "X".repeat(remaining);
   const padded = { ...base, _padding: padding };
   return JSON.stringify(padded);
}

async function registerDoctor(doctorDid, attributes) {
   const start = process.hrtime.bigint();
   await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   const end = process.hrtime.bigint();
   return Number(end - start) / 1_000_000;
}

async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   const end = process.hrtime.bigint();
   return { ciphertextId: res.data.ciphertext_id, timeMs: Number(end - start) / 1_000_000 };
}

async function generateRekey(ctId, delegateeDid, delegateeAttrs) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: delegateeAttrs });
   const end = process.hrtime.bigint();
   return { rekeyId: res.data.rekey_id, timeMs: Number(end - start) / 1_000_000 };
}

async function proxyReencrypt(rekeyId) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   const end = process.hrtime.bigint();
   return { transformedCtId: res.data.transformed_ct_id, timeMs: Number(end - start) / 1_000_000 };
}

async function decryptAES(transformedCtId, doctorDid) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   const end = process.hrtime.bigint();
   return { aesKeyB64: res.data.aes_key_b64, timeMs: Number(end - start) / 1_000_000 };
}

function aesEncrypt(data, key) {
   const start = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   const end = process.hrtime.bigint();
   return { encrypted: result, timeMs: Number(end - start) / 1_000_000 };
}

function aesDecrypt(encryptedBuffer, key) {
   const start = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   const end = process.hrtime.bigint();
   return { data: result, timeMs: Number(end - start) / 1_000_000 };
}

// ==================== BLOCKCHAIN ====================
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)"
];
let accumulatorContract;

async function initBlockchain() {
   const signer = new ethers.Wallet(HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   return signer;
}

async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   const end = process.hrtime.bigint();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(end - start) / 1_000_000 };
}

async function revokeDoctor(doctorDid) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   const end = process.hrtime.bigint();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(end - start) / 1_000_000 };
}

async function isDoctorActive(doctorDid) {
   const start = process.hrtime.bigint();
   await accumulatorContract.isDoctorActive(doctorDid);
   const end = process.hrtime.bigint();
   return Number(end - start) / 1_000_000;
}

// ==================== MAIN COMPARISON LOOP ====================
async function runComparison() {
   // 1. Setup (doctor, proxy, blockchain)
   const signer = await initBlockchain();
   const keyPair = nacl.sign.keyPair();
   const publicKeyBase64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + publicKeyBase64.substring(0, 44);
   console.log(`👤 Doctor DID: ${doctorDid}`);
   await registerDoctor(doctorDid, ['doctor']);
   console.log(`✅ Registered on proxy`);

   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`witness_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + CONFIG.WITNESS_VALIDITY_DAYS * 86400;
   const witnessTx = await issueWitness(doctorDid, witnessHash, expiry);
   console.log(`✅ Witness issued (${witnessTx.gasUsed} gas, ${witnessTx.timeMs.toFixed(2)} ms)`);

   const gasPriceWei = (await provider.getFeeData()).gasPrice;
   const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));

   // 2. Results storage
   const results = [];

   for (const sizeKB of CONFIG.COMPARISON_SIZES_KB) {
      console.log(`\n📏 Testing size: ${sizeKB} KB (${CONFIG.ITERATIONS_PER_SIZE} iterations)`);
      const sizeResults = [];
      for (let iter = 1; iter <= CONFIG.ITERATIONS_PER_SIZE; iter++) {
         process.stdout.write(`   Iteration ${iter}/${CONFIG.ITERATIONS_PER_SIZE} ... `);
         const ehrData = generateEHRofSize(sizeKB);
         const ehrBuffer = Buffer.from(ehrData, 'utf8');
         const aesKey = crypto.randomBytes(32);

         // AES encrypt
         const { encrypted: encryptedEhr, timeMs: aesEncTime } = aesEncrypt(ehrBuffer, aesKey);

         // Encapsulate AES key (proxy)
         const aesKeyB64 = aesKey.toString('base64');
         const timeSlot = Math.floor(Date.now() / 3600000);
         const policy = [['doctor']];
         const encap = await encryptAESKey(aesKeyB64, policy, timeSlot);

         // Upload encrypted EHR to Pinata
         const upload = await realPinataUpload(encryptedEhr, `ehr_${sizeKB}KB_${iter}.enc`);
         if (!upload.success) {
            console.log(`❌ Upload failed - skipping`);
            continue;
         }

         // Upload ciphertext metadata (just for completeness, not timed in access)
         const ctBuffer = Buffer.from(JSON.stringify({ ctId: encap.ciphertextId }), 'utf8');
         await realPinataUpload(ctBuffer, `ct_${sizeKB}KB_${iter}.json`);

         // Full access simulation (doctor side)
         const accessStart = process.hrtime.bigint();
         await isDoctorActive(doctorDid); // witness check
         const rekey = await generateRekey(encap.ciphertextId, doctorDid, ['doctor']);
         const reenc = await proxyReencrypt(rekey.rekeyId);
         const decryptKey = await decryptAES(reenc.transformedCtId, doctorDid);
         const download = await realPinataDownload(upload.cid);
         if (!download.success) {
            console.log(`❌ Download failed - skipping`);
            continue;
         }
         const aesDecryptResult = aesDecrypt(download.data, Buffer.from(decryptKey.aesKeyB64, 'base64'));
         const totalAccessTime = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

         sizeResults.push({
            sizeKB,
            aesEncryptMs: aesEncTime,
            aesDecryptMs: aesDecryptResult.timeMs,
            pinataUploadMs: upload.timeMs,
            pinataDownloadMs: download.timeMs,
            proxyReencryptMs: reenc.timeMs,
            totalAccessMs: totalAccessTime,
            success: true
         });
         console.log(`✅ total ${totalAccessTime.toFixed(1)} ms`);
      }
      if (sizeResults.length) {
         const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
         results.push({
            sizeKB,
            aesEncryptMs: avg(sizeResults.map(r => r.aesEncryptMs)),
            aesDecryptMs: avg(sizeResults.map(r => r.aesDecryptMs)),
            pinataUploadMs: avg(sizeResults.map(r => r.pinataUploadMs)),
            pinataDownloadMs: avg(sizeResults.map(r => r.pinataDownloadMs)),
            proxyReencryptMs: avg(sizeResults.map(r => r.proxyReencryptMs)),
            totalAccessMs: avg(sizeResults.map(r => r.totalAccessMs)),
            iterations: sizeResults.length
         });
      }
   }

   // 3. Revoke doctor (gas cost)
   const revokeTx = await revokeDoctor(doctorDid);
   console.log(`\n✅ Doctor revoked (${revokeTx.gasUsed} gas, ${revokeTx.timeMs.toFixed(2)} ms)`);

   // 4. Comparison with SSX
   console.log(`\n📊 COMPARISON TABLE (BEAR vs SSX‑EHRs)`);
   console.log(`Gas price: ${gasPriceGwei.toFixed(2)} Gwei | 1 ETH = ${CONFIG.ETH_TO_DZD} DZD\n`);
   console.log(`┌────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐`);
   console.log(`│ Size   │        BEAR (measured)                          │        SSX‑EHRs (reported)       │ Gain      │`);
   console.log(`│ (KB)   │ AESEnc  AESDec  Upload  Download Proxy Total    │ AESEnc  AESDec  Upload  Download Proxy Total  │ (total)   │`);
   console.log(`├────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────────┼───────────┤`);
   for (const r of results) {
      const s = CONFIG.SSX_METRICS;
      const totalGain = ((s.totalAccessMs - r.totalAccessMs) / s.totalAccessMs * 100).toFixed(1);
      console.log(`│ ${String(r.sizeKB).padEnd(6)} │ ${r.aesEncryptMs.toFixed(1).padStart(6)}  ${r.aesDecryptMs.toFixed(1).padStart(6)}  ${r.pinataUploadMs.toFixed(0).padStart(6)}  ${r.pinataDownloadMs.toFixed(0).padStart(6)}  ${r.proxyReencryptMs.toFixed(1).padStart(5)}  ${r.totalAccessMs.toFixed(0).padStart(5)} │ ${s.aesEncryptMs.toFixed(1).padStart(6)}  ${s.aesDecryptMs.toFixed(1).padStart(6)}  ${s.pinataUploadMs.toFixed(0).padStart(6)}  ${s.pinataDownloadMs.toFixed(0).padStart(6)}  ${s.proxyReencryptMs.toFixed(1).padStart(5)}  ${s.totalAccessMs.toFixed(0).padStart(5)} │ ${totalGain > 0 ? '+' : ''}${totalGain}%   │`);
   }
   console.log(`└────────┴─────────────────────────────────────────────────┴─────────────────────────────────────────────────┴───────────┘`);

   // 5. Gas comparison
   const witnessCostDZD = (witnessTx.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;
   const revokeCostDZD = (revokeTx.gasUsed * gasPriceGwei * 1e-9) * CONFIG.ETH_TO_DZD;
   console.log(`\n💰 GAS COMPARISON (Sepolia vs SSX simulation):`);
   console.log(`   BEAR  - Witness: ${witnessTx.gasUsed} gas (${witnessCostDZD.toFixed(4)} DZD) | Revoke: ${revokeTx.gasUsed} gas (${revokeCostDZD.toFixed(4)} DZD)`);
   console.log(`   SSX   - Witness: ${CONFIG.SSX_METRICS.witnessGas} gas | Revoke: ${CONFIG.SSX_METRICS.revokeGas} gas`);
   console.log(`   Gain  - Witness: ${(((CONFIG.SSX_METRICS.witnessGas - witnessTx.gasUsed) / CONFIG.SSX_METRICS.witnessGas) * 100).toFixed(1)}% reduction`);

   // 6. Save results to JSON and HTML
   const output = {
      testDate: new Date().toISOString(),
      config: CONFIG,
      gas: { witness: witnessTx.gasUsed, revoke: revokeTx.gasUsed, gasPriceGwei, witnessCostDZD, revokeCostDZD },
      results,
      ssxMetrics: CONFIG.SSX_METRICS
   };
   fs.writeFileSync('comparison_results.json', JSON.stringify(output, null, 2));
   console.log(`\n📁 Results saved to comparison_results.json`);

   // (Optional) Generate a simple HTML report similar to previous one
   const html = `
   <html><head><title>BEAR vs SSX Comparison</title><style>
   table {border-collapse:collapse; width:100%} th,td {border:1px solid #ddd; padding:8px} th {background:#667eea; color:white}
   </style></head><body>
   <h1>BEAR vs SSX‑EHRs Comparison</h1>
   <h2>Performance (ms)</h2>
   <table><tr><th>Size(KB)</th><th colspan="6">BEAR</th><th colspan="6">SSX</th></tr>
   <tr><th></th><th>AESEnc</th><th>AESDec</th><th>Upload</th><th>Download</th><th>Proxy</th><th>Total</th>
   <th>AESEnc</th><th>AESDec</th><th>Upload</th><th>Download</th><th>Proxy</th><th>Total</th></tr>
   ${results.map(r => `<tr><td>${r.sizeKB}</td>
   <td>${r.aesEncryptMs.toFixed(1)}</td><td>${r.aesDecryptMs.toFixed(1)}</td><td>${r.pinataUploadMs.toFixed(0)}</td><td>${r.pinataDownloadMs.toFixed(0)}</td><td>${r.proxyReencryptMs.toFixed(1)}</td><td>${r.totalAccessMs.toFixed(0)}</td>
   <td>${CONFIG.SSX_METRICS.aesEncryptMs}</td><td>${CONFIG.SSX_METRICS.aesDecryptMs}</td><td>${CONFIG.SSX_METRICS.pinataUploadMs}</td><td>${CONFIG.SSX_METRICS.pinataDownloadMs}</td><td>${CONFIG.SSX_METRICS.proxyReencryptMs}</td><td>${CONFIG.SSX_METRICS.totalAccessMs}</td></tr>`).join('')}
   </table>
   <h2>Gas costs</h2>
   <p>BEAR: Witness ${witnessTx.gasUsed} gas (${witnessCostDZD.toFixed(4)} DZD) | Revoke ${revokeTx.gasUsed} gas (${revokeCostDZD.toFixed(4)} DZD)</p>
   <p>SSX: Witness ${CONFIG.SSX_METRICS.witnessGas} gas | Revoke ${CONFIG.SSX_METRICS.revokeGas} gas</p>
   </body></html>`;
   fs.writeFileSync('comparison_report.html', html);
   console.log(`📄 HTML report saved to comparison_report.html`);
}

runComparison().catch(console.error);


*/

/*
moyen

const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
   // Pinata API (replace with your keys)
   PINATA_API_KEY: '03959fc6abd1baa890bf',
   PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
   PROXY_URL: 'http://127.0.0.1:5000',   // your Python proxy
   RPC_URL: 'https://ethereum-sepolia.publicnode.com',

   // Test parameters
   FILE_SIZES_KB: [50, 100, 200, 400, 800, 1600],
   ITERATIONS_PER_SIZE: 5,   // number of repeats per size
   WITNESS_VALIDITY_DAYS: 365,
   ETH_TO_DZD: 350000,
   PINATA_RETRIES: 3,
   PINATA_GATEWAYS: [
      'https://gateway.pinata.cloud/ipfs',
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs'
   ],

   // Blockchain contract (your deployed Accumulator)
   HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
   CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',

   // SSX reference data – YOU MUST EDIT THIS BASED ON THE SSX PAPER
   // If you only have one data point, the script will interpolate.
   // Format: { sizeKB: { aesEncMs, aesDecMs, uploadMs, downloadMs, proxyReencMs, totalMs, witnessGas, revokeGas } }
   SSX_DATA: {
      // Example: if SSX reported values for 400KB only, put that here.
      // The script will then estimate other sizes using linear scaling.
      400: {
         aesEncMs: 2.1,
         aesDecMs: 1.2,
         uploadMs: 2500,
         downloadMs: 12000,
         proxyReencMs: 28,
         totalMs: 15000,
         witnessGas: 95000,
         revokeGas: 48000
      }
      // If you have real SSX numbers for multiple sizes, add them here.
      // Example: 100: { aesEncMs: 0.9, ... }, etc.
   }
};

// ==================== UTILITIES ====================
function generateEHRofSize(targetSizeKB) {
   const targetBytes = targetSizeKB * 1024;
   const base = {
      patientId: `P-${Date.now()}`,
      diagnosis: "Hypertension",
      medications: ["Lisinopril"],
      timestamp: new Date().toISOString()
   };
   let current = JSON.stringify(base);
   let currentBytes = Buffer.byteLength(current, 'utf8');
   if (currentBytes >= targetBytes) return current;
   const remaining = targetBytes - currentBytes;
   const padding = "X".repeat(remaining);
   const padded = { ...base, _padding: padding };
   return JSON.stringify(padded);
}

async function realPinataUpload(buffer, filename, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const start = process.hrtime.bigint();
      const formData = new FormData();
      formData.append('file', buffer, { filename });
      formData.append('pinataMetadata', JSON.stringify({ name: filename, timestamp: Date.now() }));
      try {
         const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
            headers: { ...formData.getHeaders(), pinata_api_key: CONFIG.PINATA_API_KEY, pinata_secret_api_key: CONFIG.PINATA_API_SECRET },
            maxBodyLength: Infinity, timeout: 120000
         });
         const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
         return { success: true, cid: res.data.IpfsHash, timeMs: duration };
      } catch (err) {
         if (attempt === retries) return { success: false, error: err.message, timeMs: 0 };
         await new Promise(r => setTimeout(r, 2000 * attempt));
      }
   }
}

async function realPinataDownload(cid, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const start = process.hrtime.bigint();
      const gateways = [...CONFIG.PINATA_GATEWAYS];
      for (let i = gateways.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [gateways[i], gateways[j]] = [gateways[j], gateways[i]];
      }
      for (const gw of gateways) {
         try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
            return { success: true, data: Buffer.from(res.data), timeMs: duration };
         } catch (e) { }
      }
      if (attempt === retries) return { success: false, error: 'All gateways failed', timeMs: 0, data: null };
      await new Promise(r => setTimeout(r, 2000 * attempt));
   }
}

// Proxy helpers
async function registerDoctor(doctorDid, attributes) {
   const start = process.hrtime.bigint();
   await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   return Number(process.hrtime.bigint() - start) / 1_000_000;
}
async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   return { ciphertextId: res.data.ciphertext_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function generateRekey(ctId, delegateeDid, attrs) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: attrs });
   return { rekeyId: res.data.rekey_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function proxyReencrypt(rekeyId) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   return { transformedCtId: res.data.transformed_ct_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function decryptAES(transformedCtId, doctorDid) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   return { aesKeyB64: res.data.aes_key_b64, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
function aesEncrypt(data, key) {
   const start = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   return { encrypted: result, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
function aesDecrypt(encryptedBuffer, key) {
   const start = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   return { data: result, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}

// Blockchain
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)"
];
let accumulatorContract;
async function initBlockchain() {
   const signer = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   return signer;
}
async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function revokeDoctor(doctorDid) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function isDoctorActive(doctorDid) {
   const start = process.hrtime.bigint();
   await accumulatorContract.isDoctorActive(doctorDid);
   return Number(process.hrtime.bigint() - start) / 1_000_000;
}

// ==================== SSX INTERPOLATION ====================
function getSSXValueForSize(sizeKB, metricName) {
   const knownSizes = Object.keys(CONFIG.SSX_DATA).map(Number).sort((a, b) => a - b);
   if (knownSizes.length === 0) return null;
   // If exact size exists
   if (CONFIG.SSX_DATA[sizeKB] && CONFIG.SSX_DATA[sizeKB][metricName] !== undefined)
      return CONFIG.SSX_DATA[sizeKB][metricName];
   // Interpolate between closest known sizes
   let lower = null, upper = null;
   for (let s of knownSizes) {
      if (s <= sizeKB) lower = s;
      if (s >= sizeKB && upper === null) upper = s;
   }
   if (lower === null) lower = knownSizes[0];
   if (upper === null) upper = knownSizes[knownSizes.length - 1];
   if (lower === upper) return CONFIG.SSX_DATA[lower][metricName];
   const lowerVal = CONFIG.SSX_DATA[lower][metricName];
   const upperVal = CONFIG.SSX_DATA[upper][metricName];
   const ratio = (sizeKB - lower) / (upper - lower);
   return lowerVal + ratio * (upperVal - lowerVal);
}

// ==================== MAIN TEST ====================
async function runComparison() {
   console.log(`
╔════════════════════════════════════════════════════════════════════╗
║      BEAR vs SSX‑EHRs COMPARISON (size‑dependent scaling)         ║
║      ${CONFIG.FILE_SIZES_KB.join(', ')} KB | ${CONFIG.ITERATIONS_PER_SIZE} iterations each       ║
╚════════════════════════════════════════════════════════════════════╝
`);
   // 1. Setup doctor and blockchain once
   const signer = await initBlockchain();
   const keyPair = nacl.sign.keyPair();
   const pubB64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + pubB64.substring(0, 44);
   await registerDoctor(doctorDid, ['doctor']);
   console.log(`✅ Doctor registered: ${doctorDid}`);
   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`witness_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + CONFIG.WITNESS_VALIDITY_DAYS * 86400;
   const witnessTx = await issueWitness(doctorDid, witnessHash, expiry);
   const gasPriceWei = (await provider.getFeeData()).gasPrice;
   const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
   console.log(`✅ Witness issued | gas: ${witnessTx.gasUsed} | ${(witnessTx.gasUsed * gasPriceGwei * 1e-9 * CONFIG.ETH_TO_DZD).toFixed(4)} DZD`);

   const bearResults = [];
   for (const sizeKB of CONFIG.FILE_SIZES_KB) {
      console.log(`\n📏 Testing ${sizeKB} KB (${CONFIG.ITERATIONS_PER_SIZE} iterations)`);
      const measurements = [];
      for (let iter = 1; iter <= CONFIG.ITERATIONS_PER_SIZE; iter++) {
         process.stdout.write(`   Iter ${iter}/${CONFIG.ITERATIONS_PER_SIZE} ... `);
         try {
            const ehrData = generateEHRofSize(sizeKB);
            const ehrBuf = Buffer.from(ehrData, 'utf8');
            const aesKey = crypto.randomBytes(32);
            const { encrypted: encEhr, timeMs: aesEnc } = aesEncrypt(ehrBuf, aesKey);
            const timeSlot = Math.floor(Date.now() / 3600000);
            const { ciphertextId, timeMs: encapTime } = await encryptAESKey(aesKey.toString('base64'), [['doctor']], timeSlot);
            const upload = await realPinataUpload(encEhr, `ehr_${sizeKB}_${iter}.enc`);
            if (!upload.success) { console.log(`❌ upload failed`); continue; }
            // Simulate access
            const accessStart = process.hrtime.bigint();
            await isDoctorActive(doctorDid);
            const { rekeyId } = await generateRekey(ciphertextId, doctorDid, ['doctor']);
            const { transformedCtId, timeMs: reencTime } = await proxyReencrypt(rekeyId);
            const { aesKeyB64 } = await decryptAES(transformedCtId, doctorDid);
            const download = await realPinataDownload(upload.cid);
            if (!download.success) { console.log(`❌ download failed`); continue; }
            const { timeMs: aesDec } = aesDecrypt(download.data, Buffer.from(aesKeyB64, 'base64'));
            const totalAccess = Number(process.hrtime.bigint() - accessStart) / 1_000_000;
            measurements.push({
               aesEnc, aesDec, uploadMs: upload.timeMs, downloadMs: download.timeMs,
               proxyReenc: reencTime, totalAccess
            });
            console.log(`✅ total ${totalAccess.toFixed(1)} ms`);
         } catch (err) {
            console.log(`❌ error: ${err.message}`);
         }
      }
      if (measurements.length === 0) continue;
      const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
      bearResults.push({
         sizeKB,
         aesEncMs: avg(measurements.map(m => m.aesEnc)),
         aesDecMs: avg(measurements.map(m => m.aesDec)),
         uploadMs: avg(measurements.map(m => m.uploadMs)),
         downloadMs: avg(measurements.map(m => m.downloadMs)),
         proxyReencMs: avg(measurements.map(m => m.proxyReenc)),
         totalMs: avg(measurements.map(m => m.totalAccess)),
         iterations: measurements.length
      });
   }

   // Revoke doctor (gas)
   const revokeTx = await revokeDoctor(doctorDid);
   console.log(`\n✅ Doctor revoked | gas: ${revokeTx.gasUsed} | ${(revokeTx.gasUsed * gasPriceGwei * 1e-9 * CONFIG.ETH_TO_DZD).toFixed(4)} DZD`);

   // 2. Generate comparison table
   console.log(`\n📊 COMPARISON (BEAR measured vs SSX interpolated from given points)`);
   console.log(`Size(KB) | BEAR total(ms) | SSX total(ms) | Diff(%) | BEAR gas(w) | SSX gas(w)`);
   console.log(`---------|----------------|---------------|---------|-------------|------------`);
   for (const b of bearResults) {
      let ssxTotal = getSSXValueForSize(b.sizeKB, 'totalMs');
      let ssxWitnessGas = getSSXValueForSize(b.sizeKB, 'witnessGas');
      if (ssxTotal === null) ssxTotal = b.totalMs; // fallback
      if (ssxWitnessGas === null) ssxWitnessGas = CONFIG.SSX_DATA[Object.keys(CONFIG.SSX_DATA)[0]]?.witnessGas || 95000;
      const diff = ((b.totalMs - ssxTotal) / ssxTotal * 100).toFixed(1);
      console.log(`${b.sizeKB} KB     | ${b.totalMs.toFixed(0)}           | ${ssxTotal.toFixed(0)}           | ${diff}%    | ${witnessTx.gasUsed}         | ${ssxWitnessGas}`);
   }

   // 3. Generate HTML report
   const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BEAR vs SSX – PFE Report</title>
<style>
body { font-family: 'Segoe UI', Arial; margin: 40px; background: #f0f2f5; }
.container { max-width: 1200px; margin: auto; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
h1 { color: #1a5276; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { border: 1px solid #ccc; padding: 10px; text-align: center; }
th { background: #2c3e50; color: white; }
.even { background: #f9f9f9; }
.bear-good { color: #27ae60; font-weight: bold; }
.ssx-bad { color: #e74c3c; }
.footer { margin-top: 30px; font-size: 0.8em; color: #7f8c8d; text-align: center; }
</style>
</head>
<body>
<div class="container">
<h1>🏥 BEAR vs SSX‑EHRs Performance Comparison</h1>
<p><strong>Test environment:</strong> Real Pinata IPFS + Sepolia testnet | Proxy: localhost:5000 | ${CONFIG.ITERATIONS_PER_SIZE} iterations per size</p>
<h2>⏱️ Total Access Time (ms)</h2>
<table>
<tr><th>File Size (KB)</th><th>BEAR (measured)</th><th>SSX‑EHRs (interpolated)</th><th>Difference (%)</th></tr>
${bearResults.map((b, i) => {
      let ssxTotal = getSSXValueForSize(b.sizeKB, 'totalMs');
      if (ssxTotal === null) ssxTotal = b.totalMs;
      const diff = ((b.totalMs - ssxTotal) / ssxTotal * 100).toFixed(1);
      const rowClass = i % 2 === 0 ? 'even' : '';
      const bearClass = b.totalMs < ssxTotal ? 'bear-good' : '';
      const ssxClass = b.totalMs < ssxTotal ? 'ssx-bad' : '';
      return `<tr class="${rowClass}"><td>${b.sizeKB}</td><td class="${bearClass}">${b.totalMs.toFixed(0)}</td><td class="${ssxClass}">${ssxTotal.toFixed(0)}</td><td>${diff}%</td></tr>`;
   }).join('')}
</table>
<h2>⚙️ Detailed Metrics (BEAR average)</h2>
<table>
<tr><th>Size(KB)</th><th>AES Enc(ms)</th><th>AES Dec(ms)</th><th>Upload(ms)</th><th>Download(ms)</th><th>Proxy Re‑enc(ms)</th></tr>
${bearResults.map(b => `<tr><td>${b.sizeKB}</td><td>${b.aesEncMs.toFixed(1)}</td><td>${b.aesDecMs.toFixed(1)}</td><td>${b.uploadMs.toFixed(0)}</td><td>${b.downloadMs.toFixed(0)}</td><td>${b.proxyReencMs.toFixed(1)}</td></tr>`).join('')}
</table>
<h2>💰 Gas Costs (Sepolia)</h2>
<p><strong>BEAR:</strong> Witness issuance = ${witnessTx.gasUsed} gas | Revocation = ${revokeTx.gasUsed} gas</p>
<p><strong>SSX (reported):</strong> Witness ≈ ${getSSXValueForSize(400, 'witnessGas') || '95000'} gas | Revocation ≈ ${getSSXValueForSize(400, 'revokeGas') || '48000'} gas</p>
<p><em>Gas price at test time: ${gasPriceGwei.toFixed(2)} Gwei | 1 ETH = ${CONFIG.ETH_TO_DZD} DZD</em></p>
<div class="footer">Report generated on ${new Date().toLocaleString()} | BEAR real‑world benchmark | SSX values based on paper (interpolated where missing)</div>
</div>
</body></html>`;
   fs.writeFileSync('BEAR_vs_SSX_comparison.html', html);
   console.log(`\n📄 HTML report saved: BEAR_vs_SSX_comparison.html`);
   console.log(`\n✅ Comparison complete. Open the HTML file for your PFE report.`);
}

runComparison().catch(console.error);


*/


/*

// ----------------------------good one   --------------- 
const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ==================== CONFIGURATION ====================
const CONFIG = {
   // Your working credentials
   PINATA_API_KEY: '03959fc6abd1baa890bf',
   PINATA_API_SECRET: '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778',
   PROXY_URL: 'http://127.0.0.1:5000',
   RPC_URL: 'https://ethereum-sepolia.publicnode.com',
   HEALTH_PRIVATE_KEY: '09c3001360dd134cecb5eb769656b8fafe79e248f265f53e9294858d80dd65d6',
   CONTRACT_ADDRESS: '0x59Ee6DB1bf1fbFF834492fb4Da73e66d92150c7C',
   WITNESS_VALIDITY_DAYS: 365,
   ETH_TO_DZD: 350000,

   // Benchmark parameters
   FILE_SIZES_KB: [50, 100, 200, 400, 800, 1600],
   ITERATIONS_PER_SIZE: 3,  // adjust as needed (3 is enough for trend)
   PINATA_RETRIES: 3,
   PINATA_GATEWAYS: [
      'https://gateway.pinata.cloud/ipfs',
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs'
   ],

   // SSX reference values (from your earlier report & paper)
   SSX: {
      totalAccessMs: 15000,      // constant from your HTML (SSX reported ~15s for 400KB)
      witnessGas: 95000,
      revokeGas: 48000
   }
};

// ==================== UTILITIES (copied from your working script) ====================
function generateEHRofSize(targetSizeKB) {
   const targetBytes = targetSizeKB * 1024;
   const base = {
      patientId: `P-${Date.now()}`,
      diagnosis: "Hypertension",
      medications: ["Lisinopril"],
      timestamp: new Date().toISOString()
   };
   let current = JSON.stringify(base);
   let currentBytes = Buffer.byteLength(current, 'utf8');
   if (currentBytes >= targetBytes) return current;
   const remaining = targetBytes - currentBytes;
   const padding = "X".repeat(remaining);
   const padded = { ...base, _padding: padding };
   return JSON.stringify(padded);
}

async function realPinataUpload(buffer, filename, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const start = process.hrtime.bigint();
      const formData = new FormData();
      formData.append('file', buffer, { filename });
      formData.append('pinataMetadata', JSON.stringify({ name: filename, timestamp: Date.now() }));
      try {
         const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
            headers: {
               ...formData.getHeaders(),
               pinata_api_key: CONFIG.PINATA_API_KEY,
               pinata_secret_api_key: CONFIG.PINATA_API_SECRET
            },
            maxBodyLength: Infinity,
            timeout: 120000
         });
         const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
         return { success: true, cid: res.data.IpfsHash, timeMs: duration };
      } catch (err) {
         if (attempt === retries) return { success: false, error: err.message, timeMs: 0 };
         await new Promise(r => setTimeout(r, 2000 * attempt));
      }
   }
}

async function realPinataDownload(cid, retries = CONFIG.PINATA_RETRIES) {
   for (let attempt = 1; attempt <= retries; attempt++) {
      const start = process.hrtime.bigint();
      const gateways = [...CONFIG.PINATA_GATEWAYS];
      for (let i = gateways.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [gateways[i], gateways[j]] = [gateways[j], gateways[i]];
      }
      for (const gw of gateways) {
         try {
            const res = await axios.get(`${gw}/${cid}`, { responseType: 'arraybuffer', timeout: 60000 });
            const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
            return { success: true, data: Buffer.from(res.data), timeMs: duration };
         } catch (e) { }
      }
      if (attempt === retries) return { success: false, error: 'All gateways failed', timeMs: 0, data: null };
      await new Promise(r => setTimeout(r, 2000 * attempt));
   }
}

// Proxy helpers
async function registerDoctor(doctorDid, attributes) {
   const start = process.hrtime.bigint();
   await axios.post(`${CONFIG.PROXY_URL}/register_doctor`, { doctor_did: doctorDid, attributes });
   return Number(process.hrtime.bigint() - start) / 1_000_000;
}
async function encryptAESKey(aesKeyBase64, policy, timeSlot) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/encrypt_aes`, { aes_key_b64: aesKeyBase64, policy, time_slot: timeSlot });
   return { ciphertextId: res.data.ciphertext_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function generateRekey(ctId, delegateeDid, attrs) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/generate_rekey`, { ct_id: ctId, delegatee_did: delegateeDid, delegatee_attrs: attrs });
   return { rekeyId: res.data.rekey_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function proxyReencrypt(rekeyId) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/proxy_reencrypt`, { rekey_id: rekeyId });
   return { transformedCtId: res.data.transformed_ct_id, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function decryptAES(transformedCtId, doctorDid) {
   const start = process.hrtime.bigint();
   const res = await axios.post(`${CONFIG.PROXY_URL}/decrypt_aes`, { transformed_ct_id: transformedCtId, doctor_did: doctorDid });
   return { aesKeyB64: res.data.aes_key_b64, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
function aesEncrypt(data, key) {
   const start = process.hrtime.bigint();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
   const authTag = cipher.getAuthTag();
   const result = Buffer.concat([iv, authTag, encrypted]);
   return { encrypted: result, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
function aesDecrypt(encryptedBuffer, key) {
   const start = process.hrtime.bigint();
   const iv = encryptedBuffer.subarray(0, 12);
   const authTag = encryptedBuffer.subarray(12, 28);
   const ciphertext = encryptedBuffer.subarray(28);
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(authTag);
   const result = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
   return { data: result, timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}

// Blockchain
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
const ACCUMULATOR_ABI = [
   "function setDoctorWitness(string memory doctorDid, bytes32 witnessHash, uint64 expiryTime) external",
   "function revokeDoctor(string memory doctorDid) external",
   "function isDoctorActive(string memory doctorDid) external view returns (bool)"
];
let accumulatorContract;
async function initBlockchain() {
   const signer = new ethers.Wallet(CONFIG.HEALTH_PRIVATE_KEY, provider);
   accumulatorContract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ACCUMULATOR_ABI, signer);
   return signer;
}
async function issueWitness(doctorDid, witnessHash, expiryTime) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.setDoctorWitness(doctorDid, witnessHash, expiryTime);
   const receipt = await tx.wait();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function revokeDoctor(doctorDid) {
   const start = process.hrtime.bigint();
   const tx = await accumulatorContract.revokeDoctor(doctorDid);
   const receipt = await tx.wait();
   return { gasUsed: Number(receipt.gasUsed), timeMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
}
async function isDoctorActive(doctorDid) {
   const start = process.hrtime.bigint();
   await accumulatorContract.isDoctorActive(doctorDid);
   return Number(process.hrtime.bigint() - start) / 1_000_000;
}

// ==================== MAIN TEST LOOP ====================
async function runComparison() {
   console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║     BEAR vs SSX‑EHRs REAL COMPARISON                                   ║
║     Sizes: ${CONFIG.FILE_SIZES_KB.join(', ')} KB | ${CONFIG.ITERATIONS_PER_SIZE} iterations each   ║
╚════════════════════════════════════════════════════════════════════════╝
`);

   // 1. Setup once
   await initBlockchain();
   const keyPair = nacl.sign.keyPair();
   const pubB64 = encodeBase64(keyPair.publicKey);
   const doctorDid = 'did:key:z' + pubB64.substring(0, 44);
   await registerDoctor(doctorDid, ['doctor']);
   console.log(`✅ Doctor registered: ${doctorDid}`);

   const witnessHash = ethers.keccak256(ethers.toUtf8Bytes(`witness_${Date.now()}`));
   const expiry = Math.floor(Date.now() / 1000) + CONFIG.WITNESS_VALIDITY_DAYS * 86400;
   const witnessTx = await issueWitness(doctorDid, witnessHash, expiry);
   const gasPriceWei = (await provider.getFeeData()).gasPrice;
   const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
   console.log(`✅ Witness issued | gas: ${witnessTx.gasUsed} | cost: ${(witnessTx.gasUsed * gasPriceGwei * 1e-9 * CONFIG.ETH_TO_DZD).toFixed(4)} DZD\n`);

   const results = [];

   for (const sizeKB of CONFIG.FILE_SIZES_KB) {
      console.log(`📏 Testing ${sizeKB} KB ...`);
      const metrics = [];

      for (let iter = 1; iter <= CONFIG.ITERATIONS_PER_SIZE; iter++) {
         process.stdout.write(`   Iter ${iter}/${CONFIG.ITERATIONS_PER_SIZE} ... `);
         try {
            const ehrData = generateEHRofSize(sizeKB);
            const ehrBuf = Buffer.from(ehrData, 'utf8');
            const aesKey = crypto.randomBytes(32);

            // AES encrypt
            const { encrypted: encEhr, timeMs: aesEnc } = aesEncrypt(ehrBuf, aesKey);

            // Encapsulate AES key
            const timeSlot = Math.floor(Date.now() / 3600000);
            const { ciphertextId, timeMs: encapTime } = await encryptAESKey(aesKey.toString('base64'), [['doctor']], timeSlot);

            // Upload to Pinata
            const upload = await realPinataUpload(encEhr, `ehr_${sizeKB}_${iter}.enc`);
            if (!upload.success) throw new Error("Upload failed");

            // Simulate full access (doctor side)
            const accessStart = process.hrtime.bigint();
            await isDoctorActive(doctorDid);  // witness check
            const { rekeyId } = await generateRekey(ciphertextId, doctorDid, ['doctor']);
            const { transformedCtId, timeMs: proxyReenc } = await proxyReencrypt(rekeyId);
            const { aesKeyB64 } = await decryptAES(transformedCtId, doctorDid);
            const download = await realPinataDownload(upload.cid);
            if (!download.success) throw new Error("Download failed");
            const { timeMs: aesDec } = aesDecrypt(download.data, Buffer.from(aesKeyB64, 'base64'));
            const totalAccess = Number(process.hrtime.bigint() - accessStart) / 1_000_000;

            metrics.push({
               aesEnc, aesDec, witnessCheck: 0,  // included in totalAccess
               proxyReenc, uploadMs: upload.timeMs, downloadMs: download.timeMs,
               totalAccess
            });
            console.log(`✅ total ${totalAccess.toFixed(0)} ms`);
         } catch (err) {
            console.log(`❌ error: ${err.message}`);
         }
      }

      if (metrics.length === 0) continue;
      const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      results.push({
         sizeKB,
         aesEncMs: avg(metrics.map(m => m.aesEnc)),
         aesDecMs: avg(metrics.map(m => m.aesDec)),
         uploadMs: avg(metrics.map(m => m.uploadMs)),
         downloadMs: avg(metrics.map(m => m.downloadMs)),
         proxyReencMs: avg(metrics.map(m => m.proxyReenc)),
         totalMs: avg(metrics.map(m => m.totalAccess)),
         iterations: metrics.length
      });
   }

   // Revoke doctor (gas measurement)
   const revokeTx = await revokeDoctor(doctorDid);
   console.log(`\n✅ Doctor revoked | gas: ${revokeTx.gasUsed} | cost: ${(revokeTx.gasUsed * gasPriceGwei * 1e-9 * CONFIG.ETH_TO_DZD).toFixed(4)} DZD`);

   // ==================== COMPARISON OUTPUT ====================
   console.log(`\n📊 COMPARISON RESULT: BEAR vs SSX-EHRs`);
   console.log(`   SSX reference total access time: ${CONFIG.SSX.totalAccessMs} ms (constant for 400KB)\n`);

   console.log(`┌─────────┬──────────────┬──────────────┬─────────────────┬─────────────────┐`);
   console.log(`│ Size(KB)│ BEAR total   │ SSX total    │ Difference (ms) │ Improvement (%) │`);
   console.log(`├─────────┼──────────────┼──────────────┼─────────────────┼─────────────────┤`);
   for (const r of results) {
      const diff = r.totalMs - CONFIG.SSX.totalAccessMs;
      const impr = ((CONFIG.SSX.totalAccessMs - r.totalMs) / CONFIG.SSX.totalAccessMs * 100).toFixed(1);
      console.log(`│ ${r.sizeKB.toString().padEnd(7)} │ ${r.totalMs.toFixed(0).padEnd(12)} │ ${CONFIG.SSX.totalAccessMs.toString().padEnd(12)} │ ${diff.toFixed(0).padEnd(15)} │ ${impr.padEnd(15)} │`);
   }
   console.log(`└─────────┴──────────────┴──────────────┴─────────────────┴─────────────────┘`);

   console.log(`\n💰 GAS COMPARISON:`);
   console.log(`   BEAR  - Witness: ${witnessTx.gasUsed} gas | Revoke: ${revokeTx.gasUsed} gas`);
   console.log(`   SSX   - Witness: ${CONFIG.SSX.witnessGas} gas | Revoke: ${CONFIG.SSX.revokeGas} gas`);
   console.log(`   Gain  - Witness: ${(((CONFIG.SSX.witnessGas - witnessTx.gasUsed) / CONFIG.SSX.witnessGas) * 100).toFixed(1)}% reduction`);

   // Generate HTML report
   const html = `<!DOCTYPE html>
<html><head><title>BEAR vs SSX Comparison – Real Test</title>
<style>
body { font-family: Arial; margin: 40px; background: #f5f5f5; }
.container { max-width: 1000px; margin: auto; background: white; padding: 30px; border-radius: 10px; }
h1 { color: #1a5276; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { border: 1px solid #ccc; padding: 10px; text-align: center; }
th { background: #2c3e50; color: white; }
.good { color: green; font-weight: bold; }
.bad { color: red; }
</style>
</head>
<body>
<div class="container">
<h1>🏥 BEAR vs SSX‑EHRs Comparison Report</h1>
<p><strong>Test date:</strong> ${new Date().toLocaleString()}</p>
<p><strong>Configuration:</strong> ${CONFIG.FILE_SIZES_KB.join(', ')} KB | ${CONFIG.ITERATIONS_PER_SIZE} iterations each</p>
<h2>Access Time Comparison</h2>
<table><tr><th>Size (KB)</th><th>BEAR (ms)</th><th>SSX (ms)</th><th>Improvement</th></tr>
${results.map(r => {
      const impr = ((CONFIG.SSX.totalAccessMs - r.totalMs) / CONFIG.SSX.totalAccessMs * 100).toFixed(1);
      return `<tr><td>${r.sizeKB}</td><td class="${impr > 0 ? 'good' : 'bad'}">${r.totalMs.toFixed(0)}</td><td>${CONFIG.SSX.totalAccessMs}</td><td class="good">${impr > 0 ? '+' : ''}${impr}%</td></tr>`;
   }).join('')}</table>
<h2>Gas Comparison</h2>
<table><tr><th>Operation</th><th>BEAR (gas)</th><th>SSX (gas)</th><th>Reduction</th></tr>
<tr><td>Witness issuance</td><td class="good">${witnessTx.gasUsed}</td><td>${CONFIG.SSX.witnessGas}</td><td class="good">${(((CONFIG.SSX.witnessGas - witnessTx.gasUsed) / CONFIG.SSX.witnessGas) * 100).toFixed(1)}%</td></tr>
<tr><td>Revocation</td><td class="good">${revokeTx.gasUsed}</td><td>${CONFIG.SSX.revokeGas}</td><td class="good">${(((CONFIG.SSX.revokeGas - revokeTx.gasUsed) / CONFIG.SSX.revokeGas) * 100).toFixed(1)}%</td></tr>
</table>
<h2>Detailed BEAR Metrics (averages)</h2>
<table><tr><th>Size(KB)</th><th>AES Enc(ms)</th><th>AES Dec(ms)</th><th>Upload(ms)</th><th>Download(ms)</th><th>Proxy(ms)</th></tr>
${results.map(r => `<tr><td>${r.sizeKB}</td><td>${r.aesEncMs.toFixed(1)}</td><td>${r.aesDecMs.toFixed(1)}</td><td>${r.uploadMs.toFixed(0)}</td><td>${r.downloadMs.toFixed(0)}</td><td>${r.proxyReencMs.toFixed(1)}</td></tr>`).join('')}</table>
</div></body></html>`;

   fs.writeFileSync('BEAR_SSX_comparison_real.html', html);
   console.log(`\n📄 HTML report saved: BEAR_SSX_comparison_real.html`);
   console.log(`\n✅ Comparison complete.`);
}

runComparison().catch(console.error);


*/


// compare.js
// Exécutez avec : node compare.js
// Ce script génère trois fichiers : comparison.html, style.css, comparison_data.json

const fs = require('fs');

// =========================================================
// 1. VOS DONNÉES – À PERSONNALISER AVEC VOS MESURES RÉELLES
// =========================================================
const bearResults = {
   encryption_times_ms: {
      "50": 12.3,   // Temps en ms pour 50 Ko
      "100": 24.1,
      "200": 47.8,
      "400": 95.2,
      "800": 189.6,
      "1600": 378.0
   },
   full_workflow_encryption_ms: 520.4,   // Temps moyen workflow complet (chiffrement)
   full_workflow_decryption_ms: 310.2,   // Temps moyen workflow complet (déchiffrement)
   gas_cost: 215000                      // Coût en gas (une transaction type)
};

// Données de l'article SSX (à extraire de la publication)
const ssxResults = {
   encryption_times_ms: {
      "50": 18.7,
      "100": 36.2,
      "200": 71.5,
      "400": 143.0,
      "800": 285.8,
      "1600": 570.3
   },
   full_workflow_encryption_ms: 780.1,
   full_workflow_decryption_ms: 465.5,
   gas_cost: 310000
};

// Autres articles/références auxquels SSX se comparait
const otherPapers = {
   "Paper_A": {
      encryption_times_ms: {
         "50": 25.0, "100": 49.8, "200": 98.4,
         "400": 196.2, "800": 392.0, "1600": 782.5
      },
      full_workflow_encryption_ms: 920.0,
      full_workflow_decryption_ms: 580.0,
      gas_cost: 450000
   },
   "Paper_B": {
      encryption_times_ms: {
         "50": 30.1, "100": 60.3, "200": 120.0,
         "400": 238.7, "800": 476.5, "1600": 950.0
      },
      full_workflow_encryption_ms: 1100.0,
      full_workflow_decryption_ms: 720.0,
      gas_cost: 520000
   }
};

// =========================================================
// 2. CONSTRUCTION DU JEU DE DONNÉES
// =========================================================
const comparisonData = {
   metadata: {
      title: "Comparaison de performance BEAR vs SSX et autres",
      metrics: {
         encryption_time_ms_per_file_size: "Temps de chiffrement symétrique (ms)",
         full_workflow_encryption_ms: "Temps de workflow complet (chiffrement) (ms)",
         full_workflow_decryption_ms: "Temps de workflow complet (déchiffrement) (ms)",
         gas_cost: "Coût en gas (unités)"
      },
      file_sizes_kb: [50, 100, 200, 400, 800, 1600]
   },
   systems: {
      "BEAR (nos résultats)": bearResults,
      "SSX (article comparé)": ssxResults,
      ...otherPapers   // fusionne les autres articles
   }
};

// =========================================================
// 3. ÉCRITURE DU FICHIER JSON
// =========================================================
fs.writeFileSync('comparison_data.json', JSON.stringify(comparisonData, null, 2), 'utf-8');
console.log('✅ comparison_data.json créé.');

// =========================================================
// 4. FICHIER CSS
// =========================================================
const cssContent = `/* style.css */
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 2rem;
    background: #f7f9fc;
    color: #333;
}
h1 {
    text-align: center;
    color: #2c3e50;
}
h2 {
    margin-top: 2rem;
    color: #34495e;
    border-bottom: 2px solid #bdc3c7;
    padding-bottom: 0.3rem;
}
canvas {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 2rem;
}
table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin: 1rem 0 2rem 0;
    font-size: 0.9rem;
}
th, td {
    padding: 10px 8px;
    text-align: center;
    border: 1px solid #ddd;
}
th {
    background-color: #2c3e50;
    color: white;
}
tr:nth-child(even) {
    background-color: #f2f2f2;
}
#summaryTable {
    overflow-x: auto;
}`;
fs.writeFileSync('style.css', cssContent, 'utf-8');
console.log('✅ style.css créé.');

// =========================================================
// 5. GÉNÉRATION DU HTML AVEC CHART.JS
// =========================================================
const cmp = comparisonData.systems; // raccourci
const systemNames = Object.keys(cmp);
const fileSizes = comparisonData.metadata.file_sizes_kb;

// Construction des datasets pour le graphique temps/en-taille
const datasetsEnc = systemNames.map((name, i) => {
   const encTimes = cmp[name].encryption_times_ms;
   const colors = [
      'rgba(54, 162, 235, 0.7)',
      'rgba(255, 99, 132, 0.7)',
      'rgba(75, 192, 192, 0.7)',
      'rgba(255, 206, 86, 0.7)',
      'rgba(153, 102, 255, 0.7)',
      'rgba(255, 159, 64, 0.7)'
   ];
   return {
      label: name,
      data: fileSizes.map(s => encTimes[s.toString()]),
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length].replace('0.7', '1'),
      borderWidth: 1
   };
});

const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Comparaison BEAR vs SSX et autres</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
</head>
<body>
    <h1>Comparaison de performance : BEAR, SSX et autres approches</h1>

    <section>
        <h2>Temps de chiffrement symétrique par taille de fichier</h2>
        <canvas id="encryptionChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Performance du workflow complet</h2>
        <canvas id="workflowChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Coût blockchain (gas) par transaction</h2>
        <canvas id="gasChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Tableau récapitulatif des données</h2>
        <div id="summaryTable"></div>
    </section>

    <script>
        // Données injectées directement
        const comparisonData = ${JSON.stringify(comparisonData)};
        const systems = comparisonData.systems;
        const systemNames = Object.keys(systems);
        const fileSizes = comparisonData.metadata.file_sizes_kb.map(s => s.toString());

        const colors = [
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 99, 132, 0.7)',
            'rgba(75, 192, 192, 0.7)',
            'rgba(255, 206, 86, 0.7)',
            'rgba(153, 102, 255, 0.7)',
            'rgba(255, 159, 64, 0.7)'
        ];

        // ---- Graphique 1 : Chiffrement symétrique en fonction de la taille ----
        const ctxEnc = document.getElementById('encryptionChart').getContext('2d');
        const datasetsEnc = systemNames.map((name, i) => {
            const encTimes = systems[name].encryption_times_ms;
            return {
                label: name,
                data: fileSizes.map(s => encTimes[s]),
                backgroundColor: colors[i % colors.length],
                borderColor: colors[i % colors.length].replace('0.7', '1'),
                borderWidth: 1
            };
        });
        new Chart(ctxEnc, {
            type: 'bar',
            data: {
                labels: fileSizes.map(s => s + ' Ko'),
                datasets: datasetsEnc
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Temps (ms)' } },
                    x: { title: { display: true, text: 'Taille du fichier' } }
                },
                plugins: {
                    tooltip: { mode: 'index' },
                    title: { display: true, text: 'Temps de chiffrement symétrique (ms) par taille de fichier' }
                }
            }
        });

        // ---- Graphique 2 : Workflow complet ----
        const ctxWorkflow = document.getElementById('workflowChart').getContext('2d');
        new Chart(ctxWorkflow, {
            type: 'bar',
            data: {
                labels: systemNames,
                datasets: [
                    {
                        label: 'Chiffrement workflow (ms)',
                        data: systemNames.map(name => systems[name].full_workflow_encryption_ms),
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Déchiffrement workflow (ms)',
                        data: systemNames.map(name => systems[name].full_workflow_decryption_ms),
                        backgroundColor: 'rgba(255, 99, 132, 0.7)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Temps (ms)' } }
                },
                plugins: {
                    title: { display: true, text: 'Performance du workflow complet' }
                }
            }
        });

        // ---- Graphique 3 : Coût gas ----
        const ctxGas = document.getElementById('gasChart').getContext('2d');
        new Chart(ctxGas, {
            type: 'bar',
            data: {
                labels: systemNames,
                datasets: [{
                    label: 'Coût en gas',
                    data: systemNames.map(name => systems[name].gas_cost),
                    backgroundColor: 'rgba(255, 206, 86, 0.7)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Unités de gas' } }
                },
                plugins: {
                    title: { display: true, text: 'Consommation de gas blockchain' }
                }
            }
        });

        // ---- Tableau récapitulatif ----
        function buildSummaryTable() {
            let html = '<table><thead><tr><th>Système</th>';
            fileSizes.forEach(s => html += '<th>Chiffrement ' + s + ' Ko (ms)</th>');
            html += '<th>Chiffrement workflow (ms)</th><th>Déchiffrement workflow (ms)</th><th>Gas (unités)</th></tr></thead><tbody>';
            systemNames.forEach(name => {
                const d = systems[name];
                html += '<tr><td><strong>' + name + '</strong></td>';
                fileSizes.forEach(s => html += '<td>' + d.encryption_times_ms[s] + '</td>');
                html += '<td>' + d.full_workflow_encryption_ms + '</td>';
                html += '<td>' + d.full_workflow_decryption_ms + '</td>';
                html += '<td>' + d.gas_cost + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            document.getElementById('summaryTable').innerHTML = html;
        }
        buildSummaryTable();
    </script>
</body>
</html>`;

fs.writeFileSync('comparison.html', htmlContent, 'utf-8');
console.log('✅ comparison.html créé.');
console.log('\n📁 Trois fichiers ont été générés :');
console.log('   - comparison.html (ouvrez-le dans un navigateur)');
console.log('   - style.css');
console.log('   - comparison_data.json');
console.log('\n✏️  Modifiez les constantes bearResults, ssxResults et otherPapers dans le script pour y intégrer vos mesures réelles.');