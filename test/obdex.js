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

    const toEthUnit = (amount) => {
        return hre.ethers.utils.parseUnits(amount, 'ether')
    }

    const assertTraderBalance = async (obdex, token, trader, expectedFreeBalance, expectedLockedBalance) => {
        const trader1Balance = await getTraderBalance(obdex, token, trader);
        expect(trader1Balance.free).to.be.equals(toEthUnit(expectedFreeBalance));
        expect(trader1Balance.locked).to.be.equals(toEthUnit(expectedLockedBalance));
    }

    const assertOrder = (order, amount, price, trader, fills, orderSide, orderType) => {
        expect(order.amount).to.be.equals(amount);
        expect(order.price).to.be.equals(price);
        expect(order.traderAddress).to.be.equals(trader.address);
        expect(order.fills.length).to.be.equals(fills.length);

        if (fills.length > 0) {
            for (let i = 0; i < fills.length; i++) {
                expect(order.fills[i]).to.be.equals(toEthUnit(fills[i]));
            }
        }

        if(orderSide) { // This is Optional
            expect(order.orderSide).to.be.equals(orderSide);
        }

        if(orderType) { // This is Optional
            expect(order.orderType).to.be.equals(orderType);
        }        
    }

    describe('Token', () => {
        let obdex, dai, owner, trader;

        const tokenFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');
            [owner, trader] = await hre.ethers.getSigners();
        }

        it('Should NOT Add Tokens if NOT Admin', async () => {            
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

            const amount = toEthUnit('10');
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

            const amount = toEthUnit('1000');
            
            // Mint token for trader
            await dai.contract.faucet(trader.address, amount);
            
            // Approve obdex to spend tokens for trader
            await dai.contract.connect(trader).approve(obdex.contract.address, amount);
              
            //await seedTraderWallet(obdex, trader, [dai], amount);

            // Deposit
            await obdex.contract.connect(trader).deposit(DAI, amount);

            // Balances
            assertTraderBalance(obdex, dai, trader, '1000', '0');

            const daiBalance = await dai.contract.balanceOf(trader.address);
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
            
            amount = toEthUnit('1000');
            
            await seedTraderWallet(obdex, trader, [dai], amount);
            
            await obdex.contract.connect(trader).deposit(DAI, amount);
        }

        it('Should withdraw if enough Balance', async() => {
            await loadFixture(withdrawFixture);

            assertTraderBalance(obdex, dai, trader, '1000', '0');

            let daiBalance = await dai.contract.balanceOf(trader.address);
            expect(daiBalance).to.be.equals(0);

            const withdrawAmount = toEthUnit('100');
            await obdex.contract.connect(trader).withdraw(DAI, withdrawAmount);

            assertTraderBalance(obdex, dai, trader, '900', '0');

            daiBalance = await dai.contract.balanceOf(trader.address);
            expect(daiBalance).to.be.equals(withdrawAmount);
        });

        it('Should NOT withdraw if NOT enough Balance', async() => {
            await loadFixture(withdrawFixture);

            const withdrawAmount = toEthUnit('2000');
            await expect(
                obdex.contract.connect(trader).withdraw(DAI, withdrawAmount)
            ).to.be.revertedWith('Low Token Balance!');
        });
        
        it('Should NOT withdraw if Token does NOT exist', async() => {
            await loadFixture(withdrawFixture);

            const withdrawAmount = toEthUnit('2000');
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
            
            amount = toEthUnit('1000');
            
            await seedTraderWallet(obdex, trader1, [dai, rep], amount);
            await obdex.contract.connect(trader1).deposit(DAI, amount);

            await seedTraderWallet(obdex, trader2, [dai, rep], amount);
            await obdex.contract.connect(trader2).deposit(REP, amount);
        }

        it('Should have correct Token Balances', async () => {
            await loadFixture(balanceFixture);
            
            // Trader 1 Balances
            assertTraderBalance(obdex, dai, trader1, '1000', '0');
            assertTraderBalance(obdex, rep, trader1, '0', '0');

            let daiBalance = await dai.contract.balanceOf(trader1.address);
            expect(daiBalance).to.be.equals(0);
            
            let repBalance = await rep.contract.balanceOf(trader1.address);
            expect(repBalance).to.be.equals(amount);

            // Trader 2 Balances
            assertTraderBalance(obdex, dai, trader2, '0', '0');
            assertTraderBalance(obdex, rep, trader2, '1000', '0');

            daiBalance = await dai.contract.balanceOf(trader2.address);
            repBalance = await rep.contract.balanceOf(trader2.address);
            expect(daiBalance).to.be.equals(amount);
            expect(repBalance).to.be.equals(0);
        });

        it('Should have empty Balance when Token Does NOT Exist', async () => {
            await loadFixture(balanceFixture);

            const zrx = await deploy('Zrx'); // This token contract is not add to obdex 

            // Trader's balance of Token in OBDex Wallet 
            assertTraderBalance(obdex, zrx, trader1, '0', '0');
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
            
            amount = toEthUnit('1000');
            
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
            await obdex.contract.connect(trader1)
                .createLimitOrder(BAT, toEthUnit('5'), 1, ORDER_SIDE.BUY);

            buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(1);
            
            assertOrder(buyOrders[0],toEthUnit('5'), 1, trader1, [], ORDER_SIDE.BUY, ORDER_TYPE.LIMIT);

            // Selling Amount (10 REP) with Price (1 DAI) = 10 DAI => 10 REP to be LOCKED
            await obdex.contract.connect(trader2).createLimitOrder(
                REP,
                toEthUnit('10'),
                1,
                ORDER_SIDE.SELL
            );

            sellOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            assertOrder(sellOrders[0],toEthUnit('10'), 1, trader2, [], ORDER_SIDE.SELL, ORDER_TYPE.LIMIT);
        });

        it('Should create Limit Order and Sort them', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = toEthUnit('5');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            const buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(3);
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, []);
            assertOrder(buyOrders[1], amountToTrade, 2, trader4, []);
            assertOrder(buyOrders[2], amountToTrade, 1, trader4, []);

            await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 1, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.SELL);

            const sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(4);
            assertOrder(sellOrders[0], amountToTrade, 1, trader4, []);
            assertOrder(sellOrders[1], amountToTrade, 2, trader3, []);
            assertOrder(sellOrders[2], amountToTrade, 3, trader2, []);
            assertOrder(sellOrders[3], amountToTrade, 7, trader4, []);
        });

        it('Should Cancel BUY and SELL Limit Order', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = toEthUnit('5');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(3);

            // BUY LIMIT ORDERS are sorted by descending price
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, []);
            assertOrder(buyOrders[1], amountToTrade, 2, trader4, []);
            assertOrder(buyOrders[2], amountToTrade, 1, trader4, []);

            // Trader1 Cancel his order with price = 3
            await obdex.contract.connect(trader4).cancelOrder(BAT, buyOrders[1].id, ORDER_SIDE.BUY);
            
            buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(2);
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, []);
            assertOrder(buyOrders[1], amountToTrade, 1, trader4, []);
            
            await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 1, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.SELL);

            let sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(4);

            // SELL LIMIT ORDERS are sorted by ascending price
            assertOrder(sellOrders[0], amountToTrade, 1, trader4, []);
            assertOrder(sellOrders[1], amountToTrade, 2, trader3, []);
            assertOrder(sellOrders[2], amountToTrade, 3, trader2, []);
            assertOrder(sellOrders[3], amountToTrade, 7, trader4, []);

            // Trader1 Cancel his order with price = 3
            await obdex.contract.connect(trader3).cancelOrder(ZRX, sellOrders[1].id, ORDER_SIDE.SELL);

            sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(3);

            assertOrder(sellOrders[0], amountToTrade, 1, trader4, []);
            assertOrder(sellOrders[1], amountToTrade, 3, trader2, []);
            assertOrder(sellOrders[2], amountToTrade, 7, trader4, []);

        });

        it('Should Cancel BUY and SELL Limit and have the correct Balance (BUY then SELL)', async () => {
            await loadFixture(limitFixture);

            // Open BUY Orders
            const amountToTrade = toEthUnit('50');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY); // 150 DAI Locked
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY); // 50 DAI Locked
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY); // 100 DAI Locked

            assertTraderBalance(obdex, dai, trader1, '850', '150'); // order with price 3
            assertTraderBalance(obdex, dai, trader4, '850', '150'); // order with price 1 & 2

            // Open SELL Orders
            await obdex.contract.connect(trader3).createLimitOrder(BAT, toEthUnit('10'), 3, ORDER_SIDE.SELL); // 10 BAT Locked
            await obdex.contract.connect(trader3).createLimitOrder(BAT, toEthUnit('10'), 2, ORDER_SIDE.SELL); // 10 BAT Locked
            await obdex.contract.connect(trader3).createLimitOrder(BAT, toEthUnit('10'), 1, ORDER_SIDE.SELL); // 10 BAT Locked
            
            // Trader3 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader3, '60', '0');
            assertTraderBalance(obdex, bat, trader3, '970', '0');

            // Trader1 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader1, '850', '120');
            assertTraderBalance(obdex, bat, trader1, '10', '0');

            // Trader4 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader4, '850', '120');
            assertTraderBalance(obdex, bat, trader4, '1020', '0');

            // BUY Orders BAT
            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(3);
            
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, ['10']);
            assertOrder(buyOrders[1], amountToTrade, 2, trader4, ['10']);
            assertOrder(buyOrders[2], amountToTrade, 1, trader4, ['10']);

            // SELL Orders BAT
            let sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

            // Trader4 Cancel Order
            await obdex.contract.connect(trader4).cancelOrder(BAT, buyOrders[1].id, ORDER_SIDE.BUY);
            
            // Trader4 Balance DAI
            assertTraderBalance(obdex, dai, trader4, '930', '40');
            
            // BUY Orders BAT
            buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(2);
            
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, ['10']);
            assertOrder(buyOrders[1], amountToTrade, 1, trader4, ['10']);

            // Trader1 Cancel Order
            await obdex.contract.connect(trader4).cancelOrder(BAT, buyOrders[1].id, ORDER_SIDE.BUY);
            
            // BUY Orders BAT
            buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(1);
            assertOrder(buyOrders[0], amountToTrade, 3, trader1, ['10']);

            // Trader4 Balance DAI
            assertTraderBalance(obdex, dai, trader1, '970', '0');
            
        });

        it('Should Cancel BUY and SELL Limit and have the correct Balance (SELL then BUY)', async () => {
            await loadFixture(limitFixture);

            // Open SELL Orders
            const amountToTrade = toEthUnit('50');
            await obdex.contract.connect(trader3).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.SELL); // 50 BAT Locked => 90 dai
            await obdex.contract.connect(trader3).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.SELL); // 50 BAT Locked => 20
            await obdex.contract.connect(trader3).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.SELL); // 50 BAT Locked => 50 dai

            // Trader3 Balance BAT
            assertTraderBalance(obdex, bat, trader3, '850', '150');
            
            // Open BUY Orders
            await obdex.contract.connect(trader1).createLimitOrder(BAT, toEthUnit('30'), 3, ORDER_SIDE.BUY); // 90 DAI Locked
            await obdex.contract.connect(trader4).createLimitOrder(BAT, toEthUnit('70'), 1, ORDER_SIDE.BUY); // 70 DAI Locked
            await obdex.contract.connect(trader4).createLimitOrder(BAT, toEthUnit('10'), 2, ORDER_SIDE.BUY); // 20 DAI Locked

            // BUY Orders BAT
            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(1);
            assertOrder(buyOrders[0], toEthUnit('70'), 1, trader4, ['50']);

            // SELL Orders BAT
            let sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(2);
            assertOrder(sellOrders[0], amountToTrade, 2, trader3, ['10']);
            assertOrder(sellOrders[1], amountToTrade, 3, trader3, ['30']);

            // Trader3 Cancel Order
            await obdex.contract.connect(trader3).cancelOrder(BAT, sellOrders[0].id, ORDER_SIDE.SELL);
            
            // Trader3 Balance BAT
            assertTraderBalance(obdex, bat, trader3, '890', '20');

            // SELL Orders BAT
            sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);

            // Trader3 Cancel Order
            await obdex.contract.connect(trader3).cancelOrder(BAT, sellOrders[0].id, ORDER_SIDE.SELL);

            // Trader3 Balance DAI, BAT
            assertTraderBalance(obdex, bat, trader3, '910', '0');
            assertTraderBalance(obdex, dai, trader3, '160', '0');

            // Trader1 Balance DAI, BAT
            assertTraderBalance(obdex, bat, trader1, '30', '0');
            assertTraderBalance(obdex, dai, trader1, '910', '0');

            // Trader4 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader4, '1060', '0');
            assertTraderBalance(obdex, dai, trader4, '910', '20');
        });

        it('Should NOT Cancel NON Existing Limit Order', async () => {
            await loadFixture(limitFixture);
            await expect(
                obdex.contract.connect(trader1).cancelOrder(BAT, 99, ORDER_SIDE.BUY)
            ).to.be.revertedWith('Order Not Found!');
        });

        it('Should NOT Cancel Limit Order if NOT order Trader (Order Owner)', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = toEthUnit('5');
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            
            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(1);

            await expect(
                obdex.contract.connect(trader4).cancelOrder(BAT, buyOrders[0].id, ORDER_SIDE.BUY)
            ).to.be.revertedWith('Only the order trader can cancel the order');
            
        });

        it('Should create Limit Order and Lock the correct amount', async () => {
            await loadFixture(limitFixture);

            const amountToTrade = toEthUnit('5');
            // Trader1 BUY 5 BAT for price of 3 DAI each => 15 DAI LOCKED
            await obdex.contract.connect(trader1).createLimitOrder(BAT, amountToTrade, 3, ORDER_SIDE.BUY);
            // Trader4 BUY 5 BAT for price of 1 DAI each => 5 DAI LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 1, ORDER_SIDE.BUY);
            // Trader4 BUY 5 BAT for price of 2 DAI each => 10 DAI LOCKED
            await obdex.contract.connect(trader4).createLimitOrder(BAT, amountToTrade, 2, ORDER_SIDE.BUY);

            let trader1Balance = await getTraderBalance(obdex, dai, trader1);
            let trader4Balance = await getTraderBalance(obdex, dai, trader4);
            
            expect(trader1Balance.locked).to.be.equals(toEthUnit('15'));
            expect(trader4Balance.locked).to.be.equals(toEthUnit('15'));

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

            expect(trader4Balance.locked).to.be.equals(toEthUnit('10'));
            expect(trader2Balance.locked).to.be.equals(toEthUnit('5'));
            expect(trader3Balance.locked).to.be.equals(toEthUnit('5'));

        });

        it('Should create Limit Order, Match and Clear them', async () => {
            await loadFixture(limitFixture);

            // Trader1 BUY 100 BAT for price of 3 DAI each => 300 DAI LOCKED
            await obdex.contract.connect(trader1)
                .createLimitOrder(BAT, toEthUnit('100'), 3, ORDER_SIDE.BUY);
            
            // Trader1 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader1, '700', '300');
            assertTraderBalance(obdex, bat, trader1, '0', '0');

            // Trader3 SELL 150 BAT for price of 3 DAI each => 150 DAI LOCKED
            await obdex.contract.connect(trader3)
                .createLimitOrder(BAT, toEthUnit('150'), 3, ORDER_SIDE.SELL);

            // Trader3 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader3, '300', '0');
            assertTraderBalance(obdex, bat, trader3, '850', '50');

            // Trader1 Balance DAI, BAT
            assertTraderBalance(obdex, dai, trader1, '700', '0');
            assertTraderBalance(obdex, bat, trader1, '100', '0');
            
            // Check BAT BUY Orders
            let buyOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            // Check BAT SELL Orders
            let sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            assertOrder(sellOrders[0], toEthUnit('150'), 3, trader3, ['100']);

            // Trader3 BUY 10 REP for price of 10 DAI each => 100 DAI LOCKED
            await obdex.contract.connect(trader3)
                .createLimitOrder(REP, toEthUnit('10'), 10, ORDER_SIDE.BUY);
            
            // Trader3 Balance DAI, REP
            assertTraderBalance(obdex, dai, trader3, '300', '100');
            assertTraderBalance(obdex, rep, trader3, '0', '0');
            
            // Trader2 SELL 100 REP for price of 10 DAI each => 100 REP LOCKED
            await obdex.contract.connect(trader2)
                .createLimitOrder(REP, toEthUnit('100'), 10, ORDER_SIDE.SELL);
            
            // Trader3 Balance DAI, REP
            assertTraderBalance(obdex, dai, trader3, '200', '0');
            assertTraderBalance(obdex, rep, trader3, '10', '0');

            // Trader3 Balance DAI, REP
            assertTraderBalance(obdex, dai, trader2, '100', '0');
            assertTraderBalance(obdex, rep, trader2, '900', '90');

            // Check REP BUY Orders
            buyOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            // Check REP SELL Orders
            sellOrders = await obdex.contract.getOrders(REP, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(1);
            assertOrder(sellOrders[0], toEthUnit('100'), 10, trader2, ['10']);
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
            
            amount = toEthUnit('1000');
            
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

            assertTraderBalance(obdex, bat, trader1, '0', '0');

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

            assertTraderBalance(obdex, dai, trader3, '0', '0');

            await obdex.contract.connect(trader4)
                .createLimitOrder(BAT, toEthUnit('1'), 1, ORDER_SIDE.SELL);
            
            await expect(
                obdex.contract.connect(trader3)
                    .createMarketOrder(BAT, toEthUnit('1'), ORDER_SIDE.BUY)
            ).to.be.revertedWith('Low DAI Balance!');
        });

        it('Should NOT create BUY market order if EMPTY Order Book', async () => {
            await loadFixture(marketFixture);

            assertTraderBalance(obdex, dai, trader1, '1000', '0');

            const sellOrders = await obdex.contract.getOrders(BAT, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

            await expect(
                obdex.contract.connect(trader1).createMarketOrder(
                    BAT,
                    amount,
                    ORDER_SIDE.BUY
                )
            ).to.be.revertedWith('Empty Order Book! Please Create Limit Order!');
        });

        it('Should match BUY Market Order against existing Orders', async () => {
            await loadFixture(marketFixture);

            const amountToTrade = toEthUnit('50');
            await obdex.contract.connect(trader2).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader3).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.SELL);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 4, ORDER_SIDE.SELL);

            assertTraderBalance(obdex, zrx, trader2, '950', '50');
            assertTraderBalance(obdex, zrx, trader3, '950', '50');
            assertTraderBalance(obdex, zrx, trader4, '950', '50');

            let buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            let sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(3);

            assertOrder(sellOrders[0], amountToTrade, 2, trader2, [], ORDER_SIDE.SELL, ORDER_TYPE.LIMIT);
            assertOrder(sellOrders[1], amountToTrade, 3, trader3, [], ORDER_SIDE.SELL, ORDER_TYPE.LIMIT);
            assertOrder(sellOrders[2], amountToTrade, 4, trader4, [], ORDER_SIDE.SELL, ORDER_TYPE.LIMIT);

            const amountToBuy = toEthUnit('200');
            await obdex.contract.connect(trader1).createMarketOrder(ZRX, amountToBuy, ORDER_SIDE.BUY);

            buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

            assertTraderBalance(obdex, zrx, trader1, '150', '0');
            assertTraderBalance(obdex, zrx, trader2, '950', '0');
            assertTraderBalance(obdex, zrx, trader3, '950', '0');
            assertTraderBalance(obdex, zrx, trader4, '950', '0');

            assertTraderBalance(obdex, dai, trader1, '550', '0');
            assertTraderBalance(obdex, dai, trader2, '100', '0');
            assertTraderBalance(obdex, dai, trader3, '150', '0');
            assertTraderBalance(obdex, dai, trader4, '1200', '0');

        });

        it('Should match SELL Market Order against existing Orders', async () => {
            await loadFixture(marketFixture);

            const amountToTrade = toEthUnit('50');
            await obdex.contract.connect(trader1).createLimitOrder(ZRX, amountToTrade, 2, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader1).createLimitOrder(ZRX, amountToTrade, 7, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 3, ORDER_SIDE.BUY);
            await obdex.contract.connect(trader4).createLimitOrder(ZRX, amountToTrade, 4, ORDER_SIDE.BUY);

            assertTraderBalance(obdex, dai, trader1, '550', '450');
            assertTraderBalance(obdex, dai, trader4, '650', '350');

            let buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(4);

            assertOrder(buyOrders[0], amountToTrade, 7, trader1, [], ORDER_SIDE.BUY, ORDER_TYPE.LIMIT);
            assertOrder(buyOrders[1], amountToTrade, 4, trader4, [], ORDER_SIDE.BUY, ORDER_TYPE.LIMIT);
            assertOrder(buyOrders[2], amountToTrade, 3, trader4, [], ORDER_SIDE.BUY, ORDER_TYPE.LIMIT);
            assertOrder(buyOrders[3], amountToTrade, 2, trader1, [], ORDER_SIDE.BUY, ORDER_TYPE.LIMIT);
            
            let sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

            await obdex.contract.connect(trader2).createMarketOrder(ZRX, toEthUnit('10'), ORDER_SIDE.SELL);
            
            assertTraderBalance(obdex, dai, trader2, '70', '0');
            assertTraderBalance(obdex, zrx, trader2, '990', '0');

            buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(4);
            assertOrder(buyOrders[0], amountToTrade, 7, trader1, ['10']);

            await obdex.contract.connect(trader2).createMarketOrder(ZRX, toEthUnit('100'), ORDER_SIDE.SELL);

            assertTraderBalance(obdex, dai, trader2, '580', '0');
            assertTraderBalance(obdex, zrx, trader2, '890', '0');

            buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(2);
            assertOrder(buyOrders[0], amountToTrade, 3, trader4, ['10']);
            assertOrder(buyOrders[1], amountToTrade, 2, trader1, []);

            await obdex.contract.connect(trader2).createMarketOrder(ZRX, toEthUnit('200'), ORDER_SIDE.SELL);
            assertTraderBalance(obdex, dai, trader2, '800', '0');
            assertTraderBalance(obdex, zrx, trader2, '800', '0');

            buyOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.BUY);
            expect(buyOrders.length).to.be.equals(0);

            sellOrders = await obdex.contract.getOrders(ZRX, ORDER_SIDE.SELL);
            expect(sellOrders.length).to.be.equals(0);

        });
    });

});