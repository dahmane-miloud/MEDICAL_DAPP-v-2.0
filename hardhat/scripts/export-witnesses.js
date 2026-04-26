const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    // === CONFIGURE THESE ===
    const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // your deployed contract
    const DOCTOR_DIDS = [
        "did:key:zSGXDUGemWUD8DNgbLX4I9rILAX0CoM5rbwpQ/OyjWHQ=",
        "did:key:zFNiATZ818nUrHa2v9Po4LTeQ2Y1oOtla1Vj+QColgGI=",
        // add all DIDs that ever got a witness
    ];
    // =========================

    const WitnessABI = require("../artifacts/contracts/WitnessAccumulator.sol/WitnessAccumulator.json").abi;
    const contract = new ethers.Contract(CONTRACT_ADDRESS, WitnessABI, ethers.provider);

    const witnesses = [];
    for (const did of DOCTOR_DIDS) {
        try {
            const [witnessHash, expiryTime] = await contract.getDoctorWitness(did);
            witnesses.push({ did, witnessHash, expiryTime: Number(expiryTime) });
            console.log(`✅ Exported witness for ${did}`);
        } catch (err) {
            console.log(`⚠️ No witness for ${did}`);
        }
    }

    fs.writeFileSync("witness-backup.json", JSON.stringify(witnesses, null, 2));
    console.log(`📁 Saved ${witnesses.length} witnesses to witness-backup.json`);
}

main().catch(console.error);