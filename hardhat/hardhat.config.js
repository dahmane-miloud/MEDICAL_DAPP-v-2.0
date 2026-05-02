require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // For the built-in Hardhat network (when you run `npx hardhat node`)
    hardhat: {
      chainId: 31337,  // This matches the default Hardhat node
      mining: {
        auto: true,
        interval: 1000
      }
    },
    // For connecting to an existing Hardhat node
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,  // Change from 1337 to 31337
      gas: "auto",
      gasPrice: "auto"
    }
  }
};