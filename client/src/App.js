import Web3 from 'web3';

import React, { useState, useEffect } from "react";
import Header from './Header.js';
import Footer from './Footer.js';
import Wallet from './Wallet.js';
import NewOrder from "./NewOrder.js";
import ListOrders from "./ListOrders.js";

const SIDE = {BUY: 0, SELL: 1};

function App({web3, accounts, contracts}) {
    const [tokens, setTokens] = useState([]);
    
    const [user, setUser] = useState({
        account: undefined,
        balances: {
            tokenDex: {
                free: 0,
                locked: 0
            },
            daiDex: {
                free: 0,
                locked: 0
            },
            tokenWallet: 0
        },
        selectedToken: undefined
    });

    const [orders, setOrders] = useState({
        buy: [],
        sell: []
    });

    const getBalances = async (account, token) => {
        const tokenDex = await contracts.obdex.methods
            .balances(account, web3.utils.fromAscii(token.ticker))
            .call();
        const daiDex = await contracts.obdex.methods
            .balances(account, web3.utils.fromAscii('DAI'))
            .call();
        const tokenWallet = await contracts[token.ticker].methods
            .balanceOf(account)
            .call();
        return {tokenDex, daiDex, tokenWallet};
    }

    const refreshBalances = async () => {
        const balances = await getBalances(
            user.account,
            user.selectedToken
        );
        setUser(user => ({ ...user, balances: balances}));
    }

    const selectToken = async token => {
        console.log("App selectedToken: ", token);
        setUser({...user, selectedToken: token});
    }

    const getOrders = async () => {
        const orders = await Promise.all([
            contracts.obdex.methods
                .getOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.BUY
                )
                .call(),
            contracts.obdex.methods
                .getOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.SELL
                )
                .call()
        ]);
        console.log("orders: ", {buy: orders[0], sell: orders[1]})

        return {buy: orders[0], sell: orders[1]};
    }

    const refreshOrders = async () => {
        const orders = await getOrders();
        setOrders(orders);
    }

    const deposit = async amount => {
        await contracts[user.selectedToken.ticker].methods
            .approve(contracts.obdex.options.address, amount)
            .send({from: user.account});
        await contracts.obdex.methods
            .deposit(web3.utils.fromAscii(user.selectedToken.ticker), amount)
            .send({from: user.account});
        await refreshBalances();
    }

    const withdraw = async amount => {        
        await contracts.obdex.methods
            .withdraw(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount
            )
            .send({from: user.account});
        await refreshBalances();
    }

    const createMarketOrder = async (amount, side) => {
        await contracts.obdex.methods
            .createMarketOrder(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount, 
                side
            )
            .send({from: user.account});
        await refreshBalances();
        await refreshOrders();
    }
    
    const createLimitOrder = async (amount, price, side) => {
        await contracts.obdex.methods
            .createLimitOrder(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount, 
                price,
                side
            )
            .send({from: user.account});
        await refreshBalances();
        await refreshOrders();
    }

    const cancelOrder = async (order) => {
        await contracts.obdex.methods
            .cancelOrder(
                web3.utils.fromAscii(user.selectedToken.ticker),
                order.id, 
                order.orderSide
            )
            .send({from: user.account});
        await refreshBalances();
        await refreshOrders();
    }
    
    useEffect(() => {
        const init = async () => {
            // List of tokens with Bytes32
            const rawTokens = await contracts.obdex.methods.getTokens().call(); 
            
            // Mape the Bytes32 to String
            const tokens = rawTokens.map(token => ({
                ...token,
                ticker: web3.utils.hexToUtf8(token.ticker)
            }));
            
            setTokens(tokens);
            console.log("tokens: ", tokens);
            const balances = await getBalances(accounts[0], tokens[0]);
            console.log("balances: ", balances);
            setUser({account: accounts[0], balances: balances, selectedToken: tokens[0]});
            console.log("user: ", user);
        }
        init();
    }, []);

    useEffect(() => {
        const init = async () => {
            
            await refreshBalances();
            await refreshOrders();
        }

        if(typeof user.selectedToken !== 'undefined') {
            init();
        }
    }, [user.selectedToken]); 


    if(typeof user.selectedToken === 'undefined') {
        return <div>Loading...</div>;
    }

    return (
        <div id="app">
            
            <Header
                contracts={contracts}
                tokens={tokens}
                selectToken={selectToken}
            />
            
            <main className="container-fluid">
                <div className="row">
                    <div className="col-sm-4 first-col">
                        <Wallet 
                            user={user}
                            deposit={deposit}
                            withdraw={withdraw}
                        />

                        {user.selectedToken.ticker !== 'DAI' ? 
                            <NewOrder 
                                createLimitOrder={createLimitOrder} 
                                createMarketOrder={createMarketOrder}
                            />
                        : null}
                    </div>
                    <div className="col-sm second-col">
                    {user.selectedToken.ticker !== 'DAI' ? <ListOrders orders={orders} user={user} cancelOrder={cancelOrder}/> : null}
                    </div>
                    
                </div>
            </main>

            <Footer/>
        </div>
    );
}

export default App;
