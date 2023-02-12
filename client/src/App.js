import React, { useState, useEffect } from "react";
import Header from './Header.js';
import Footer from './Footer.js';
import Wallet from './Wallet.js';
import NewOrder from "./NewOrder.js";
import AllOrders from "./AllOrders.js";

const SIDE = {BUY: 0, SELL: 1};

function App({web3, accounts, contracts}) {
    const [tokens, setTokens] = useState([]);
    const [user, setUser] = useState({
        accounts: [],
        balances: {
            tokenDex: {
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

    const [ordersHistory, setOrdersHistory] = useState({
        buy: [],
        sell: []
    });

    const getBalances = async (account, token) => {
        const tokenDex = await contracts.dex.methods
            .balances(account, web3.utils.fromAscii(token.ticker))
            .call();
        console.log("tokenDex: ", tokenDex);
        const tokenWallet = await contracts[token.ticker].methods
            .balanceOf(account)
            .call();
        console.log("tokenWallet: ", tokenWallet);
        return {tokenDex, tokenWallet};
    }

    const refreshBalances = async () => {
        const balances = await getBalances(
            user.accounts[0],
            user.selectedToken
        );
        setUser(user => ({ ...user, balances: balances}));
    }

    const selectToken = async token => {
        setUser({...user, selectedToken: token});
    }

    const refreshOrders = async () => {
        const orders = await getOrders();
        setOrders(orders);
    }

    const getOrders = async () => {
        const orders = await Promise.all([
            contracts.dex.methods
                .getOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.BUY
                )
                .call(),
            contracts.dex.methods
                .getOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.SELL
                )
                .call()
        ]);
        console.log("orders: ", {buy: orders[0], sell: orders[1]})

        return {buy: orders[0], sell: orders[1]};
    }

    const refreshOrdersHistory = async () => {
        const orders = await getHistoricalOrders();
        setOrdersHistory(orders);
    }

    const getHistoricalOrders = async () => {
        const orders = await Promise.all([
            contracts.dex.methods
                .getHistoricalOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.BUY
                )
                .call(),
            contracts.dex.methods
                .getHistoricalOrders(
                    web3.utils.fromAscii(user.selectedToken.ticker),
                    SIDE.SELL
                )
                .call()
        ]);
        console.log("orders: ", {buy: orders[0], sell: orders[1]})

        return {buy: orders[0], sell: orders[1]};
    }

    const deposit = async amount => {
        await contracts[user.selectedToken.ticker].methods
            .approve(contracts.dex.options.address, amount)
            .send({from: user.accounts[0]});
        await contracts.dex.methods
            .deposit(web3.utils.fromAscii(user.selectedToken.ticker), amount)
            .send({from: user.accounts[0]});
        await refreshBalances();
    }

    const withdraw = async amount => {        
        await contracts.dex.methods
            .withdraw(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount
            )
            .send({from: user.accounts[0]});
        await refreshBalances();
    }

    const createMarketOrder = async (amount, side) => {
        await contracts.dex.methods
            .createMarketOrder(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount, 
                side
            )
            .send({from: user.accounts[0]});
        await refreshBalances();
        await refreshOrders();
        await refreshOrdersHistory();
    }

    const createLimitOrder = async (amount, price, side) => {
        await contracts.dex.methods
            .createLimitOrder(
                web3.utils.fromAscii(user.selectedToken.ticker),
                amount, 
                price,
                side
            )
            .send({from: user.accounts[0]});
        await refreshBalances();
        await refreshOrders();
        await refreshOrdersHistory();
    }

    useEffect(() => {
        const init = async () => {
            const rawTokens = await contracts.dex.methods.getTokens().call(); 
            console.log("rawTokens: ", rawTokens);
            const tokens = rawTokens.map(token => ({
                ...token,
                ticker: web3.utils.hexToUtf8(token.ticker)
            }));
            console.log("tokens: ", tokens);
            const balances = await getBalances(accounts[0], tokens[0]);
            setTokens(tokens);
            setUser({accounts: accounts, balances: balances, selectedToken: tokens[0]});
            console.log("selectedToken: ", user.selectedToken);
        }
        init();
    }, []);

    useEffect(() => {
        const init = async () => {
            await refreshBalances();
            await refreshOrders();
            await refreshOrdersHistory();
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
                {user.selectedToken.ticker !== 'DAI' ? 
                    <AllOrders orders={orders}/>
                : null}
                <div>Order HISTORY</div>
                {user.selectedToken.ticker !== 'DAI' ? 
                    <AllOrders orders={ordersHistory}/>
                : null}
            </div>
        </main>
        <Footer />
        </div>
    );
}

export default App;
