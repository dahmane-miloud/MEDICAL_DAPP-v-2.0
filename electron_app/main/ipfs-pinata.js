// pinata-service.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

class PinataService {
    constructor() {
        this.apiKey = process.env.PINATA_API_KEY;
        this.apiSecret = process.env.PINATA_API_SECRET;
        this.jwt = process.env.PINATA_JWT;
        this.baseURL = 'https://api.pinata.cloud';

        if (!this.apiKey || !this.apiSecret || !this.jwt) {
            console.warn('⚠️ Pinata credentials not found. Please check .env file');
        } else {
            console.log('✅ Pinata service initialized');
        }
    }

    async uploadToIPFS(buffer, filename, metadata = {}) {
        try {
            const formData = new FormData();
            formData.append('file', buffer, { filename });

            formData.append('pinataMetadata', JSON.stringify({
                name: filename,
                keyvalues: {
                    ...metadata,
                    uploadedAt: new Date().toISOString()
                }
            }));

            formData.append('pinataOptions', JSON.stringify({
                cidVersion: 1
            }));

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

    async getFromIPFS(cid) {
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
            console.error('Pinata get error:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = { PinataService };