// ipfs-pinata.js - Production IPFS with Pinata
const pinataSDK = require('@pinata/sdk');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class PinataIPFS {
    constructor() {
        // Load credentials from environment variables
        this.apiKey = process.env.PINATA_API_KEY || 'YOUR_API_KEY';
        this.apiSecret = process.env.PINATA_API_SECRET || 'YOUR_API_SECRET';
        this.jwt = process.env.PINATA_JWT || 'YOUR_JWT';

        // Initialize Pinata client
        this.pinata = new pinataSDK(this.apiKey, this.apiSecret);
        this.baseURL = 'https://api.pinata.cloud';

        console.log('✅ Pinata IPFS client initialized');
    }

    // Upload file buffer to IPFS via Pinata
    async uploadFile(buffer, filename, metadata = {}) {
        try {
            const formData = new FormData();
            formData.append('file', buffer, { filename: filename });

            // Add metadata
            const pinataMetadata = {
                name: filename,
                keyvalues: {
                    ...metadata,
                    uploadedAt: new Date().toISOString()
                }
            };
            formData.append('pinataMetadata', JSON.stringify(pinataMetadata));

            // Add options
            const pinataOptions = {
                cidVersion: 1
            };
            formData.append('pinataOptions', JSON.stringify(pinataOptions));

            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinFileToIPFS',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${this.jwt}`
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            return {
                success: true,
                cid: response.data.IpfsHash,
                pinataUrl: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
            };
        } catch (error) {
            console.error('Pinata upload error:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    // Upload JSON data to IPFS
    async uploadJSON(data, name, metadata = {}) {
        try {
            const result = await this.pinata.pinJSONToIPFS(data, {
                pinataMetadata: {
                    name: name,
                    keyvalues: metadata
                }
            });

            return {
                success: true,
                cid: result.IpfsHash,
                pinataUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
            };
        } catch (error) {
            console.error('Pinata JSON upload error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get file from IPFS via Pinata gateway
    async getFile(cid) {
        try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
                responseType: 'arraybuffer'
            });

            return {
                success: true,
                data: Buffer.from(response.data).toString('base64'),
                contentType: response.headers['content-type']
            };
        } catch (error) {
            console.error('Pinata get error:', error);
            return { success: false, error: error.message };
        }
    }

    // Unpin file (remove from Pinata)
    async unpin(cid) {
        try {
            await this.pinata.unpin(cid);
            return { success: true };
        } catch (error) {
            console.error('Unpin error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get pin status
    async getPinStatus(cid) {
        try {
            const result = await this.pinata.pinList({ hashContains: cid, status: 'pinned' });
            return {
                success: true,
                isPinned: result.rows.length > 0,
                pinInfo: result.rows[0]
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = { PinataIPFS };