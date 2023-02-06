const { expect } = require("chai");

describe("OBDex", () => {

    const deploy = async (contractName) => {
        // Contract Factory
        const contractFactory = await hre.ethers.getContractFactory(contractName);
        // Deploy Contract
        const contract = await contractFactory.deploy({gasPrice: 50000000000});
        // Make sure the contracft is deployed
        await contract.deployed();
        
        return {contractFactory, contract};
    }

    const fixture = async () => {
        // Deploy the contracts
        const [dai, bat, rep, zrx] = await Promise.all(
            ["Dai", "Bat", "Rep", "Zrx"].map(contractName => deploy(contractName))
        );
        const obdex = await deploy("OBDex");

        // Add Tokens To OBDex
        await Promise.all([
        [["DAI", dai], ["ZRX", zrx], ["REP", rep], ["BAT", bat]].map(([ticker, token]) => 
            obdex.contract.addToken(
                hre.ethers.utils.formatBytes32String(ticker), // Converting Ticker from String to Bytes32
                token.contract.address
            )
        )]);

        // Seed Traders Accounts
        // --- hardhat accounts
        const [owner, trader1, trader2, trader3, trader4, others] = await ethers.getSigners();
    }

});