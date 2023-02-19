import Web3 from 'web3';
import React from 'react';

function Balances({ticker, free, locked}) {
    return (
        <div className="form-group row">
            <label htmlFor="balances" className="col-sm-4 col-form-label">{ticker}</label>
            <div className="col-sm-8">
                Free:
                <input className="form-control" id="balances" disabled value={Web3.utils.fromWei(free.toString(), 'ether')}/>
                Locked:
                <input className="form-control" id="balances" disabled value={Web3.utils.fromWei(locked.toString(), 'ether')}/>
            </div>
        </div>
    );
}

export default Balances;