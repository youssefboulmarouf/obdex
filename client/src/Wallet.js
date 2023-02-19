import Web3 from 'web3';
import React, { useState } from 'react';
import Balances from './Balances';

const DIRECTION = {
    WITHDRAW: 'WITHDRAW',
    DEPOSIT: 'DEPOSIT'
};

function Wallet({deposit, withdraw, user}) {
    const [direction, setDirection] = useState(DIRECTION.DEPOSIT);
    const [amount, setAmount] = useState(0);

    const onSubmit = (e) => {
        e.preventDefault();
        if(direction === DIRECTION.DEPOSIT) {
            deposit(amount);
        } else {
            withdraw(amount);
        }
    }

    return (
        <div id="wallet" className="card">
            <h2 className="card-title">Wallet</h2>

            <h3>User: {user.account}</h3>
            
            <div className="form-group row">
                <label htmlFor="wallet" className="col-sm-4 col-form-label">Wallet</label>
                <div className="col-sm-8">
                    <input className="form-control" id="wallet" disabled value={Web3.utils.fromWei(user.balances.tokenWallet, 'ether')}/>
                </div>
            </div>

            <Balances id="balances" ticker={user.selectedToken.ticker} free={user.balances.tokenDex.free} locked={user.balances.tokenDex.locked}/>
            {(user.selectedToken.ticker !== 'DAI') ? 
                
                <Balances id="balances" ticker={'DAI'} free={user.balances.daiDex.free} locked={user.balances.daiDex.locked}/>
            : null}

            <h3>Transfer {user.selectedToken.ticker}</h3>
            <form id="transfer" onSubmit={(e) => onSubmit(e)}>
                <div className="form-group row">
                    <label htmlFor="direction" className="col-sm-4 col-form-label">Direction</label>
                    <div className="col-sm-8">
                        <div id="direction" className="btn-group" role="group">
                            <button 
                                type="button" 
                                className={`btn btn-secondary ${direction === DIRECTION.DEPOSIT ? 'active' : ''}`}
                                onClick={() => setDirection(DIRECTION.DEPOSIT)}
                            >Deposit</button>
                            <button 
                                type="button" 
                                className={`btn btn-secondary ${direction === DIRECTION.WITHDRAW ? 'active' : ''}`}
                                onClick={() => setDirection(DIRECTION.WITHDRAW)}
                            >Withdraw</button>          
                            </div>
                    </div>
                </div>
                <div className="form-group row">
                    <label htmlFor="amount" className="col-sm-4 col-form-label">Amount</label>
                    <div className="col-sm-8">
                        <div className="input-group mb-3">
                            <input id="amount" type="text" className="form-control" onChange={(e) => setAmount(Web3.utils.toWei(e.target.value, 'ether'))}/>
                            <div className="input-group-append">
                                <span className="input-group-text">{user.selectedToken.ticker}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                <button type="submit" className="btn btn-primary">Submit</button>
                </div>
            </form>
        </div>
  );
}

export default Wallet;