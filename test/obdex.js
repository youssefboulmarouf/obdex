const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('OBDex', () => {

    const [DAI, REP, BAT, ZRX] = ['DAI', 'REP', 'BAT', 'ZRX'].map(token => hre.ethers.utils.formatBytes32String(token));
    const ORDER_SIDE = {BUY: 0, SELL: 1};
    const ORDER_TYPE = {MARKET: 0, LIMIT: 1};

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
        await Promise.all(
            tokens.map(async token => {    
                // Mint token for trader
                await token.contract.faucet(trader.address, amount);
                // Approve obdex to spend tokens
                await token.contract.connect(trader).approve(obdex.contract.address, amount);
            })
        );
    }

    const getTraderBalance = async(obdex, token, trader) => {
        const tokenName = await token.contract.name();
        const ticker = hre.ethers.utils.formatBytes32String(tokenName);

        // Trader's balance of Token in OBDex Wallet 
        const obdexBalances = await obdex.contract.balances(trader.address, ticker);

        return obdexBalances;
    }


    describe('Token', () => {
        let obdex, dai, owner, trader;

        const tokenFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');
            [owner, trader] = await hre.ethers.getSigners();
        }

        it('Should NOT Add Tokens If NOT Admin', async () => {            
            await loadFixture(tokenFixture);

            await expect(
                obdex.contract.connect(trader).addToken(DAI, dai.contract.address)
            ).to.be.revertedWith('Unauthorized! Only Admin can perform this action.');
        });

        it('Should Have Correct Tokens', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
            
            const tokens = await obdex.contract.connect(owner).getTokens();
            expect(tokens.length).to.be.equals(1);
            expect(tokens[0].ticker).to.be.equals(DAI);
            expect(tokens[0].tokenAddress).to.be.equals(dai.contract.address);

        });
        
        it('Should NOT Add Token Twice', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);

            await expect(
                obdex.contract.connect(owner).addToken(DAI, dai.contract.address)
            ).to.be.revertedWith('Ticker Already Exist!');
        });

        it('Should have correct Ticker list', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);

            const tickerList = await obdex.contract.connect(owner).getTickerList();
            expect(tickerList.length).to.be.equals(1);
            expect(tickerList[0]).to.be.equals(DAI);
        });
        
    });

    describe('Deposit', () => {
        let obdex, dai, owner, trader;

        const depositFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');

            [owner, trader] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
        }

        it('Should NOT Deposit If Ticker Does NOT Exist', async () => {
            await loadFixture(depositFixture);

            const amount = hre.ethers.utils.parseUnits('10', 'ether');
            const tokenName = 'ThisTokenDoesNotExist';
            
            await expect(
                obdex.contract.connect(trader).deposit(
                    hre.ethers.utils.formatBytes32String(tokenName),
                    amount
                )
            ).to.be.revertedWith("Ticker Does Not Exist!");
        });

        it('Should deposit if Ticker exists', async () => {
            await loadFixture(depositFixture);

            const amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            // Mint token for trader
            await dai.contract.faucet(trader.address, amount);
            
            // Approve obdex to spend tokens for trader
            await dai.contract.connect(trader).approve(obdex.contract.address, amount);
              
            //await seedTraderWallet(obdex, trader, [dai], amount);

            // Deposit
            await obdex.contract.connect(trader).deposit(DAI, amount);

            // Balances
            const obdexBalances = await getTraderBalance(obdex, dai, trader);
            const daiBalance = await dai.contract.balanceOf(trader.address);

            expect(obdexBalances.free).to.be.equals(amount);
            expect(obdexBalances.locked).to.be.equals(0);
            expect(daiBalance).to.be.equals(0);
        });
    });

    describe('Withdraw', () => {
        let obdex, dai, owner, trader, amount;

        const withdrawFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');

            [owner, trader] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
            
            amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            await seedTraderWallet(obdex, trader, [dai], amount);
            
            await obdex.contract.connect(trader).deposit(DAI, amount);
        }

        it('Should withdraw if enough Balance', async() => {
            await loadFixture(withdrawFixture);

            let obdexBalances = await getTraderBalance(obdex, dai, trader);
            let daiBalance = await dai.contract.balanceOf(trader.address);
            expect(obdexBalances.free).to.be.equals(amount);
            expect(daiBalance).to.be.equals(0);

            const withdrawAmount = hre.ethers.utils.parseUnits('100', 'ether');
            await obdex.contract.connect(trader).withdraw(DAI, withdrawAmount);

            obdexBalances = await getTraderBalance(obdex, dai, trader);
            daiBalance = await dai.contract.balanceOf(trader.address);
            expect(obdexBalances.free).to.be.equals(
                hre.ethers.utils.parseUnits('900', 'ether')
            );
            expect(daiBalance).to.be.equals(withdrawAmount);
        });

        it('Should NOT withdraw if NOT enough Balance', async() => {
            await loadFixture(withdrawFixture);

            const withdrawAmount = hre.ethers.utils.parseUnits('2000', 'ether');
            await expect(
                obdex.contract.connect(trader).withdraw(DAI, withdrawAmount)
            ).to.be.revertedWith('Low Token Balance!');
        });
        
        it('Should NOT withdraw if Token does NOT exist', async() => {
            await loadFixture(withdrawFixture);

            const withdrawAmount = hre.ethers.utils.parseUnits('2000', 'ether');
            await expect(
                obdex.contract.connect(trader).withdraw(
                    hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist'),
                    withdrawAmount
                )
            ).to.be.revertedWith('Ticker Does Not Exist!');
        });
    });

    describe('Balance', () => {
        let obdex, dai, rep, owner, trader1, trader2, amount;

        const balanceFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');
            rep = await deploy('Rep');

            [owner, trader1, trader2] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
            await obdex.contract.connect(owner).addToken(REP, rep.contract.address);
            
            amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            await seedTraderWallet(obdex, trader1, [dai, rep], amount);
            await obdex.contract.connect(trader1).deposit(DAI, amount);

            await seedTraderWallet(obdex, trader2, [dai, rep], amount);
            await obdex.contract.connect(trader2).deposit(REP, amount);
        }

        it('Should have correct Token Balances', async () => {
            await loadFixture(balanceFixture);
            
            // Trader 1 Balances
            let obdexDaiBalances = await getTraderBalance(obdex, dai, trader1);
            let obdexRepBalances = await getTraderBalance(obdex, rep, trader1);
            let daiBalance = await dai.contract.balanceOf(trader1.address);
            let repBalance = await rep.contract.balanceOf(trader1.address);
            expect(obdexDaiBalances.free).to.be.equals(amount);
            expect(obdexRepBalances.free).to.be.equals(0);
            expect(daiBalance).to.be.equals(0);
            expect(repBalance).to.be.equals(amount);

            // Trader 2 Balances
            obdexDaiBalances = await getTraderBalance(obdex, dai, trader2);
            obdexRepBalances = await getTraderBalance(obdex, rep, trader2);
            daiBalance = await dai.contract.balanceOf(trader2.address);
            repBalance = await rep.contract.balanceOf(trader2.address);
            expect(obdexDaiBalances.free).to.be.equals(0);
            expect(obdexRepBalances.free).to.be.equals(amount);
            expect(daiBalance).to.be.equals(amount);
            expect(repBalance).to.be.equals(0);
        });

        it('Should have empty Balance when Token Does NOT Exist', async () => {
            await loadFixture(balanceFixture);

            // Trader's balance of Token in OBDex Wallet 
            const obdexBalances = await obdex.contract.balances(
                trader1.address, 
                hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist')
            );
            expect(obdexBalances.free).to.be.equals(0);
            expect(obdexBalances.locked).to.be.equals(0);
        });
    });

    describe('Limit', () => {
        let obdex, dai, rep, bat, zrx, owner, trader1, trader2, trader3, trader4, amount;

        const limitFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');
            rep = await deploy('Rep');
            bat = await deploy('Bat');
            zrx = await deploy('Zrx');

            [owner, trader1, trader2, trader3, trader4] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
            await obdex.contract.connect(owner).addToken(REP, rep.contract.address);
            await obdex.contract.connect(owner).addToken(BAT, bat.contract.address);
            await obdex.contract.connect(owner).addToken(ZRX, zrx.contract.address);
            
            amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            await seedTraderWallet(obdex, trader1, [dai], amount);
            await obdex.contract.connect(trader1).deposit(DAI, amount);

            await seedTraderWallet(obdex, trader2, [rep, zrx], amount);
            await obdex.contract.connect(trader2).deposit(REP, amount);
            await obdex.contract.connect(trader2).deposit(ZRX, amount);

            await seedTraderWallet(obdex, trader3, [bat, zrx], amount);
            await obdex.contract.connect(trader3).deposit(BAT, amount);
            await obdex.contract.connect(trader3).deposit(ZRX, amount);

            await seedTraderWallet(obdex, trader4, [dai, rep, bat, zrx], amount);
            await obdex.contract.connect(trader4).deposit(DAI, amount);
            await obdex.contract.connect(trader4).deposit(BAT, amount);
            await obdex.contract.connect(trader4).deposit(REP, amount);
            await obdex.contract.connect(trader4).deposit(ZRX, amount);
        }

        it('Should NOT create Limit Order if Token does NOT Exist', async () => {
            await loadFixture(limitFixture);
            await expect(
                obdex.contract.connect(trader1).createLimitOrder(
                    hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist'),
                    amount,
                    1,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Ticker Does Not Exist!');

            await expect(
                obdex.contract.connect(trader1).createLimitOrder(
                    hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist'),
                    amount,
                    1,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Ticker Does Not Exist!');
        });

        it('Should NOT create BUY or SELL Limit Orders if token is DAI', async () => {
            await loadFixture(limitFixture);
            
            await expect(
                obdex.contract.connect(trader1).createLimitOrder(
                    DAI,
                    amount,
                    1,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Cannot Trade DAI Token!');

            await expect(
                obdex.contract.connect(trader1).createLimitOrder(
                    DAI,
                    amount,
                    1,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Cannot Trade DAI Token!');
        });

        it('Should NOT create SELL Limit Orders if NOT enough tokens', async () => {
            await loadFixture(limitFixture);

            const obdexBalances = await getTraderBalance(obdex, bat, trader1)
            expect(obdexBalances.free).to.be.equals(0);
            expect(obdexBalances.locked).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader1).createLimitOrder(
                    BAT,
                    amount,
                    1,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Low Token Balance!');
        });

        it('Should NOT create BUY Limit Orders if NOT enough DAI balance', async () => {
            await loadFixture(limitFixture);

            const obdexBalances = await getTraderBalance(obdex, dai, trader3)
            expect(obdexBalances.free).to.be.equals(0);
            expect(obdexBalances.locked).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader3).createLimitOrder(
                    BAT,
                    amount,
                    1,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Low DAI Balance!');
        });

        it('Should create BUY and SELL Limit Orders', async () => {
            await loadFixture(limitFixture);

            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            let sellOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

            // Buying Amount (10 BAT) with Price (1 DAI) = 10 DAI => 10 DAI to be LOCKED
            await obdex.contract.connect(trader1).createLimitOrder(
                BAT,
                hre.ethers.utils.parseUnits('5', 'ether'),
                1,
                ORDER_SIDE.BUY
            );

            buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(1);
            expect(buyOrders[0].price).to.be.equals(1);
            expect(buyOrders[0].amount).to.be.equals(hre.ethers.utils.parseUnits('5', 'ether'));
            expect(buyOrders[0].ticker).to.be.equals(BAT);
            expect(buyOrders[0].traderAddress).to.be.equals(trader1.address);
            expect(buyOrders[0].orderType).to.be.equals(ORDER_TYPE.LIMIT);
            expect(buyOrders[0].orderSide).to.be.equals(ORDER_SIDE.BUY);
            expect(buyOrders[0].fills.length).to.be.equals(0);

            // Selling Amount (10 REP) with Price (1 DAI) = 10 DAI => 10 REP to be LOCKED
            await obdex.contract.connect(trader2).createLimitOrder(
                REP,
                hre.ethers.utils.parseUnits('10', 'ether'),
                1,
                ORDER_SIDE.SELL
            );

            sellOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            expect(sellOrders[0].price).to.be.equals(1);
            expect(sellOrders[0].amount).to.be.equals(hre.ethers.utils.parseUnits('10', 'ether'));
            expect(sellOrders[0].ticker).to.be.equals(REP);
            expect(sellOrders[0].traderAddress).to.be.equals(trader2.address);
            expect(sellOrders[0].orderType).to.be.equals(ORDER_TYPE.LIMIT);
            expect(sellOrders[0].orderSide).to.be.equals(ORDER_SIDE.SELL);
            expect(sellOrders[0].fills.length).to.be.equals(0);
        });

        it('Should create Limit Order and Sort them', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = hre.ethers.utils.parseUnits('5', 'ether');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            const buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(3);

            expect(buyOrders[0].price).to.be.equals(1);
            expect(buyOrders[0].traderAddress).to.be.equals(trader4.address);

            expect(buyOrders[1].price).to.be.equals(2);
            expect(buyOrders[1].traderAddress).to.be.equals(trader4.address);

            expect(buyOrders[2].price).to.be.equals(3);
            expect(buyOrders[2].traderAddress).to.be.equals(trader1.address);
            

            await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 1, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.SELL);

            const sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(4);

            expect(sellOrders[0].price).to.be.equals(1);
            expect(sellOrders[0].traderAddress).to.be.equals(trader4.address);
            
            expect(sellOrders[1].price).to.be.equals(2);
            expect(sellOrders[1].traderAddress).to.be.equals(trader3.address);
            
            expect(sellOrders[2].price).to.be.equals(3);
            expect(sellOrders[2].traderAddress).to.be.equals(trader2.address);

            expect(sellOrders[3].price).to.be.equals(7);
            expect(sellOrders[3].traderAddress).to.be.equals(trader4.address);

        });

        // TBF
        it('Should Cancel Limit Order', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = hre.ethers.utils.parseUnits('5', 'ether');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(3);

            expect(buyOrders[2].price).to.be.equals(3);
            expect(buyOrders[2].traderAddress).to.be.equals(trader1.address);

            console.log('buyOrders2: ', buyOrders[2]);
            console.log('trader1.address: ', trader1.address);


            // Trader1 Cancel his order with price = 3
            //await obdex.contract.connect(trader1).cancelOrder(BAT, buyOrders[2].id, ORDER_SIDE.BUY);
            
            //buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            // expect(buyOrders.length).to.be.equals(2);

            // expect(buyOrders[0].price).to.be.equals(1);
            // expect(buyOrders[0].traderAddress).to.be.equals(trader4.address);

            // expect(buyOrders[1].price).to.be.equals(2);
            // expect(buyOrders[1].traderAddress).to.be.equals(trader4.address);

            // await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            // await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 1, ORDER_SIDE.SELL);
            // await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            // await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.SELL);

            // let sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            // expect(sellOrders.length).to.be.equals(4);

            // expect(sellOrders[1].price).to.be.equals(2);
            // expect(sellOrders[1].traderAddress).to.be.equals(trader3.address);

            // // Trader1 Cancel his order with price = 3
            // await obdex.contract.connect(trader3).cancelOrder(ZRX, buyOrders[1].id, ORDER_SIDE.BUY);

            // sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            // expect(sellOrders.length).to.be.equals(3);
            
            // expect(sellOrders[0].price).to.be.equals(1);
            // expect(sellOrders[0].traderAddress).to.be.equals(trader4.address);
            
            // expect(sellOrders[1].price).to.be.equals(3);
            // expect(sellOrders[1].traderAddress).to.be.equals(trader2.address);

            // expect(sellOrders[2].price).to.be.equals(7);
            // expect(sellOrders[2].traderAddress).to.be.equals(trader4.address);

        });

        // TBD
        it('Should NOT Cancel NON Existing Limit Order', async () => {});

        // TBD
        it('Should NOT Cancel Limit Order if NOT order Trader (Order Owner)', async () => {});

        it('Should create Limit Order and Lock the correct amount', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = hre.ethers.utils.parseUnits('5', 'ether');
            // Trader1 BUY 5 BAT for price of 3 DAI each => 15 DAI LOCKED
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            // Trader4 BUY 5 BAT for price of 1 DAI each => 5 DAI LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            // Trader4 BUY 5 BAT for price of 2 DAI each => 10 DAI LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            let trader1Balance = await getTraderBalance(obdex, dai, trader1);
            let trader4Balance = await getTraderBalance(obdex, dai, trader4);
            
            expect(trader1Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('15', 'ether'));
            expect(trader4Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('15', 'ether'));

            // SELL 5 ZRX for price of 3 DAI each => 5 ZRX LOCKED
            await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            // SELL 5 ZRX for price of 1 DAI each => 5 ZRX LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 1, ORDER_SIDE.SELL);
            // SELL 5 ZRX for price of 2 DAI each => 5 ZRX LOCKED
            await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            // SELL 5 ZRX for price of 7 DAI each => 5 ZRX LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.SELL);

            trader4Balance = await getTraderBalance(obdex, zrx, trader4);
            let trader2Balance = await getTraderBalance(obdex, zrx, trader2);
            let trader3Balance = await getTraderBalance(obdex, zrx, trader3);

            expect(trader4Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('10', 'ether'));
            expect(trader2Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('5', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('5', 'ether'));

        });

        it('Should create Limit Order, Match and Clear them', async () => {
            await loadFixture(limitFixture);

            // Check Trader1 BAT Balance 
            let trader1Balance = await getTraderBalance(obdex, bat, trader1);
            expect(trader1Balance.free).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            expect(trader1Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Trader1 BUY 100 BAT for price of 3 DAI each => 300 DAI LOCKED
            await obdex.contract.connect(trader1)
                .createLimitOrder(BAT, hre.ethers.utils.parseUnits('100', 'ether'), 3, ORDER_SIDE.BUY);
            
            // Check Trader1 Locked DAI Balance 
            trader1Balance = await getTraderBalance(obdex, dai, trader1);
            expect(trader1Balance.free).to.be.equals(hre.ethers.utils.parseUnits('700', 'ether'));
            expect(trader1Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('300', 'ether'));

            // Trader3 SELL 150 BAT for price of 3 DAI each => 150 DAI LOCKED
            await obdex.contract.connect(trader3)
                .createLimitOrder(BAT, hre.ethers.utils.parseUnits('150', 'ether'), 3, ORDER_SIDE.SELL);

            // Check Trader3 New DAI Balance 
            let trader3Balance = await getTraderBalance(obdex, dai, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('300', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));

            // Check Trader3 New BAT Balance 
            trader3Balance = await getTraderBalance(obdex, bat, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('850', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('50', 'ether'));

            // Check Trader1 New DAI Balance
            trader1Balance = await getTraderBalance(obdex, dai, trader1);
            expect(trader1Balance.free).to.be.equals(hre.ethers.utils.parseUnits('700', 'ether'));
            expect(trader1Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Check Trader1 New BAT Balance
            trader1Balance = await getTraderBalance(obdex, bat, trader1);
            expect(trader1Balance.free).to.be.equals(hre.ethers.utils.parseUnits('100', 'ether'));
            expect(trader1Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Check BAT BUY Orders
            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            // Check BAT SELL Orders
            let sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            expect(sellOrders[0].amount).to.be.equals(hre.ethers.utils.parseUnits('150', 'ether'));
            expect(sellOrders[0].fills.length).to.be.equals(1);
            expect(sellOrders[0].fills[0]).to.be.equals(hre.ethers.utils.parseUnits('100', 'ether'));

            // Check Trader3 REP Balance 
            trader3Balance = await getTraderBalance(obdex, rep, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Trader3 BUY 10 REP for price of 10 DAI each => 100 DAI LOCKED
            await obdex.contract.connect(trader3)
                .createLimitOrder(REP, hre.ethers.utils.parseUnits('10', 'ether'), 10, ORDER_SIDE.BUY);
            
            // Check Trader3 Locked DAI Balance 
            trader3Balance = await getTraderBalance(obdex, dai, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('200', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('100', 'ether'));
            
            // Check Trader2 DAI Balance 
            let trader2Balance = await getTraderBalance(obdex, dai, trader2);
            expect(trader2Balance.free).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            expect(trader2Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Trader2 SELL 100 REP for price of 10 DAI each => 100 REP LOCKED
            await obdex.contract.connect(trader2)
                .createLimitOrder(REP, hre.ethers.utils.parseUnits('100', 'ether'), 10, ORDER_SIDE.SELL);
            
            // Check Trader3 New DAI Balance 
            trader3Balance = await getTraderBalance(obdex, dai, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('200', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));

            // Check Trader3 New REP Balance 
            trader3Balance = await getTraderBalance(obdex, rep, trader3);
            expect(trader3Balance.free).to.be.equals(hre.ethers.utils.parseUnits('10', 'ether'));
            expect(trader3Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));

            // Check Trader2 New DAI Balance
            trader2Balance = await getTraderBalance(obdex, dai, trader2);
            expect(trader2Balance.free).to.be.equals(hre.ethers.utils.parseUnits('100', 'ether'));
            expect(trader2Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('0', 'ether'));
            
            // Check Trader2 New REP Balance
            trader2Balance = await getTraderBalance(obdex, rep, trader2);
            expect(trader2Balance.free).to.be.equals(hre.ethers.utils.parseUnits('900', 'ether'));
            expect(trader2Balance.locked).to.be.equals(hre.ethers.utils.parseUnits('90', 'ether'));

            // Check REP BUY Orders
            buyOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            // Check REP SELL Orders
            sellOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            expect(sellOrders[0].amount).to.be.equals(hre.ethers.utils.parseUnits('100', 'ether'));
            expect(sellOrders[0].fills.length).to.be.equals(1);
            expect(sellOrders[0].fills[0]).to.be.equals(hre.ethers.utils.parseUnits('10', 'ether'));
        });
    });

    describe('Market', () => {
        let obdex, dai, rep, bat, zrx, owner, trader1, trader2, trader3, trader4, amount;

        const marketFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');
            rep = await deploy('Rep');
            bat = await deploy('Bat');
            zrx = await deploy('Zrx');

            [owner, trader1, trader2, trader3, trader4] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(DAI, dai.contract.address);
            await obdex.contract.connect(owner).addToken(REP, rep.contract.address);
            await obdex.contract.connect(owner).addToken(BAT, bat.contract.address);
            await obdex.contract.connect(owner).addToken(ZRX, zrx.contract.address);
            
            amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            await seedTraderWallet(obdex, trader1, [dai], amount);
            await obdex.contract.connect(trader1).deposit(DAI, amount);

            await seedTraderWallet(obdex, trader2, [rep, zrx], amount);
            await obdex.contract.connect(trader2).deposit(REP, amount);
            await obdex.contract.connect(trader2).deposit(ZRX, amount);

            await seedTraderWallet(obdex, trader3, [bat, zrx], amount);
            await obdex.contract.connect(trader3).deposit(BAT, amount);
            await obdex.contract.connect(trader3).deposit(ZRX, amount);

            await seedTraderWallet(obdex, trader4, [dai, rep, bat, zrx], amount);
            await obdex.contract.connect(trader4).deposit(DAI, amount);
            await obdex.contract.connect(trader4).deposit(BAT, amount);
            await obdex.contract.connect(trader4).deposit(REP, amount);
            await obdex.contract.connect(trader4).deposit(ZRX, amount);
        }

        it('Should NOT create Market Order if Token does NOT Exist', async () => {
            await loadFixture(marketFixture);
            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist'),
                    amount,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Ticker Does Not Exist!');

            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    hre.ethers.utils.formatBytes32String('ThisTokenDoesNotExist'),
                    amount,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Ticker Does Not Exist!');
        });

        it('Should NOT create Market Order if Token is DAI', async () => {
            await loadFixture(marketFixture);
            
            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    DAI,
                    amount,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Cannot Trade DAI Token!');

            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    DAI,
                    amount,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Cannot Trade DAI Token!');
        });

        it('Should NOT create SELL Market Order if LOW Token Balance', async () => {
            await loadFixture(marketFixture);

            const obdexBalances = await getTraderBalance(obdex, bat, trader1)
            expect(obdexBalances.free).to.be.equals(0);
            expect(obdexBalances.locked).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    BAT,
                    amount,
                    ORDER_SIDE.SELL
                )
            ).to.be.revertedWith('Low Token Balance!');
        });

        it('Should NOT create BUY Market Order if LOW DAI Balance', async () => {
            await loadFixture(marketFixture);

            const obdexBalances = await getTraderBalance(obdex, dai, trader3)
            expect(obdexBalances.free).to.be.equals(0);
            expect(obdexBalances.locked).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader3).createMarketOrder(
                    BAT,
                    amount,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Low DAI Balance!');
        });

        it('Should NOT create BUY market order if EMPTY Order Book', async () => {
            await loadFixture(marketFixture);

            const obdexBalances = await getTraderBalance(obdex, dai, trader1)
            expect(obdexBalances.free).to.be.equals(hre.ethers.utils.parseUnits('1000', 'ether'));
            expect(obdexBalances.locked).to.be.equals(0);

            const sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(sellOrders.length).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    BAT,
                    amount,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Empty Order Book! Please Create Limit Order!');
        });

        // TBD
        it('Should match BUY Market Order against existing Orders (BUY Market Order Amount > SELL Orders Amount)', async () => {});

        // TBD
        it('Should match BUY Market Order against existant Orders (BUY Market Order Amount < SELL Orders Amount)', async () => {});

        // TBD
        it('Should match SELL Market Order against existing Orders (SELL Market Order Amount > BUY Orders Amount) ', async () => {});

        // TBD
        it('Should match SELL Market Order against existing Orders (SELL Market Order Amount < BUY Orders Amount)', async () => {});
    });

});