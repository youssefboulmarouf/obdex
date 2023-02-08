const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('OBDex', () => {

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
        const ticker = ethers.utils.formatBytes32String(tokenName);

        // Trader's balance of Token in OBDex Wallet 
        const obdexBalances = await obdex.contract.balances(trader.address, ticker);

        return obdexBalances;
    }

    // const obdexFixture = async () => {
    //     // Deploy the contracts
    //     const [dai, bat, rep, zrx] = await Promise.all(
    //         ['Dai', 'Bat', 'Rep', 'Zrx'].map(contractName => deploy(contractName))
    //     );
    //     const obdex = await deploy('OBDex');

    //     // Add Tokens To OBDex
    //     await Promise.all([
    //     [['DAI', dai], ['ZRX', zrx], ['REP', rep], ['BAT', bat]].map(([ticker, token]) => 
    //         obdex.contract.addToken(
    //             hre.ethers.utils.formatBytes32String(ticker), // Converting Ticker from String to Bytes32
    //             token.contract.address
    //         )
    //     )]);

    //     const tokens = await obdex.contract.getTokens();
    //     //console.log('tokens:', tokens);

    //     // Seed Traders Accounts
    //     const amount = hre.ethers.utils.parseUnits('1000', 'ether');
    //     // --- hardhat accounts
    //     const [owner, trader1, trader2, trader3, trader4, others] = await hre.ethers.getSigners();
    //     await Promise.all([
    //         [trader1, trader2, trader3, trader4].map(trader => 
    //             seedTraderWallet(obdex, trader, [dai, bat, rep, zrx], amount)
    //         )
    //     ]);
    // }z

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
                obdex.contract.connect(trader).addToken(
                    hre.ethers.utils.formatBytes32String('DAI'),
                    dai.contract.address
                )
            ).to.be.revertedWith('Unauthorized! Only Admin can perform this action.');
        });

        it('Should Have Correct Tokens', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(
                hre.ethers.utils.formatBytes32String('DAI'),
                dai.contract.address
            );

            const tokens = await obdex.contract.connect(owner).getTokens();
            
            expect(tokens.length).to.be.equals(1);
            expect(tokens[0].ticker).to.be.equals(hre.ethers.utils.formatBytes32String('DAI'));
            expect(tokens[0].tokenAddress).to.be.equals(dai.contract.address);

        });
        
        it('Should NOT Add Token Twice', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(
                hre.ethers.utils.formatBytes32String('DAI'),
                dai.contract.address
            );

            await expect(
                obdex.contract.connect(owner).addToken(
                    hre.ethers.utils.formatBytes32String('DAI'),
                    dai.contract.address
                )
            ).to.be.revertedWith('Ticker Already Exist!');
        });

        it('Should have correct Ticker list', async () => {
            await loadFixture(tokenFixture);

            await obdex.contract.connect(owner).addToken(
                hre.ethers.utils.formatBytes32String('DAI'),
                dai.contract.address
            );

            const tickerList = await obdex.contract.connect(owner).getTickerList();
            
            expect(tickerList.length).to.be.equals(1);
            expect(tickerList[0]).to.be.equals(hre.ethers.utils.formatBytes32String('DAI'));
        });
        
    });

    describe('Deposit', () => {
        let obdex, dai, owner, trader;

        const depositFixture = async () => {
            obdex = await deploy('OBDex');
            dai = await deploy('Dai');

            [owner, trader] = await hre.ethers.getSigners();

            await obdex.contract.connect(owner).addToken(
                hre.ethers.utils.formatBytes32String('DAI'),
                dai.contract.address
            );
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
            await obdex.contract.connect(trader).deposit(
                ethers.utils.formatBytes32String('DAI'), 
                amount
            );

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

            await obdex.contract.connect(owner).addToken(
                hre.ethers.utils.formatBytes32String('DAI'),
                dai.contract.address
            );
            
            amount = hre.ethers.utils.parseUnits('1000', 'ether');
            
            await seedTraderWallet(obdex, trader, [dai], amount);
            
            await obdex.contract.connect(trader).deposit(
                ethers.utils.formatBytes32String('DAI'), 
                amount
            );
        }

        it('Should withdraw if enough Balance', async() => {
            await loadFixture(withdrawFixture);

            let obdexBalances = await getTraderBalance(obdex, dai, trader);
            let daiBalance = await dai.contract.balanceOf(trader.address);
            expect(obdexBalances.free).to.be.equals(amount);
            expect(daiBalance).to.be.equals(0);

            const withdrawAmount = hre.ethers.utils.parseUnits('100', 'ether');
            await obdex.contract.connect(trader).withdraw(
                hre.ethers.utils.formatBytes32String('DAI'),
                withdrawAmount
            );

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
                obdex.contract.connect(trader).withdraw(
                    hre.ethers.utils.formatBytes32String('DAI'),
                    withdrawAmount
                )
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

    describe('Balance', () => {});

    describe('Limit Order', () => {});

    describe('Market Order', () => {});

});