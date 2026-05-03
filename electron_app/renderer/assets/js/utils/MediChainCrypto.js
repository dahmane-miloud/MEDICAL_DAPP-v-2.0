// MediChainCrypto.js - Complete Fixed Version
(function () {
    'use strict';

    class MediChainCrypto {
        // Generate a random AES-256 key
        static async generateAESKey() {
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            return key;
        }

        // Export AES key to base64
        static async exportKey(key) {
            const raw = await crypto.subtle.exportKey('raw', key);
            const bytes = new Uint8Array(raw);
            const binary = String.fromCharCode(...bytes);
            return btoa(binary);
        }

        // Import AES key from base64
        static async importKey(base64Key) {
            try {
                // Decode base64 to binary string
                const binaryString = atob(base64Key);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                return await crypto.subtle.importKey(
                    'raw',
                    bytes,
                    { name: 'AES-GCM' },
                    true,
                    ['encrypt', 'decrypt']
                );
            } catch (error) {
                console.error('Import key error:', error);
                throw new Error('Failed to import AES key: ' + error.message);
            }
        }

        // Encrypt file data with AES-GCM
        static async encryptFile(data, key) {
            try {
                // Generate random IV (12 bytes for AES-GCM)
                const iv = crypto.getRandomValues(new Uint8Array(12));

                // Make sure data is ArrayBuffer or Uint8Array
                let dataBuffer;
                if (data instanceof ArrayBuffer) {
                    dataBuffer = data;
                } else if (data instanceof Uint8Array) {
                    dataBuffer = data.buffer;
                } else if (data instanceof Blob) {
                    dataBuffer = await data.arrayBuffer();
                } else if (typeof data === 'string') {
                    // Convert string to Uint8Array
                    const encoder = new TextEncoder();
                    dataBuffer = encoder.encode(data).buffer;
                } else {
                    throw new Error('Unsupported data type for encryption');
                }

                // Encrypt the data
                const encrypted = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    dataBuffer
                );

                // Combine IV + ciphertext
                const encryptedArray = new Uint8Array(encrypted);
                const result = new Uint8Array(iv.length + encryptedArray.length);
                result.set(iv, 0);
                result.set(encryptedArray, iv.length);

                return result;
            } catch (error) {
                console.error('Encrypt error:', error);
                throw new Error('Encryption failed: ' + error.message);
            }
        }

        // Decrypt file data with AES-GCM
        static async decryptFile(encryptedData, key) {
            try {
                // encryptedData should be Uint8Array
                let dataArray;
                if (encryptedData instanceof Uint8Array) {
                    dataArray = encryptedData;
                } else if (encryptedData instanceof ArrayBuffer) {
                    dataArray = new Uint8Array(encryptedData);
                } else {
                    throw new Error('Unsupported data type for decryption');
                }

                // Extract IV (first 12 bytes) and ciphertext
                const iv = dataArray.slice(0, 12);
                const ciphertext = dataArray.slice(12);

                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    ciphertext
                );

                return new Uint8Array(decrypted);
            } catch (error) {
                console.error('Decrypt error:', error);
                throw new Error('Decryption failed: ' + error.message);
            }
        }

        // Encrypt a file from File object
        static async encryptFileFromFile(file, key) {
            const data = await file.arrayBuffer();
            return await this.encryptFile(data, key);
        }

        // Decrypt and create downloadable blob
        static async decryptAndDownload(encryptedData, key, originalFilename) {
            const decrypted = await this.decryptFile(encryptedData, key);
            const blob = new Blob([decrypted]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFilename.replace('.enc', '');
            a.click();
            URL.revokeObjectURL(url);
        }

        // Helper: Convert Uint8Array to base64
        static uint8ArrayToBase64(bytes) {
            const binary = String.fromCharCode(...bytes);
            return btoa(binary);
        }

        // Helper: Convert base64 to Uint8Array
        static base64ToUint8Array(base64) {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        }
    }

    // Expose globally
    window.MediChainCrypto = MediChainCrypto;
    console.log('✅ MediChainCrypto loaded successfully');
})();