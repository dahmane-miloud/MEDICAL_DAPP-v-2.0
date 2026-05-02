const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n=========================================");
    console.log("🚀 Deploying Accumulator");
    console.log("=========================================\n");

    const network = hre.network.name;
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];

    console.log(`📡 Network: ${network}`);
    console.log(`🔑 Deployer: ${deployer.address}`);

    const balance = await deployer.provider.getBalance(deployer.address);
    console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

    // Deploy contract
    console.log("📝 Deploying WitnessAccumulator...");
    const WitnessAccumulator = await hre.ethers.getContractFactory("WitnessAccumulator");
    const witnessAccumulator = await WitnessAccumulator.deploy();

    await witnessAccumulator.waitForDeployment();
    const address = await witnessAccumulator.getAddress();

    console.log(`\n✅ Contract deployed to: ${address}\n`);

    // Get chain ID
    const chainId = (await deployer.provider.getNetwork()).chainId;

    // Save deployment info
    const deploymentInfo = {
        network: network,
        witnessAccumulator: address,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        chainId: Number(chainId),
        transactionHash: witnessAccumulator.deploymentTransaction()?.hash
    };

    // Save deployment file
    const deployPath = path.join(__dirname, "../deployment.json");
    fs.writeFileSync(deployPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`📁 Deployment saved to: ${deployPath}`);

    // Also save for Electron app
    const electronConfigPath = path.join(__dirname, "../../electron_app/main/contracts.json");
    const electronConfigDir = path.dirname(electronConfigPath);

    if (!fs.existsSync(electronConfigDir)) {
        fs.mkdirSync(electronConfigDir, { recursive: true });
    }

    // Get RPC URL based on network
    let rpcUrl = "";
    if (network === "localhost" || network === "hardhat") {
        rpcUrl = "http://127.0.0.1:8545";
    } else if (network === "sepolia") {
        rpcUrl = `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY || ""}`;
    } else if (network === "mumbai") {
        rpcUrl = `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_API_KEY || ""}`;
    } else if (network === "goerli") {
        rpcUrl = `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY || ""}`;
    }

    const electronConfig = {
        rpcUrl: rpcUrl,
        witnessAccumulator: address,
        network: network,
        deployedAt: new Date().toISOString(),
        chainId: Number(chainId)
    };

    fs.writeFileSync(electronConfigPath, JSON.stringify(electronConfig, null, 2));
    console.log(`📁 Electron config saved to: ${electronConfigPath}`);

    // Print deployment summary
    console.log("\n=========================================");
    console.log("🎉 Deployment Complete!");
    console.log("=========================================\n");
    console.log("Contract Address:", address);
    console.log("Network:", network);

    if (network !== "hardhat" && network !== "localhost") {
        console.log(`\n🔍 Verify on Explorer:`);
        if (network === "sepolia") {
            console.log(`   https://sepolia.etherscan.io/address/${address}`);
        } else if (network === "mumbai") {
            console.log(`   https://mumbai.polygonscan.com/address/${address}`);
        } else if (network === "goerli") {
            console.log(`   https://goerli.etherscan.io/address/${address}`);
        }
    }

    return { address, network };
}

main().catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exitCode = 1;
});