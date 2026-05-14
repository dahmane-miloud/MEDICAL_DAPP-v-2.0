const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Network‑specific RPC URLs (must match your hardhat.config.js)
const NETWORK_RPC = {
  localhost: "http://127.0.0.1:8545",
  sepolia: "https://ethereum-sepolia.publicnode.com",
  // add other networks as needed
};

async function main() {
  const networkName = hre.network.name;
  console.log("\n=========================================");
  console.log(`🚀 Deploying Accumulator Contract to ${networkName}`);
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

  // Determine chainId and RPC URL based on the network
  let chainId;
  try {
    chainId = (await hre.ethers.provider.getNetwork()).chainId;
  } catch (e) {
    chainId = networkName === 'sepolia' ? 11155111 : 1337;
  }
  const rpcUrl = NETWORK_RPC[networkName] || (networkName === 'localhost' ? "http://127.0.0.1:8545" : `https://${networkName}.infura.io/v3/`);

  const config = {
    Accumulator: address,
    rpcUrl: rpcUrl,
    network: networkName,
    chainId: Number(chainId),
    deployedAt: new Date().toISOString()
  };

  // Save to hardhat folder (optional)
  fs.writeFileSync(path.join(__dirname, "../deployment.json"), JSON.stringify(config, null, 2));
  console.log("📁 Saved to: hardhat/deployment.json");

  // Save to electron_app folder – but only if we are deploying to Sepolia or mainnet
  const electronPath = path.join(__dirname, "../../electron_app/main/contracts.json");
  const electronDir = path.dirname(electronPath);
  if (fs.existsSync(electronDir)) {
    // For localhost, we keep the existing file (or you may still overwrite)
    // To prevent accidental overwrites, you can ask for confirmation
    if (networkName !== 'localhost') {
      fs.writeFileSync(electronPath, JSON.stringify(config, null, 2));
      console.log("📁 Saved to: electron_app/main/contracts.json");
    } else {
      console.log("⚠️ Skipping update of electron_app/contracts.json because network is localhost.");
      console.log("   If you really want to use localhost, manually edit the file.");
    }
  }

  console.log("\n=========================================");
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=========================================\n");
}

main().catch(console.error);