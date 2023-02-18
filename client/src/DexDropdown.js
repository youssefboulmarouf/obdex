import React from 'react';

function DexDropdown({onSelect, tokens}) {

    console.log("Dropdown tokens : ", tokens)

    const selectItem = (token) => {
        console.log("Dropdown item: ", token);
        onSelect(token);
    }

    return (
        <div>
            <select>
                {tokens && tokens.map((token, i) => <option key={i} onClick={() => selectItem(token)}>{token.ticker}</option>)}
            </select>
        </div>
    );
}

export default DexDropdown;