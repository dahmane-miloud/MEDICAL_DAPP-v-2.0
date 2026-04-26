// electron_app/main/contracts.js
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

let provider, doctorRegistry, accessControl, accumulator;

async function initContracts() {
  try {
    // Pour ethers v5, le provider s'appelle ethers.providers.JsonRpcProvider
    provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');

    // Vérifier que le fichier des adresses existe
    const contractsPath = path.join(__dirname, '../contracts.json');
    if (!fs.existsSync(contractsPath)) {
      throw new Error('contracts.json not found. Run hardhat deploy first.');
    }
    const addresses = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));

    // Charger les ABIs depuis le dossier abis/
    const DoctorRegistryABI = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../abis/DoctorRegistry.json'), 'utf8')
    );
    const AccessControlABI = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../abis/AccessControl.json'), 'utf8')
    );
    const AccumulatorABI = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../abis/Accumulator.json'), 'utf8')
    );

    // Instancier les contrats
    doctorRegistry = new ethers.Contract(addresses.doctorRegistry, DoctorRegistryABI, provider);
    accessControl = new ethers.Contract(addresses.accessControl, AccessControlABI, provider);
    accumulator = new ethers.Contract(addresses.accumulator, AccumulatorABI, provider);

    console.log('Contracts initialized successfully');
    return { doctorRegistry, accessControl, accumulator, provider };
  } catch (error) {
    console.error('Failed to initialize contracts:', error);
    throw error;
  }
}

function getContracts() {
  return { doctorRegistry, accessControl, accumulator, provider };
}

module.exports = { initContracts, getContracts };