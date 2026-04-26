// proxy-helper.js
const PROXY_URL = 'http://localhost:5000';

class ProxyHelper {
    // Register a doctor (call this when a doctor signs up, but optional)
    static async registerDoctor(doctorDid, attributes, timeRange) {
        const res = await fetch(`${PROXY_URL}/doctor/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctor_did: doctorDid, attributes, time_range: timeRange })
        });
        return res.json();
    }

    // Encrypt an AES key (represented as a GT element from a string) with a policy and time slot
    static async encryptAESKey(keyBase64, policy, timeSlot) {
        // Policy example: [["doctor"]] or [["cardiology"]]
        // We need to map the AES key to a GT element. The proxy expects a CID string; we will pass the key's hash.
        // But easier: convert the key base64 to a string and use that as "cid" (the proxy maps it to GT via string_to_GT).
        // The proxy's /encrypt expects a CID string, then maps it using string_to_GT.
        // We'll use the key base64 as the "cid".
        const res = await fetch(`${PROXY_URL}/encrypt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid: keyBase64, policy: policy })
        });
        return res.json();
    }

    // Re‑encrypt a ciphertext for current date (or given date)
    static async reencrypt(ciphertext, currentDate) {
        const res = await fetch(`${PROXY_URL}/reencrypt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ciphertext, current_date: currentDate })
        });
        return res.json();
    }

    // Decrypt a re‑encrypted ciphertext to obtain the original AES key (as base64)
    static async decrypt(reencryptedCiphertext, doctorDid, originalKeyBase64) {
        // The proxy's /decrypt requires original_cid (the key base64) to return it.
        // We'll send it.
        const res = await fetch(`${PROXY_URL}/decrypt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reencrypted_ciphertext: reencryptedCiphertext,
                doctor_did: doctorDid,
                original_cid: originalKeyBase64
            })
        });
        return res.json();
    }
}