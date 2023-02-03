// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import '../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol';
import "../node_modules/@openzeppelin/contracts/utils/Strings.sol";

contract Dex {
    using SafeMath for uint;

    ////////////////////////////////////////////////////////////////////////
    enum SIDE { BUY, SELL }
    enum TYPE { MARKET, LIMIT }
    struct Balance { uint free; uint locked; }
    struct Token { bytes32 ticker; address tokenAddress; }
    struct Order { uint id; address trader; SIDE side; TYPE orderType; bytes32 ticker; uint amount; uint[] fills; uint price; uint date;}
    event NewTrade(uint tradeId, uint order1Id, uint order2Id, bytes32 indexed ticker, address indexed order1trader, address indexed order2trader, uint amount, uint price, uint date);

    ////////////////////////////////////////////////////////////////////////
    address public admin;    
    bytes32[] public tickerList;
    mapping(bytes32 => Token) public tokens;
    mapping(address => mapping(bytes32 => Balance)) public balances;
    mapping(bytes32 => mapping(uint => Order[])) public orderBook;
    mapping(bytes32 => mapping(uint => Order[])) public ordersHistory;
    uint public nextOrderId;
    uint public nextTradeId;

    ////////////////////////////////////////////////////////////////////////
    bytes32 constant DAI = bytes32("DAI");
    
    ////////////////////////////////////////////////////////////////////////
    constructor() {
        admin = msg.sender;
    }

    ////////////////////////////////////////////////////////////////////////
    function addToken(bytes32 ticker, address tokenAddress) external onlyAdmin() {
        tokens[ticker] = Token(ticker, tokenAddress); 
        tickerList.push(ticker);
    }

    function getTokens() external view returns(Token[] memory) {
        Token[] memory _tokens = new Token[](tickerList.length);

        for (uint i = 0; i < tickerList.length; i++) {
            bytes32 ticker = tokens[tickerList[i]].ticker;
            address tokenAddress = tokens[tickerList[i]].tokenAddress;
            _tokens[i] = Token(ticker, tokenAddress);
        }
        return _tokens;
    }

    function getTickerList() external view returns(bytes32[] memory) {
        return tickerList;
    }

    function getOrders(bytes32 ticker, SIDE side) external view returns(Order[] memory) {
        return orderBook[ticker][uint(side)];
    }

    function getHistoricalOrders(bytes32 ticker, SIDE side) external view returns(Order[] memory) {
        return ordersHistory[ticker][uint(side)];
    }

    ////////////////////////////////////////////////////////////////////////
    function deposit(bytes32 ticker, uint amount) external tokenExist(ticker) { 
        IERC20(tokens[ticker].tokenAddress).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][ticker].free = balances[msg.sender][ticker].free.add(amount);
    }

    function withdraw(bytes32 ticker, uint amount) external tokenExist(ticker) hasEnoughBalance(ticker, amount) {
        IERC20(tokens[ticker].tokenAddress).transfer(msg.sender, amount);
        balances[msg.sender][ticker].free = balances[msg.sender][ticker].free.sub(amount);
    }

    ////////////////////////////////////////////////////////////////////////
    function createLimitOrder(bytes32 ticker, uint amount, uint price, SIDE side) external orderModifier(ticker, amount, side) hasEnoughDaiToBuy(amount, price, side) {
        lockTokens(ticker, amount, price, side, TYPE.LIMIT);
        manageOrders(ticker, amount, side, TYPE.LIMIT, price);
    }

    function createMarketOrder(bytes32 ticker, uint amount, SIDE side) external orderModifier(ticker, amount, side) ordersExists(ticker, side) {
        uint _amountToLock = deduceAmountToLock(ticker, amount, side);
        uint price = deduceMarketPrice(ticker, side);

        if (side == SIDE.BUY) {            
            require(balances[msg.sender][DAI].free >= _amountToLock, "Low DAI Balance!!!");
        }  
        
        lockTokens(ticker, _amountToLock, price, side, TYPE.MARKET);
        manageOrders(ticker, amount, side, TYPE.MARKET, price);
        
        
    }

    //////////////////////////////////////////////////////////////////////// Order Manager
    function manageOrders(bytes32 ticker, uint amount, SIDE side, TYPE orderType, uint price) internal {
        Order storage newOrder = createOrder(ticker, side, orderType, amount, price);
        sortOrders(ticker, side);

        Order[] storage oppositeOrders = orderBook[ticker][uint(side == SIDE.BUY ? SIDE.SELL : SIDE.BUY)];
        if (oppositeOrders.length > 0) {
            matchOrders(newOrder);
            cleanOrders(ticker);
        }
    }

    function createOrder(bytes32 ticker, SIDE side, TYPE orderType, uint amount, uint price) internal returns(Order storage) {
        uint[] memory fills;

        Order memory order = Order(nextOrderId, msg.sender, side, orderType, ticker, amount, fills, price, block.timestamp);
        orderBook[ticker][uint(side)].push(order);
        nextOrderId = nextOrderId.add(1);

        Order storage newOrder = orderBook[ticker][uint(side)][orderBook[ticker][uint(side)].length - 1];
        return newOrder;
    }

    //////////////////////////////////////////////////////////////////////// Matching
    function matchOrders(Order storage orderToMatch) internal {
        Order[] storage otherSideOrders = orderBook[orderToMatch.ticker][uint(orderToMatch.side == SIDE.BUY ? SIDE.SELL : SIDE.BUY)];
        
        uint index;
        uint remaining = orderToMatch.amount;

        while(index < otherSideOrders.length && remaining > 0) {

            if (orderToMatch.orderType == TYPE.MARKET && remaining > 0) {
                remaining = matchSignleOrder(orderToMatch, otherSideOrders[index], remaining);
            } else if (orderToMatch.orderType == TYPE.LIMIT && otherSideOrders[index].price == orderToMatch.price) {
                remaining = matchSignleOrder(orderToMatch, otherSideOrders[index], remaining);
            }

            index = index.add(1);
        }
    }

    function matchSignleOrder(Order storage orderToMatch, Order storage oppositeOrder, uint remaining) internal returns(uint) {
        // How much amount filled
        uint orderAmountFilled = amountFilled(oppositeOrder);
        
        // How much amount available
        uint available = SafeMath.sub(oppositeOrder.amount, orderAmountFilled);
        // How much amount matched
        uint matched = (remaining > available) ? available : remaining;
        uint _remaining = SafeMath.sub(remaining, matched);

        oppositeOrder.fills.push(matched);
        orderToMatch.fills.push(matched);
        
        emit NewTrade(nextTradeId, oppositeOrder.id, orderToMatch.id, orderToMatch.ticker, oppositeOrder.trader, orderToMatch.trader, matched, oppositeOrder.price, block.timestamp);
        adjustBalances(orderToMatch, matched, oppositeOrder);

        nextTradeId = nextTradeId.add(1);

        return _remaining;
    }

    //////////////////////////////////////////////////////////////////////// Sorting
    function sortOrders(bytes32 ticker, SIDE side) internal returns(Order[] storage) {
        Order[] storage orders = orderBook[ticker][uint(side)];
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

    //////////////////////////////////////////////////////////////////////// Cleaning
    function cleanOrders(bytes32 ticker) internal {
        clearFilledOrdersSide(ticker, SIDE.BUY);
        clearFilledOrdersSide(ticker, SIDE.SELL);
    }

    function clearFilledOrdersSide(bytes32 ticker, SIDE side) internal {
        uint index = 0;
        Order[] storage orders = orderBook[ticker][uint(side)];
        
        while(index < orders.length && (amountFilled(orders[index]) == orders[index].amount || orders[index].orderType == TYPE.MARKET)) {
            ordersHistory[ticker][uint(side)].push(orders[index]);

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

    //////////////////////////////////////////////////////////////////////// Locking
    function lockTokens(bytes32 ticker, uint amount, uint price, SIDE side, TYPE orderType) internal {
        bytes32 tokenToLock = ticker;
        uint _amountToLock = amount;

        if (side == SIDE.BUY) {
            tokenToLock = DAI;
            if (orderType == TYPE.LIMIT) { 
                _amountToLock = SafeMath.mul(amount, price);
            }
        }

        lock(tokenToLock, _amountToLock);
    }

    function lock(bytes32 ticker, uint amount) internal {
        balances[msg.sender][ticker].locked = balances[msg.sender][ticker].locked.add(amount);
        balances[msg.sender][ticker].free = balances[msg.sender][ticker].free.sub(amount);
    }

    ////////////////////////////////////////////////////////////////////////Market Prices
    function deduceMarketPrice(bytes32 ticker, SIDE side) internal view returns(uint) {
        Order[] storage orders = orderBook[ticker][uint(side == SIDE.BUY ? SIDE.SELL : SIDE.BUY)];
        return orders[0].price;
    }

    function deduceAmountToLock(bytes32 ticker, uint amount, SIDE side) internal view returns(uint){
        Order[] memory oppositeOrders = orderBook[ticker][uint(side == SIDE.BUY ? SIDE.SELL : SIDE.BUY)];

        uint index;
        uint remaining = amount;

        uint _amountToLock = 0;

        while(index < oppositeOrders.length && remaining > 0) {
            uint orderAmountFilled = amountFilled(oppositeOrders[index]);
            uint available = SafeMath.sub(oppositeOrders[index].amount, orderAmountFilled);
            uint matched = (remaining > available) ? available : remaining;

            if (side == SIDE.BUY) {
                _amountToLock = SafeMath.add(_amountToLock, SafeMath.mul(matched, oppositeOrders[index].price));
            } else if (side == SIDE.SELL) {
                _amountToLock = SafeMath.add(_amountToLock, matched);
            }

            remaining = remaining.sub(matched);

            index = index.add(1);
        }

        return _amountToLock;
    }

    //////////////////////////////////////////////////////////////////////// 
    function amountFilled(Order memory oppositeOrder) internal pure returns(uint) {
        uint filledAmount;
        
        for (uint i; i < oppositeOrder.fills.length; i = i.add(1)) {
            filledAmount = filledAmount.add(oppositeOrder.fills[i]);
        }

        return filledAmount;
    }

    function adjustBalances(Order storage orderToMatch, uint matched, Order storage oppositeOrder) internal {
        uint finalPrice = SafeMath.mul(matched, oppositeOrder.price);

        if(orderToMatch.side == SIDE.SELL) {
            balances[msg.sender][orderToMatch.ticker].locked = balances[msg.sender][orderToMatch.ticker].locked.sub(matched);
            balances[oppositeOrder.trader][DAI].locked = balances[oppositeOrder.trader][DAI].locked.sub(finalPrice);

            balances[msg.sender][DAI].free = balances[msg.sender][DAI].free.add(finalPrice);
            balances[oppositeOrder.trader][orderToMatch.ticker].free = balances[oppositeOrder.trader][orderToMatch.ticker].free.add(matched);
        } else if(orderToMatch.side == SIDE.BUY) {
            require(balances[msg.sender][DAI].locked >= finalPrice, "Low DAI Balance!!!");

            balances[msg.sender][DAI].locked = balances[msg.sender][DAI].locked.sub(finalPrice);
            balances[oppositeOrder.trader][orderToMatch.ticker].locked = balances[oppositeOrder.trader][orderToMatch.ticker].locked.sub(matched);

            balances[msg.sender][orderToMatch.ticker].free = balances[msg.sender][orderToMatch.ticker].free.add(matched);
            balances[oppositeOrder.trader][DAI].free = balances[oppositeOrder.trader][DAI].free.add(finalPrice);
        }
    }

    ////////////////////////////////////////////////////////////////////////
    modifier orderModifier(bytes32 ticker, uint amount, SIDE side) {
        // tokenExist
        require(tokens[ticker].tokenAddress != address(0), "Ticker Non Existant!!!");
        // notDai
        require(ticker != DAI, "Cannot Trade DAI!!!");
        //hasEnoughTokenToSell
        if (side == SIDE.SELL) {
            uint availableBalance = balances[msg.sender][ticker].free;
            require(balances[msg.sender][ticker].free >= amount, "Low Token Balance!!!");
        }
        _;
    }

    modifier tokenExist(bytes32 ticker) {
        require(tokens[ticker].tokenAddress != address(0), "Ticker Non Existant!!!");
        _;
    }

    modifier notDai(bytes32 ticker) {
        require(ticker != DAI, "Cannot Trade DAI!!!");
        _;
    }

    modifier ordersExists(bytes32 ticker, SIDE side) {
        Order[] memory orders = orderBook[ticker][uint(side == SIDE.BUY ? SIDE.SELL : SIDE.BUY)];
        require(orders.length > 0, "Empty order book, please create a limit order!!!");
        _;
    }

    modifier hasEnoughTokenToSell(bytes32 ticker, uint amount, SIDE side) {
        if (side == SIDE.SELL) {
            require(balances[msg.sender][ticker].free >= amount, "Low Token Balance!!!");
        }
        _;
    }

    modifier hasEnoughDaiToBuy(uint amount, uint price, SIDE side) {
        if (side == SIDE.BUY) {
            require(balances[msg.sender][DAI].free >= SafeMath.mul(amount, price), "Low DAI Balance!!!");
        }
        _;
    }

    modifier hasEnoughBalance(bytes32 ticker, uint amount) {
        require(balances[msg.sender][ticker].free >= amount, "Not Enough Balance!!!");
        _;
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "Unauthorized!!!");
        _;
    }
}