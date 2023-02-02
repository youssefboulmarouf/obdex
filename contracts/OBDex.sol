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

    // --- Add Token ---
    function addToken(bytes32 _ticker, address _tokenAddress) external onlyAdmin() {
        tokens[_ticker] = Token(_ticker, _tokenAddress); 
        tickerList.push(_ticker);
    }

    // --- Get Tokens ---
    function getTokens() external view returns(Token[] memory) {
        // Since we can't return a mipping in Solidity
        // We have to convert the Tokens mapping to Token List

        // Creating a memory list of Tokens
        Token[] memory _tokens = new Token[](tickerList.length);

        // Populating the list a memory list of Tokens
        for (uint i = 0; i < tickerList.length; i++) {
            bytes32 currentTicker = tickerList[i];
            address tokenAddress = tokens[currentTicker].tokenAddress;
            _tokens[i] = Token(currentTicker, tokenAddress);
        }

        return _tokens;
    }

    // --- Get Ticker List ---
    function getTickerList() external view returns(bytes32[] memory) {
        return tickerList;
    }

    // --- Get Orders ---
    function getOrders(bytes32 ticker, ORDER_SIDE side) external view returns(Order[] memory) {
        return orderBook[ticker][uint(side)];
    }


    // --- Access Controle ---
    modifier onlyAdmin() {
        require(admin == msg.sender, "Unauthorized! Only Admin can perform this action.");
        _;
    }
}