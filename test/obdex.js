const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("OBDex", () => {

    const deploy = async (contractName) => {
        // Contract Factory
        const contractFactory = await hre.ethers.getContractFactory(contractName);
        // Deploy Contract
        const contract = await contractFactory.deploy();
        // Make sure the contracft is deployed
        await contract.deployed();
        
        return {contractFactory, contract};
    }

    const seedTraderWallet = async (obdex, trader, tokens, amount) => {
        await tokens.map(async token => {    
            // Mint token for trader
            await token.contract.faucet(trader.address, amount);
            // Approve obdex to spend tokens
            await token.contract.connect(trader).approve(obdex.contract.address, amount);
            
            // Deposit
            //const tokenName = await token.contract.name();
            //const ticker = ethers.utils.formatBytes32String(tokenName);
            //await obdex.contract.connect(trader).deposit(ticker, amount);
            // Balances
            await getTraderBalance(obdex, token, trader);
        });
    }

    const getTraderBalance = async(obdex, token, trader) => {
        const tokenName = await token.contract.name();
        const ticker = ethers.utils.formatBytes32String(tokenName);
        const walletBalance = await trader.getBalance()
        const dexBalances = await obdex.contract.balances(trader.address, ticker);
        console.log("Trader Address:", trader.address);
        console.log("ETH Balance:", walletBalance);
        console.log("DEX Balance:", tokenName, dexBalances);
        return {walletBalance, dexBalances};
    }

    const obdexFixture = async () => {
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

        const tokens = await obdex.contract.getTokens();
        //console.log("tokens:", tokens);

        // Seed Traders Accounts
        const amount = hre.ethers.utils.parseUnits('1000', 'ether');
        // --- hardhat accounts
        const [owner, trader1, trader2, trader3, trader4, others] = await ethers.getSigners();
        await Promise.all([
            [trader1, trader2, trader3, trader4].map(trader => 
                seedTraderWallet(obdex, trader, [dai, bat, rep, zrx], amount)
            )
        ]);
    }

    describe("TEST", () => {

        it("1", async () => {
            await loadFixture(obdexFixture);
        });
        
    });

});