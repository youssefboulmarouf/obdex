import React from 'react'; 
import DexDropdown from './DexDropdown.js';

function Header({contracts, tokens, selectToken}) {
    console.log("Header tokens : ", tokens)
    return (
        <header id='header' className='card'>
            <div className='row'>
                <div className='col-sm-3 flex'>
                    <DexDropdown 
                        onSelect={selectToken}
                        tokens={tokens}
                    />
                </div>
                <div className='col-sm-9'>
                    <h1 className='header-title'>
                        OBDex - 
                        <span className='contract-address'>
                            Contract Address: 
                            <span className='address'>
                                {contracts.dex.options.address}
                            </span>
                        </span>
                    </h1>
                </div>
            </div>
        </header>
    );
}

export default Header;