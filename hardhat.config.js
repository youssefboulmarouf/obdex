require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  networks: {
    localhost: {
      allowUnlimitedContractSize: true,
      gas: 2000000,
      gasPrice: 500000000
    }
  },
  paths: {
    artifacts: 'client/src/artifacts' // Built contracts location
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ]
  }
};
