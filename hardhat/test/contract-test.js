require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

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
        hardhat: {
            chainId: 31337,
            gas: "auto",
            gasPrice: "auto",
            blockGasLimit: 30000000
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 1337,
            gas: "auto",
            gasPrice: "auto"
        }
    }
};