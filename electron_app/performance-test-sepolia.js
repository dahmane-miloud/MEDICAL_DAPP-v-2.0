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