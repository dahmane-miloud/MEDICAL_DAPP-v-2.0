const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=========================================");
  console.log("🚀 Deploying Accumulator Contract");
  console.log("=========================================\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`📡 Deploying with account: ${deployer.address}`);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

  // Deploy the contract
  console.log("📝 Deploying Accumulator...");
  const Accumulator = await hre.ethers.getContractFactory("Accumulator");
  const accumulator = await Accumulator.deploy();

  await accumulator.waitForDeployment();
  const address = await accumulator.getAddress();

  console.log(`\n✅ Accumulator deployed to: ${address}`);

  // Save config for Electron app
  const config = {
    Accumulator: address,
    rpcUrl: "http://127.0.0.1:8545",
    network: "localhost",
    chainId: 1337,
    deployedAt: new Date().toISOString()
  };

  // Save to hardhat folder
  fs.writeFileSync(path.join(__dirname, "../deployment.json"), JSON.stringify(config, null, 2));
  console.log("📁 Saved to: hardhat/deployment.json");

  // Save to electron_app folder
  const electronPath = path.join(__dirname, "../../electron_app/main/contracts.json");
  const electronDir = path.dirname(electronPath);
  if (fs.existsSync(electronDir)) {
    fs.writeFileSync(electronPath, JSON.stringify(config, null, 2));
    console.log("📁 Saved to: electron_app/main/contracts.json");
  }

  console.log("\n=========================================");
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=========================================\n");
}

main().catch(console.error);