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

const toEthUnit = (amount) => {
    return hre.ethers.utils.parseUnits(amount.toString(), 'ether');
}

const amount = toEthUnit(20000);
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

const seedTraderAccount = async (obdex, tokens, amount, trader) => {
    await tokens.map(async token => {
        // Mint token for trader
        await token.contract.faucet(trader.address, amount);
        // Approve dex to spend tokens
        await token.contract.connect(trader).approve(obdex.contract.address, amount);
        
        const tokenName = await token.contract.name();
        const ticker = ethers.utils.formatBytes32String(tokenName);
        // Deposit
        const amountToDeposit = toEthUnit(19000);
        await obdex.contract.connect(trader).deposit(ticker, amountToDeposit);
        // Balances
        //await getTraderBalance(obdex, token, trader);
    });
}

const getTraderBalance = async(obdex, token, trader) => {
    const tokenName = await token.contract.name();
    const ticker = ethers.utils.formatBytes32String(tokenName);
    const walletBalance = await trader.getBalance();
    const tokenBalance = await token.contract.balanceOf(trader.address);
    const dexBalances = await obdex.contract.balances(trader.address, ticker);
    console.log("Trader Address:", trader.address);
    //console.log("ETH Balance:", walletBalance);
    //console.log("TOKEN Balance:", tokenBalance);
    console.log("DEX Balance:", tokenName, dexBalances);
    return {walletBalance, dexBalances};
}

const createOrders = async (obdex, traders) => {
    await obdex.contract.connect(traders[0]).createLimitOrder(BAT, toEthUnit(10), 10, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(BAT, toEthUnit(10), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(REP, toEthUnit(12), 11, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(REP, toEthUnit(12), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(ZRX, toEthUnit(12), 15, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(ZRX, toEthUnit(12), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(BAT, toEthUnit(15), 14, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(BAT, toEthUnit(15), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(ZRX, toEthUnit(20), 12, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(ZRX, toEthUnit(20), ORDER_SIDE.SELL);

    await obdex.contract.connect(traders[0]).createLimitOrder(REP, toEthUnit(10), 2, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(REP, toEthUnit(10), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(BAT, toEthUnit(5), 4, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(BAT, toEthUnit(5), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(ZRX, toEthUnit(8), 2, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(ZRX, toEthUnit(8), ORDER_SIDE.SELL);
    await helpers.time.increase(1);
    await obdex.contract.connect(traders[0]).createLimitOrder(REP, toEthUnit(12), 6, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createMarketOrder(REP, toEthUnit(12), ORDER_SIDE.SELL);

    await obdex.contract.connect(traders[0]).createLimitOrder(BAT, toEthUnit(10), 10, ORDER_SIDE.BUY);
    await obdex.contract.connect(traders[1]).createLimitOrder(BAT, toEthUnit(5), 10, ORDER_SIDE.SELL);
    
    await helpers.time.increase(1);

    await obdex.contract.connect(traders[1]).createLimitOrder(BAT, toEthUnit(5), 10, ORDER_SIDE.SELL);
    await helpers.time.increase(1);

    await Promise.all([
        obdex.contract.connect(traders[0]).createLimitOrder(BAT, toEthUnit(14), 10, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[1]).createLimitOrder(BAT, toEthUnit(12), 11, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[1]).createLimitOrder(BAT, toEthUnit(10), 12, ORDER_SIDE.BUY),

        obdex.contract.connect(traders[0]).createLimitOrder(REP, toEthUnit(30), 4, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[0]).createLimitOrder(REP, toEthUnit(20), 5, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[1]).createLimitOrder(REP, toEthUnit(5), 6, ORDER_SIDE.BUY),

        obdex.contract.connect(traders[0]).createLimitOrder(ZRX, toEthUnit(40), 12, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[0]).createLimitOrder(ZRX, toEthUnit(30), 13, ORDER_SIDE.BUY),
        obdex.contract.connect(traders[1]).createLimitOrder(ZRX, toEthUnit(5), 14, ORDER_SIDE.BUY),

        obdex.contract.connect(traders[2]).createLimitOrder(BAT, toEthUnit(20), 16, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[3]).createLimitOrder(BAT, toEthUnit(30), 15, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[3]).createLimitOrder(BAT, toEthUnit(5), 14, ORDER_SIDE.SELL),

        obdex.contract.connect(traders[2]).createLimitOrder(REP, toEthUnit(40), 10, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[2]).createLimitOrder(REP, toEthUnit(20), 9, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[3]).createLimitOrder(REP, toEthUnit(8), 8, ORDER_SIDE.SELL),

        obdex.contract.connect(traders[2]).createLimitOrder(ZRX, toEthUnit(15), 23, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[2]).createLimitOrder(ZRX, toEthUnit(12), 22, ORDER_SIDE.SELL),
        obdex.contract.connect(traders[3]).createLimitOrder(ZRX, toEthUnit(9), 21, ORDER_SIDE.SELL)
    ]);
  
}

async function main() {
    // Deploying all the contracts
    const [obdex, dai, bat, rep, zrx] = await Promise.all(
      ["OBDex", "Dai", "Bat", "Rep", "Zrx"].map(contractName => deploy(contractName))
    );
      
    // Hardhat accounts
    const [owner, trader1, trader2, trader3, trader4, others] = await ethers.getSigners();
    [trader1, trader2, trader3, trader4].map(trader => console.log(trader.address));

    // Add tokens
    await Promise.all([
        [[DAI, dai], [ZRX, zrx], [REP, rep], [BAT, bat]]
            .map(([ticker, token]) => obdex.contract.addToken(ticker, token.contract.address))
    ]);

    const tokens = await obdex.contract.getTokens();
    console.log("tokens:", tokens);

    await Promise.all([
        [trader1, trader2, trader3, trader4].map(trader => {
            console.log('trader; ', trader.address);
            seedTraderAccount(obdex, [dai, bat, rep, zrx], amount, trader);
        })
    ]);
  
    setTimeout(async () => {
        await createOrders(obdex, [trader1, trader2, trader3, trader4])

        let Orders = await Promise.all([
            obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY),
            obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL),
        ]);

        //console.log("BUY: ", Orders[0]);
        //console.log("SELL: ", Orders[1]);

        // console.log('OPENING ORDERS');
        // console.log('BUYING AMOUNTBAT: ', toEthUnit(10));

        // console.log('Balance before');
        // await getTraderBalance(obdex, dai, trader1);
        
        // await obdex.contract.connect(trader1).createLimitOrder(BAT, toEthUnit(10), 1, ORDER_SIDE.BUY);

        // console.log('Balance after');
        // await getTraderBalance(obdex, dai, trader1);
    }, 500);
    

    const adresses = {
        OBDex: obdex.contract.address,
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
