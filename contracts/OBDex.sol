// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol';
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
    
    bytes32 constant DAI = bytes32("DAI");

    // --- Contract Constructor ---
    constructor() { admin = msg.sender; }

    // --- Add Token ---
    function addToken(bytes32 _ticker, address _tokenAddress) 
        external onlyAdmin() {

        tokens[_ticker] = Token(_ticker, _tokenAddress); 
        tickerList.push(_ticker);
    }

    // --- Get Tokens ---
    function getTokens() 
        external view returns(Token[] memory) {

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
    function getTickerList() 
        external view returns(bytes32[] memory) {
        
        return tickerList;
    }

    // --- Get Orders ---
    function getOrders(bytes32 _ticker, ORDER_SIDE _side) 
        external view returns(Order[] memory) {
        
        return orderBook[_ticker][uint(_side)];
    }

    // --- Deposit Tokens ---
    function deposit(bytes32 _ticker, uint _amount) 
        external tokenExist(_ticker) { 

        // TODO: Add check for ERC20 token
        IERC20 token = IERC20(tokens[_ticker].tokenAddress);
        token.transferFrom(msg.sender, address(this), _amount);
        balances[msg.sender][_ticker].free = balances[msg.sender][_ticker].free.add(_amount);
    }

    // --- Withdraw Tokens ---
    function withdraw(bytes32 _ticker, uint _amount) 
        external tokenExist(_ticker) hasEnoughBalance(_ticker, _amount) {

        IERC20 token = IERC20(tokens[_ticker].tokenAddress);
        balances[msg.sender][_ticker].free = balances[msg.sender][_ticker].free.sub(_amount);
        token.transfer(msg.sender, _amount);
    }

    // --- Create Limit Order ---
    function createOrder(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE _side, ORDER_TYPE _type) 
        external tokenExist(_ticker) notDai(_ticker) hasEnoughTokenToSell(_ticker, _amount, _side) 
        hasEnoughDaiToBuy(_amount, _price, _side, _type) ordersExists(_ticker, _side, _type) {
        
        if (_type == ORDER_TYPE.LIMIT) {
            // Deduce And Lock Amount Of Tokens
            lockTokens(_ticker, _amount, _price, _side, ORDER_TYPE.LIMIT);

            // Create And Match Orders
            manageOrders(_ticker, _amount, _price, _side, ORDER_TYPE.LIMIT);
        } else if (_type == ORDER_TYPE.MARKET) {

            // Deduce amount to lock
            // since we don't know how much the Market order 
            // will consume from the existing Limit orders
            uint _amountToLock = deduceAmountToLock(_ticker, _amount, _side);
            
            // Deduce Market Price
            uint marketPrice = deduceMarketPrice(_ticker, _side);

            // Trader Should Have Enough DAI Balance To Buy
            if (_side == ORDER_SIDE.BUY) {            
                require(balances[msg.sender][DAI].free >= _amountToLock, "Low DAI Balance!!!");
            }

            lockTokens(_ticker, _amountToLock, marketPrice, _side, ORDER_TYPE.MARKET);
            manageOrders(_ticker, _amount, marketPrice, _side, ORDER_TYPE.MARKET);

        } else {
            revert("Only Limit And Market Orders Are Allowed!");
        }
    }

    // --- Deduce And Lock Amount Of Tokens ---
    function lockTokens(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE side, ORDER_TYPE orderType) 
        internal {
        
        bytes32 tokenToLock = _ticker;
        uint _amountToLock = _amount;

        if (side == ORDER_SIDE.BUY) {
            tokenToLock = DAI;
            if (orderType == ORDER_TYPE.LIMIT) { 
                _amountToLock = SafeMath.mul(_amount, _price);
            }
        }

        lock(tokenToLock, _amountToLock);
    }

    // --- Lock Tokens ---
    function lock(bytes32 _ticker, uint _amount) internal {
        balances[msg.sender][_ticker].locked = balances[msg.sender][_ticker].locked.add(_amount);
        balances[msg.sender][_ticker].free = balances[msg.sender][_ticker].free.sub(_amount);
    }

    // --- Create And Match Orders ---
    function manageOrders(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE _side, ORDER_TYPE _orderType) 
        internal {
        
        Order storage newOrder = createOrder(_ticker, _side, _orderType, _amount, _price);
        sortOrders(_ticker, _side);

        Order[] storage oppositeOrders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];
        if (oppositeOrders.length > 0) {
            matchOrders(newOrder);
            cleanOrders(_ticker);
        }
    }

    // --- Create Orders ---
    function createOrder(bytes32 _ticker, ORDER_SIDE _side, ORDER_TYPE _orderType, uint _amount, uint _price) 
        internal returns(Order storage) {
        
        uint[] memory fills;

        Order memory order = Order(nextOrderId, msg.sender, _side, _orderType, _ticker, _amount, fills, _price, block.timestamp);
        orderBook[_ticker][uint(_side)].push(order);
        nextOrderId = nextOrderId.add(1);

        Order storage newOrder = orderBook[_ticker][uint(_side)][orderBook[_ticker][uint(_side)].length - 1];
        return newOrder;
    }

    // --- Sort Orders ---
    function sortOrders(bytes32 _ticker, ORDER_SIDE _side) 
        internal returns(Order[] storage) {
        
        Order[] storage orders = orderBook[_ticker][uint(_side)];
        uint index = (orders.length > 0) ? (orders.length - 1) : 0;
        
        // SORT BY PRICE
        while(index > 0) {
            if (orders[index - 1].price < orders[index].price) {
                    break;
            }
            Order memory order = orders[index - 1];
            orders[index - 1] = orders[index];
            orders[index] = order;
            index = index.sub(1);
        }

        return orders;
    }

    // --- Match New Order Agaist Existing Opposite Orders ---
    function matchOrders(Order storage _orderToMatch) internal {
        Order[] storage otherSideOrders = orderBook[_orderToMatch.ticker][
            uint(_orderToMatch.orderSide == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)
        ];
        
        uint index;
        uint remaining = _orderToMatch.amount;

        while(index < otherSideOrders.length && remaining > 0) {

            if (_orderToMatch.orderType == ORDER_TYPE.MARKET && remaining > 0) {
                remaining = matchSignleOrder(_orderToMatch, otherSideOrders[index], remaining);
            } else if (_orderToMatch.orderType == ORDER_TYPE.LIMIT && otherSideOrders[index].price == _orderToMatch.price) {
                remaining = matchSignleOrder(_orderToMatch, otherSideOrders[index], remaining);
            }

            index = index.add(1);
        }
    }

    // --- Execute The Orders Matching ---
    function matchSignleOrder(Order storage _orderToMatch, Order storage _oppositeOrder, uint _remaining) internal returns(uint) {
        // How much amount filled
        uint orderAmountFilled = amountFilled(_oppositeOrder);
        
        // How much amount available
        uint available = SafeMath.sub(_oppositeOrder.amount, orderAmountFilled);
        // How much amount matched
        uint matched = (_remaining > available) ? available : _remaining;
        uint remaining = SafeMath.sub(_remaining, matched);

        _oppositeOrder.fills.push(matched);
        _orderToMatch.fills.push(matched);
        adjustBalances(_orderToMatch, matched, _oppositeOrder);
        
        emitNewTradeEvent(_orderToMatch, _oppositeOrder, matched);

        return remaining;
    }

    // --- Emit New Trade Event ---
    function emitNewTradeEvent(Order storage _orderToMatch, Order storage _oppositeOrder, uint _matched) internal {
        Order memory buyOrder;
        Order memory sellOrder;

        if (_orderToMatch.orderSide == ORDER_SIDE.BUY) {
            buyOrder = _orderToMatch;
            sellOrder = _oppositeOrder;
        } else {
            buyOrder = _oppositeOrder;
            sellOrder = _orderToMatch;
        }
        
        emit NewTrade(
            nextTradeId, 
            buyOrder.id, 
            sellOrder.id, 
            _orderToMatch.ticker, 
            buyOrder.traderAddress, 
            sellOrder.traderAddress, 
            _matched, 
            _oppositeOrder.price, 
            block.timestamp
        );

        nextTradeId = nextTradeId.add(1);
    }

    // --- Adjust Traders Balances ---
    function adjustBalances(Order storage _orderToMatch, uint _matched, Order storage _oppositeOrder) internal {
        uint finalPrice = SafeMath.mul(_matched, _oppositeOrder.price);

        if(_orderToMatch.orderSide == ORDER_SIDE.SELL) {
            balances[msg.sender][_orderToMatch.ticker].locked = balances[msg.sender][_orderToMatch.ticker].locked.sub(_matched);
            balances[_oppositeOrder.traderAddress][DAI].locked = balances[_oppositeOrder.traderAddress][DAI].locked.sub(finalPrice);

            balances[msg.sender][DAI].free = balances[msg.sender][DAI].free.add(finalPrice);
            balances[_oppositeOrder.traderAddress][_orderToMatch.ticker].free = balances[_oppositeOrder.traderAddress][_orderToMatch.ticker].free.add(_matched);
        } else if(_orderToMatch.orderSide == ORDER_SIDE.BUY) {
            require(balances[msg.sender][DAI].locked >= finalPrice, "Low DAI Balance!!!");

            balances[msg.sender][DAI].locked = balances[msg.sender][DAI].locked.sub(finalPrice);
            balances[_oppositeOrder.traderAddress][_orderToMatch.ticker].locked = balances[_oppositeOrder.traderAddress][_orderToMatch.ticker].locked.sub(_matched);

            balances[msg.sender][_orderToMatch.ticker].free = balances[msg.sender][_orderToMatch.ticker].free.add(_matched);
            balances[_oppositeOrder.traderAddress][DAI].free = balances[_oppositeOrder.traderAddress][DAI].free.add(finalPrice);
        }
    }

    // --- Remove Filled Orders From Both Order_Sides ---
    function cleanOrders(bytes32 _ticker) internal {
        clearFilledOrdersSide(_ticker, ORDER_SIDE.BUY);
        clearFilledOrdersSide(_ticker, ORDER_SIDE.SELL);
    }

    // --- Remove Filled Orders By Order_Side ---
    function clearFilledOrdersSide(bytes32 _ticker, ORDER_SIDE _side) internal {
        uint index = 0;
        Order[] storage orders = orderBook[_ticker][uint(_side)];
        
        while(index < orders.length && (amountFilled(orders[index]) == orders[index].amount || orders[index].orderType == ORDER_TYPE.MARKET)) {
            bool isOffset = false;

            for(uint j = index; j < orders.length - 1; j = j.add(1)) {
                orders[j] = orders[j + 1];
                isOffset = true;
            }
            
            orders.pop();
            if(!isOffset) {
                index = index.add(1);
            }
        }
    }

    // --- Deduce Amount Of Tokens To Lock ---
    function deduceAmountToLock(bytes32 _ticker, uint _amount, ORDER_SIDE _side) internal view returns(uint){
        Order[] memory oppositeOrders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];

        uint index;
        uint remaining = _amount;

        uint _amountToLock = 0;

        while(index < oppositeOrders.length && remaining > 0) {
            uint orderAmountFilled = amountFilled(oppositeOrders[index]);
            uint available = SafeMath.sub(oppositeOrders[index].amount, orderAmountFilled);
            uint matched = (remaining > available) ? available : remaining;

            if (_side == ORDER_SIDE.BUY) {
                _amountToLock = SafeMath.add(_amountToLock, SafeMath.mul(matched, oppositeOrders[index].price));
            } else if (_side == ORDER_SIDE.SELL) {
                _amountToLock = SafeMath.add(_amountToLock, matched);
            }

            remaining = remaining.sub(matched);

            index = index.add(1);
        }

        return _amountToLock;
    }

    // --- Compute The Filled Amount Of An Order ---
    function amountFilled(Order memory _oppositeOrder) internal pure returns(uint) {
        uint filledAmount;
        
        for (uint i; i < _oppositeOrder.fills.length; i = i.add(1)) {
            filledAmount = filledAmount.add(_oppositeOrder.fills[i]);
        }

        return filledAmount;
    }

    // --- Deduce Market Price ---
    function deduceMarketPrice(bytes32 _ticker, ORDER_SIDE _side) internal view returns(uint) {
        Order[] storage orders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];
        return orders[0].price;
    }

    // --- Modifier: Admin Access Controle ---
    modifier onlyAdmin() {
        require(admin == msg.sender, "Unauthorized! Only Admin can perform this action.");
        _;
    }

    // --- Modifier: Token Should Exist ---
    modifier tokenExist(bytes32 ticker) {
        require(tokens[ticker].tokenAddress != address(0), "Ticker Does Not Exist!");
        _;
    }

    // --- Modifier: Token Should Not Be DAI ---
    modifier notDai(bytes32 ticker) {
        require(ticker != DAI, "Cannot Trade DAI Token!");
        _;
    }

    // --- Modifier: Trader Should Have Enough Balance For Action ---
    modifier hasEnoughBalance(bytes32 ticker, uint amount) {
        require(balances[msg.sender][ticker].free >= amount, "Low Token Balance!");
        _;
    }

    // --- Modifier: Trader Should Have Enough Token Balance To Sell ---
    modifier hasEnoughTokenToSell(bytes32 ticker, uint amount, ORDER_SIDE side) {
        if (side == ORDER_SIDE.SELL) {
            require(balances[msg.sender][ticker].free >= amount, "Low Token Balance!!!");
        }
        _;
    }

    // --- Modifier: Trader Should Have Enough DAI Balance To Buy ---
    modifier hasEnoughDaiToBuy(uint _amount, uint _price, ORDER_SIDE _side, ORDER_TYPE _type) {
        // This should ONLY be checked on LIMIT orders 
        // since we know the exact amount and price
        // which is not the case in MARKET orders
        if (_side == ORDER_SIDE.BUY &&_type == ORDER_TYPE.LIMIT) {
            require(balances[msg.sender][DAI].free >= SafeMath.mul(_amount, _price), "Low DAI Balance!!!");
        }
        _;
    }

    // --- Modifier: Orders Should Exist To Open Market Orders ---
    modifier ordersExists(bytes32 _ticker, ORDER_SIDE _side, ORDER_TYPE _type) {
        // This should ONLY be checked on MARKET orders 
        // since we need orders to match against
        if (_type == ORDER_TYPE.MARKET) {
            Order[] memory orders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];
            require(orders.length > 0, "Empty Order Book! Please Create Limit Order!");
        }
        _;
    }    
}