// MediChainCrypto.js - Complete working version
(function () {
    'use strict';

    if (window.MediChainCrypto) return;

    window.MediChainCrypto = {
        async generateAESKey() {
            return await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        },

        async exportKey(key) {
            const raw = await crypto.subtle.exportKey('raw', key);
            return btoa(String.fromCharCode(...new Uint8Array(raw)));
        },

        async importKey(base64Key) {
            const raw = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
        },

        async encryptFile(file, key) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const fileData = await file.arrayBuffer();
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                fileData
            );
            const encryptedArray = new Uint8Array(encrypted);
            const result = new Uint8Array(iv.length + encryptedArray.length);
            result.set(iv);
            result.set(encryptedArray, iv.length);
            return result.buffer; // Return ArrayBuffer, not Uint8Array
        },

        async decryptFile(encryptedData, key) {
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );
            return decrypted;
        }
    };

    console.log('✅ MediChainCrypto loaded');
})();