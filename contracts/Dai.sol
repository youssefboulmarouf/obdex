// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Dai is ERC20 {

    constructor() ERC20("DAI", "Dai Stable Coin") {}

    function faucet(address account, uint amount) external {
        _mint(account, amount);
    }
}
