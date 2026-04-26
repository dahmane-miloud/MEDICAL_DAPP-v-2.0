// src/renderer/assets/js/utils/contract-manager.js
const { ethers } = require('ethers');

class ContractManager {
    constructor() {
        this.provider = null;
        this.doctorRegistry = null;
        this.accessControl = null;
        this.contractAddresses = {
            doctorRegistry: null,
            accessControl: null
        };
    }

    async initialize() {
        // Connect to Hardhat local network
        this.provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        
        // Load contract addresses from deployment
        const deployment = await this.loadDeployment();
        this.contractAddresses = deployment;
        
        // Get contract ABIs
        const doctorRegistryABI = await this.getDoctorRegistryABI();
        const accessControlABI = await this.getAccessControlABI();
        
        this.doctorRegistry = new ethers.Contract(
            this.contractAddresses.doctorRegistry,
            doctorRegistryABI,
            this.provider
        );
        
        this.accessControl = new ethers.Contract(
            this.contractAddresses.accessControl,
            accessControlABI,
            this.provider
        );
        
        return true;
    }

    async loadDeployment() {
        // Load from file or localStorage
        const deployment = localStorage.getItem('contract_deployment');
        if (deployment) {
            return JSON.parse(deployment);
        }
        
        // Default addresses after deployment (update these after running deploy.js)
        return {
            doctorRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            accessControl: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
        };
    }

    async getDoctorRegistryABI() {
        // You should export ABI from compiled contract
        const response = await fetch('/artifacts/contracts/DoctorRegistry.sol/DoctorRegistry.json');
        const data = await response.json();
        return data.abi;
    }

    async getAccessControlABI() {
        const response = await fetch('/artifacts/contracts/AccessControl.sol/AccessControl.json');
        const data = await response.json();
        return data.abi;
    }

    async getDoctorWitness(doctorDid) {
        try {
            const witness = await this.doctorRegistry.getDoctorWitness(doctorDid);
            return witness;
        } catch (error) {
            console.error('Error getting doctor witness:', error);
            throw new Error(`Doctor not found or not active: ${doctorDid}`);
        }
    }

    async isDoctorActive(doctorDid) {
        try {
            return await this.doctorRegistry.isDoctorActive(doctorDid);
        } catch (error) {
            return false;
        }
    }

    async registerDoctor(doctorData, signer) {
        const contractWithSigner = this.doctorRegistry.connect(signer);
        const tx = await contractWithSigner.registerDoctor(
            doctorData.did,
            doctorData.witness,
            doctorData.publicKey,
            doctorData.name,
            doctorData.license,
            doctorData.specialization
        );
        await tx.wait();
        return tx;
    }

    async revokeDoctor(doctorDid, signer) {
        const contractWithSigner = this.doctorRegistry.connect(signer);
        const tx = await contractWithSigner.revokeDoctor(doctorDid);
        await tx.wait();
        return tx;
    }

    async grantAccess(accessData, signer) {
        const contractWithSigner = this.accessControl.connect(signer);
        const tx = await contractWithSigner.grantAccess(
            accessData.patientDid,
            accessData.doctorDid,
            accessData.documentCid,
            accessData.encryptedCid,
            accessData.expiryTime
        );
        await tx.wait();
        return tx;
    }

    async verifyAccess(doctorDid, documentCid) {
        return await this.accessControl.verifyAccess(doctorDid, documentCid);
    }
}

export default new ContractManager();