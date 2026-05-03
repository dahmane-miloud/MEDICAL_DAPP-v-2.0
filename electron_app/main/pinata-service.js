// pinata-service.js - Fixed version (metadata values must be strings or numbers)
const axios = require('axios');
const FormData = require('form-data');

class PinataService {
    constructor() {
        this.apiKey = process.env.PINATA_API_KEY || '03959fc6abd1baa890bf';
        this.apiSecret = process.env.PINATA_API_SECRET || '226d0b2203d0fc90f1ce99a0cc0a5eb0950a777c1784e02072c835bf66c51778';

        console.log('✅ Pinata service initialized');
        console.log(`   API Key: ${this.apiKey.substring(0, 10)}...`);
    }

    /**
     * Convert metadata values to strings (Pinata requirement)
     */
    formatMetadata(metadata) {
        const formatted = {};

        // Limit to only the most important keys (max 5 total)
        const allowedKeys = ['originalName', 'recordDate', 'fileType', 'encrypted', 'uploadMethod'];

        for (const key of allowedKeys) {
            if (metadata[key] !== undefined && metadata[key] !== null) {
                if (typeof metadata[key] === 'boolean') {
                    formatted[key] = metadata[key] ? 'true' : 'false';
                } else {
                    formatted[key] = String(metadata[key]);
                }
            }
        }

        // Always add timestamp
        formatted.timestamp = new Date().toISOString();

        console.log(`📝 Metadata keys (${Object.keys(formatted).length}):`, Object.keys(formatted));

        return formatted;
    }
    /**
     * Upload file buffer to IPFS via Pinata
     */
    async uploadFile(buffer, filename, metadata = {}) {
        try {
            const formData = new FormData();

            // Append file
            formData.append('file', buffer, {
                filename: filename,
                contentType: 'application/octet-stream'
            });

            // Format metadata to ensure string/number values only
            const formattedMetadata = this.formatMetadata(metadata);

            // Add metadata
            const pinataMetadata = {
                name: filename,
                keyvalues: {
                    uploadedAt: new Date().toISOString(),
                    ...formattedMetadata
                }
            };
            formData.append('pinataMetadata', JSON.stringify(pinataMetadata));

            // Add options
            const pinataOptions = {
                cidVersion: 1
            };
            formData.append('pinataOptions', JSON.stringify(pinataOptions));

            // Upload to Pinata using API Key + Secret
            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinFileToIPFS',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'pinata_api_key': this.apiKey,
                        'pinata_secret_api_key': this.apiSecret
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 60000
                }
            );

            const cid = response.data.IpfsHash;
            const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

            console.log(`✅ File uploaded to Pinata: ${cid}`);
            console.log(`   URL: ${url}`);

            return {
                success: true,
                cid: cid,
                url: url,
                pinataUrl: url
            };
        } catch (error) {
            console.error('Pinata upload error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error || error.message
            };
        }
    }

    /**
     * Upload JSON data to IPFS
     */
    async uploadJSON(data, name, metadata = {}) {
        try {
            const formattedMetadata = this.formatMetadata(metadata);

            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinJSONToIPFS',
                {
                    pinataContent: data,
                    pinataMetadata: {
                        name: name,
                        keyvalues: {
                            uploadedAt: new Date().toISOString(),
                            ...formattedMetadata
                        }
                    },
                    pinataOptions: {
                        cidVersion: 1
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'pinata_api_key': this.apiKey,
                        'pinata_secret_api_key': this.apiSecret
                    }
                }
            );

            const cid = response.data.IpfsHash;
            const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

            console.log(`✅ JSON uploaded to Pinata: ${cid}`);

            return {
                success: true,
                cid: cid,
                url: url
            };
        } catch (error) {
            console.error('Pinata JSON upload error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error || error.message
            };
        }
    }

    /**
     * Get file from IPFS via Pinata gateway
     */
    async getFile(cid) {
        try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            return {
                success: true,
                data: Buffer.from(response.data),
                contentType: response.headers['content-type']
            };
        } catch (error) {
            console.error('Pinata get error:', error.message);

            // Try alternative gateway
            try {
                const response = await axios.get(`https://ipfs.io/ipfs/${cid}`, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                return {
                    success: true,
                    data: Buffer.from(response.data),
                    contentType: response.headers['content-type']
                };
            } catch (err) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    }

    /**
     * Unpin file from Pinata
     */
    async unpin(cid) {
        try {
            await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.apiSecret
                }
            });

            console.log(`✅ Unpinned: ${cid}`);
            return { success: true };
        } catch (error) {
            console.error('Unpin error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if CID is pinned
     */
    async isPinned(cid) {
        try {
            const response = await axios.get(
                `https://api.pinata.cloud/data/pinList?hashContains=${cid}&status=pinned`,
                {
                    headers: {
                        'pinata_api_key': this.apiKey,
                        'pinata_secret_api_key': this.apiSecret
                    }
                }
            );

            return {
                success: true,
                isPinned: response.data.count > 0
            };
        } catch (error) {
            return { success: false, isPinned: false };
        }
    }

    /**
     * Get pinning statistics
     */
    async getStats() {
        try {
            const response = await axios.get(
                'https://api.pinata.cloud/data/userPinnedDataTotal',
                {
                    headers: {
                        'pinata_api_key': this.apiKey,
                        'pinata_secret_api_key': this.apiSecret
                    }
                }
            );

            return {
                success: true,
                pinCount: response.data.pin_count,
                pinSizeTotal: response.data.pin_size_total
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = { PinataService };