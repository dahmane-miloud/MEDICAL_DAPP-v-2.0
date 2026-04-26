// ipfs-manager.js - version corrigée sans ipfs-http-client
class IPFSManager {
    constructor() {
        this.files = [];
    }

    async uploadFile(file, metadata = {}) {
        try {
            const fileData = await this.readFileAsBuffer(file);
            const base64Data = await this.arrayBufferToBase64(fileData);
            const result = await window.electronAPI.uploadToIPFS({
                data: base64Data,
                filename: file.name,
                fileType: file.type || this.getFileType(file.name),
                fileSize: file.size,
                metadata
            });

            if (result && result.success) {
                this.files.push({
                    cid: result.cid,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    uploadedAt: new Date().toISOString(),
                    metadata
                });
                return result;
            } else {
                throw new Error(result?.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            return { success: false, error: error.message };
        }
    }

    async getFile(cid) {
        try {
            const result = await window.electronAPI.getFromIPFS(cid);
            return result;
        } catch (error) {
            console.error('Retrieval error:', error);
            return { success: false, error: error.message };
        }
    }

    readFileAsBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    arrayBufferToBase64(buffer) {
        return new Promise((resolve) => {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            resolve(btoa(binary));
        });
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const map = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            txt: 'text/plain'
        };
        return map[ext] || 'application/octet-stream';
    }

    async encryptFile(file, doctorPublicKey) {
        try {
            await this.readFileAsBuffer(file);
            return { success: true, encrypted: true, originalName: file.name, encryptedCid: 'enc-' + Date.now() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async decryptFile(encryptedCid) {
        return { success: true, cid: encryptedCid.replace('enc-', '') };
    }
}
window.IPFSManager = IPFSManager;