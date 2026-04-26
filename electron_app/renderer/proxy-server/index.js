const express = require('express');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// In-memory store: encryptedCid -> { originalCid, attribute, expiryTime, secretKey }
const store = new Map();

// Helper: derive a key from attribute + current time (year/month)
function deriveKey(attribute, date) {
    const seed = attribute + '|' + date.year + '-' + date.month;
    return CryptoJS.SHA256(seed).toString();
}

// Encrypt a CID using an attribute and expiry time
app.post('/encrypt', (req, res) => {
    const { cid, policy, expiryTime } = req.body;
    if (!cid || !policy || !policy.length) {
        return res.status(400).json({ success: false, error: 'Missing cid or policy' });
    }
    const attribute = policy[0][0]; // e.g., "cardiology"
    const encryptedCid = 'enc_' + crypto.randomBytes(16).toString('hex');
    // Generate a random secret key for this encryption (simulates PRE master secret)
    const secretKey = crypto.randomBytes(32).toString('hex');
    store.set(encryptedCid, {
        originalCid: cid,
        attribute,
        expiryTime,
        secretKey
    });
    console.log(`[ENCRYPT] ${cid} -> ${encryptedCid} (attr: ${attribute}, expires: ${new Date(expiryTime*1000).toISOString()})`);
    res.json({ success: true, encryptedCid });
});

// Re-encrypt (simulate time-based re-encryption)
app.post('/reencrypt', (req, res) => {
    const { encryptedCid, currentDate } = req.body;
    const entry = store.get(encryptedCid);
    if (!entry) return res.status(404).json({ success: false, error: 'Encrypted CID not found' });
    if (Date.now()/1000 > entry.expiryTime) {
        return res.status(403).json({ success: false, error: 'Access expired' });
    }
    // Derive a key from attribute + current date (year/month)
    const key = deriveKey(entry.attribute, currentDate);
    // Simulate re-encrypted ciphertext: just encrypt the original CID with the derived key
    const reencrypted = CryptoJS.AES.encrypt(entry.originalCid, key).toString();
    res.json({ success: true, reencrypted });
});

// Decrypt for doctor (must provide the same date and attribute)
app.post('/decrypt', (req, res) => {
    const { encryptedCid, doctorDid, attribute, currentDate } = req.body;
    const entry = store.get(encryptedCid);
    if (!entry) return res.status(404).json({ success: false, error: 'Encrypted CID not found' });
    if (Date.now()/1000 > entry.expiryTime) return res.status(403).json({ success: false, error: 'Expired' });
    if (entry.attribute !== attribute) return res.status(403).json({ success: false, error: 'Wrong attribute' });
    const key = deriveKey(attribute, currentDate);
    // In a real system, the proxy would have the re-encrypted ciphertext; here we simulate.
    // We'll just decrypt using the derived key (as if the proxy gave the doctor the key).
    // But to match the flow, we return the original CID directly (since we have it).
    res.json({ success: true, cid: entry.originalCid });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`AB-TB-PRE proxy running on port ${PORT}`));