// // We require the Hardhat Runtime Environment explicitly here. This is optional
// // but useful for running the script in a standalone fashion through `node <script>`.
// //
// // You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// // will compile your contracts, add the Hardhat Runtime Environment's members to the
// // global scope, and execute the script.
const fs = require('fs');
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const ORDER_SIDE = {BUY: 0, SELL: 1};
const ORDER_TYPE = {MARKET: 0, LIMIT: 1};

const amount = hre.ethers.utils.parseUnits('1000', 'ether');
const [DAI, BAT, REP, ZRX] = ["DAI", "BAT", "REP", "ZRX"].map(tokenName => hre.ethers.utils.formatBytes32String(tokenName));

const deploy = async (contractName) => {
    // Contract Factory
    const contractFactory = await hre.ethers.getContractFactory(contractName);
    // Deploy Contract
    const contract = await contractFactory.deploy({gasPrice: 50000000000});
    // Make sure the contracft is deployed
    await contract.deployed();
    return {contractFactory, contract};
}

const seedTraderAccount = async (dex, tokens, amount, trader) => {
    await tokens.map(async token => {
        // Mint token for trader
        await token.contract.faucet(trader.address, amount);
        // Approve dex to spend tokens
        await token.contract.connect(trader).approve(dex.contract.address, amount);
        
        const tokenName = await token.contract.name();
        const ticker = ethers.utils.formatBytes32String(tokenName);
        // Deposit
        await dex.contract.connect(trader).deposit(ticker, amount);
        // Balances
        await getTraderBalance(dex, token, trader);
    });
}

const getTraderBalance = async(dex, token, trader) => {
    const tokenName = await token.contract.name();
    const ticker = ethers.utils.formatBytes32String(tokenName);
    const walletBalance = await trader.getBalance();
    const tokenBalance = await token.contract.balanceOf(trader.address);
    const dexBalances = await dex.contract.balances(trader.address, ticker);
    console.log("Trader Address:", trader.address);
    console.log("ETH Balance:", walletBalance);
    console.log("TOKEN Balance:", tokenBalance);
    console.log("DEX Balance:", tokenName, dexBalances);
    return {walletBalance, dexBalances};
}

const createOrders = async (dex, traders) => {
    await dex.contract.connect(traders[0]).createLimitOrder(BAT, 10, 10, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(BAT, 10, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(REP, 12, 11, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(REP, 12, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(ZRX, 12, 15, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(ZRX, 12, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(BAT, 15, 14, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(BAT, 15, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(ZRX, 20, 12, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(ZRX, 20, ORDER_SIDE.SELL);

    await dex.contract.connect(traders[0]).createLimitOrder(REP, 10, 2, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(REP, 10, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(BAT, 5, 4, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(BAT, 5, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(ZRX, 8, 2, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(ZRX, 8, ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await dex.contract.connect(traders[0]).createLimitOrder(REP, 12, 6, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createMarketOrder(REP, 12, ORDER_SIDE.SELL);

    await dex.contract.connect(traders[0]).createLimitOrder(BAT, 10, 10, ORDER_SIDE.BUY);
    await dex.contract.connect(traders[1]).createLimitOrder(BAT, 5, 10, ORDER_SIDE.SELL);
    
    await helpers.time.increase(1);

    await dex.contract.connect(traders[1]).createLimitOrder(BAT, 5, 10, ORDER_SIDE.SELL);
    await helpers.time.increase(1);

    await Promise.all([
        dex.contract.connect(traders[0]).createLimitOrder(BAT, 14, 10, ORDER_SIDE.BUY),
        dex.contract.connect(traders[1]).createLimitOrder(BAT, 12, 11, ORDER_SIDE.BUY),
        dex.contract.connect(traders[1]).createLimitOrder(BAT, 10, 12, ORDER_SIDE.BUY),

        dex.contract.connect(traders[0]).createLimitOrder(REP, 30, 4, ORDER_SIDE.BUY),
        dex.contract.connect(traders[0]).createLimitOrder(REP, 20, 5, ORDER_SIDE.BUY),
        dex.contract.connect(traders[1]).createLimitOrder(REP, 5, 6, ORDER_SIDE.BUY),

        dex.contract.connect(traders[0]).createLimitOrder(ZRX, 40, 12, ORDER_SIDE.BUY),
        dex.contract.connect(traders[0]).createLimitOrder(ZRX, 30, 13, ORDER_SIDE.BUY),
        dex.contract.connect(traders[1]).createLimitOrder(ZRX, 5, 14, ORDER_SIDE.BUY),

        dex.contract.connect(traders[2]).createLimitOrder(BAT, 20, 16, ORDER_SIDE.SELL),
        dex.contract.connect(traders[3]).createLimitOrder(BAT, 30, 15, ORDER_SIDE.SELL),
        dex.contract.connect(traders[3]).createLimitOrder(BAT, 5, 14, ORDER_SIDE.SELL),

        dex.contract.connect(traders[2]).createLimitOrder(REP, 40, 10, ORDER_SIDE.SELL),
        dex.contract.connect(traders[2]).createLimitOrder(REP, 20, 9, ORDER_SIDE.SELL),
        dex.contract.connect(traders[3]).createLimitOrder(REP, 8, 8, ORDER_SIDE.SELL),

        dex.contract.connect(traders[2]).createLimitOrder(ZRX, 15, 23, ORDER_SIDE.SELL),
        dex.contract.connect(traders[2]).createLimitOrder(ZRX, 12, 22, ORDER_SIDE.SELL),
        dex.contract.connect(traders[3]).createLimitOrder(ZRX, 9, 21, ORDER_SIDE.SELL)
    ]);
  
}

async function main() {
    // Deploying all the contracts
    const [dex, dai, bat, rep, zrx] = await Promise.all(
      ["OBDex", "Dai", "Bat", "Rep", "Zrx"].map(contractName => deploy(contractName))
    );
      
    // Hardhat accounts
    const [owner, trader1, trader2, trader3, trader4, others] = await ethers.getSigners();
    [trader1, trader2, trader3, trader4].map(trader => console.log(trader.address));

    // Add tokens
    await Promise.all([
      [[DAI, dai], [ZRX, zrx], [REP, rep], [BAT, bat]]
        .map(([ticker, token]) => dex.contract.addToken(ticker, token.contract.address))
    ]);

    const tokens = await dex.contract.getTokens();
    console.log("tokens:", tokens);

    await Promise.all([
      [trader1, trader2, trader3, trader4].map(trader => seedTraderAccount(dex, [dai, bat, rep, zrx], amount, trader))
    ]);
  
    setTimeout(async () => {
        await createOrders(dex, [trader1, trader2, trader3, trader4])

        let Orders = await Promise.all([
            dex.contract.getOrders(ZRX, ORDER_SIDE.BUY),
            dex.contract.getOrders(ZRX, ORDER_SIDE.SELL),
        ]);

        console.log("BUY: ", Orders[0]);
        console.log("SELL: ", Orders[1]);

    }, 500);


    const adresses = {
        OBDex: dex.contract.address,
        dai: dai.contract.address,
        bat: bat.contract.address,
        rep: rep.contract.address,
        zrx: zrx.contract.address
    }
    
    // Write the contract address to a JSON file
    fs.writeFileSync(
        'client/src/contract-addresses.json', 
        JSON.stringify({ adresses }), 
        { flag: 'w' }
    );
    console.log(adresses);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
