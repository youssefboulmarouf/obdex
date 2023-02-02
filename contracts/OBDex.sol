// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol';

contract OBDex {
    using SafeMath for uint;

    // --- Enums ---
    enum ORDER_SIDE { BUY, SELL }
    enum ORDER_TYPE { MARKET, LIMIT }

    // --- Structs ---
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

    // --- Variables ---
    address     public admin; // Contract owner
    bytes32[]   public tickerList; 
    uint        public nextOrderId; // Order id tracker
    uint        public nextTradeId; // Trader id tracker

    mapping (bytes32 => Token)                          public tokens;
    mapping (address => mapping (bytes32 => Balance))   public balances;
    mapping (bytes32 => mapping (uint => Order[]))      public orderBook;
    
    // --- Contract Constructor ---
    constructor() { admin = msg.sender; }


    // --- Access Controle ---
    modifier onlyAdmin() {
        require(admin == msg.sender, "Unauthorized! Only Admin can perform this action.");
        _;
    }
}