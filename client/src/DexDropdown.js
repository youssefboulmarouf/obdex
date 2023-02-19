import React from 'react';
import Select from 'react-select'

function DexDropdown({onSelect, tokens}) {

    const options = [];
    {tokens && tokens.map(token => options.push({value: token, label:token.ticker}))}

    const selectItem = (event) => {
        //console.log("Dropdown change event: ", event);
        onSelect(event.value);
    }

    return (
        <div>
            <Select 
                defaultValue={{value: tokens[0], label:tokens[0].ticker}}
                options={tokens && tokens.map(token => ({value: token, label:token.ticker}) )} 
                onChange={(event) => selectItem(event)}
            />
        </div>
    );
}

export default DexDropdown;