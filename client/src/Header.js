import React from 'react'; 
import DexDropdown from './DexDropdown.js';

function Header({tokens, contracts, selectToken}) {
    return (
        <header id='header' className='card'>
            <div className='row'>
                <div className='col-sm-3 flex'>
                    <DexDropdown 
                        items={tokens}
                        onSelect={selectToken}
                    />
                </div>
                <div className='col-sm-9'>
                    <h1 className='header-title'>
                        DEX - 
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