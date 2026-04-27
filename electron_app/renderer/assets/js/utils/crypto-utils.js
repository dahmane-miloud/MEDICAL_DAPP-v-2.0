// crypto-utils.js - Clean version
(function () {
    'use strict';

    console.log('Loading CryptoUtils...');

    // Only define if not already defined
    if (window.CryptoUtils && typeof window.CryptoUtils.generateAESKey === 'function') {
        console.log('CryptoUtils already defined and ready');
        return;
    }

    class CryptoUtilsClass {
        static async generateAESKey() {
            console.log('Generating AES key...');
            return await crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256
                },
                true,
                ['encrypt', 'decrypt']
            );
        }

        static async exportKey(key) {
            const raw = await crypto.subtle.exportKey('raw', key);
            return btoa(String.fromCharCode(...new Uint8Array(raw)));
        }

        static async importKey(base64Key) {
            const raw = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await crypto.subtle.importKey(
                'raw',
                raw,
                'AES-GCM',
                true,
                ['encrypt', 'decrypt']
            );
        }

        static async encryptFile(file, key) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const fileData = await file.arrayBuffer();

            const encrypted = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                fileData
            );

            const encryptedArray = new Uint8Array(encrypted);
            const result = new Uint8Array(iv.length + encryptedArray.length);
            result.set(iv);
            result.set(encryptedArray, iv.length);

            return result;
        }

        static async decryptFile(encryptedData, key) {
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                data
            );

            return decrypted;
        }
    }

    // Assign to window
    window.CryptoUtils = CryptoUtilsClass;
    console.log('✅ CryptoUtils loaded successfully');
    console.log('✅ generateAESKey type:', typeof window.CryptoUtils.generateAESKey);
})();