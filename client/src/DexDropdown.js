import React from 'react';

function DexDropdown({onSelect, items}) {

    const selectItem = (item) => {
        onSelect(item);
        console.log("item: ", item);
    }

    return (
        <div>
            <select>
                {items && items.map((item, i) => <option key={i} onClick={() => selectItem(item)}>{item.ticker}</option>)}
            </select>
        </div>
    );
}

export default DexDropdown;