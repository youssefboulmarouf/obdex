// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OBDex {

    // Enums
    enum ORDER_SIDE { BUY, SELL }
    enum ORDER_TYPE { MARKET, LIMIT }

    // struct
    struct Balance { 
        uint free; // Free balance
        uint locked; // Locked balance for orders in the order book
    }
    
    struct Token { 
        bytes32 ticker; // Ticker of the token to be traded
        address tokenAddress; // Address of the token
    }

    struct Order { 
        uint id; // Id of the order, too be incremented after each new order
        address traderAddress; // Order owner 
        ORDER_SIDE orderSide; // BUY or SELL 
        ORDER_TYPE orderType; // LIMIT OR MAKET
        bytes32 ticker; 
        uint amount; 
        uint[] fills; 
        uint price; 
        uint date;
    }

    // Event to track new trades (order matching)
    event NewTrade( 
        uint id, 
        uint buyOrderId, 
        uint sellOrderId, 
        bytes32 indexed ticker, 
        address indexed buyerTrader, 
        address indexed sellerTraderr, 
        uint amount, 
        uint price, 
        uint date
    );

    

}