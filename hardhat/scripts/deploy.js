const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy WitnessAccumulator
  const WitnessAccumulator = await hre.ethers.getContractFactory("WitnessAccumulator");
  const witness = await WitnessAccumulator.deploy({ gasLimit: 3000000 });
  await witness.waitForDeployment();
  const witnessAddress = await witness.getAddress();
  console.log("✅ WitnessAccumulator deployed to:", witnessAddress);

  // 2. Deploy AccessControl
  const AccessControl = await hre.ethers.getContractFactory("AccessControl");
  const access = await AccessControl.deploy({ gasLimit: 3000000 });
  await access.waitForDeployment();
  const accessAddress = await access.getAddress();
  console.log("✅ AccessControl deployed to:", accessAddress);

  // 3. Save configuration
  const config = {
    witnessAccumulator: witnessAddress,
    accessControl: accessAddress,
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 1337
  };

  // Write to deployment.json (used by main/index.js)
  fs.writeFileSync("deployment.json", JSON.stringify(config, null, 2));
  console.log("📁 Configuration saved to deployment.json");

  // Also write to contracts.json if your app expects that name (optional)
  const contractsPath = path.join(__dirname, "../electron_app/main/contracts.json");
  if (fs.existsSync(path.dirname(contractsPath))) {
    fs.writeFileSync(contractsPath, JSON.stringify(config, null, 2));
    console.log("📁 Also updated electron_app/main/contracts.json");
  } else {
    console.log("⚠️ electron_app/main/contracts.json not found – copy deployment.json manually.");
  }
}

main().catch(console.error);