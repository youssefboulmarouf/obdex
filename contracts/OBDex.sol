// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol';
import "../node_modules/@openzeppelin/contracts/utils/Strings.sol";
import "../node_modules/hardhat/console.sol";

contract OBDex {
    using SafeMath for uint;

    // --- Enums ---
    enum ORDER_SIDE { BUY, SELL }
    enum ORDER_TYPE { MARKET, LIMIT }
    enum LOCKING    { LOCK, UNLOCK }

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

    // --- Checks If Adres Is Admin ---
    function isAdmin(address _address) external view returns(bool) {
        return _address == admin;
    }

    // --- Add Token ---
    function addToken(bytes32 _ticker, address _tokenAddress) 
        external onlyAdmin() tokenDoesNotExist(_ticker) {

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
    function createLimitOrder(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE _side) 
        external newOrderModifier(_ticker, _amount, _side) hasEnoughDaiToBuy(_amount, _price, _side) {
        
        lockUnlockTokens(_ticker, _amount, _price, _side, ORDER_TYPE.LIMIT, LOCKING.LOCK);
        manageOrders(_ticker, _amount, _price, _side, ORDER_TYPE.LIMIT);
    }

    // --- Create Market Order ---
    function createMarketOrder(bytes32 _ticker, uint _amount, ORDER_SIDE _side) 
        external newOrderModifier(_ticker, _amount, _side) ordersExists(_ticker, _side) {
        
        uint _amountToLock = deduceAmountToLock(_ticker, _amount, _side);

        uint price = deduceMarketPrice(_ticker, _side);

        if (_side == ORDER_SIDE.BUY) {            
            require(balances[msg.sender][DAI].free >= _amountToLock, "Low DAI Balance!");
        }  
        
        lockUnlockTokens(_ticker, _amountToLock, price, _side, ORDER_TYPE.MARKET, LOCKING.LOCK);
        manageOrders(_ticker, _amount, price, _side, ORDER_TYPE.MARKET);
    }

    // --- Cancle Order ---
    function cancelOrder(bytes32 _ticker, uint _orderId, ORDER_SIDE _side) 
        external {
    
        Order[] storage orders = orderBook[_ticker][uint(_side)];

        uint orderIndex;
        bool orderFound = false;
        
        // Look for order index with id = _orderId
        for (uint i = 0; i < orders.length; i = i.add(1)) {
            if (orders[i].id == _orderId) {
                orderIndex = i;
                orderFound = true;
                break;
            }
        }

        require(orderFound == true, "Order Not Found!");

        Order memory order = orders[orderIndex];
        require(order.orderType == ORDER_TYPE.LIMIT, "Only Limit Orders can be canceled");
        require(order.traderAddress == msg.sender, "Only the order trader can cancel the order");        

        uint filledAmount = amountFilled(order);
        uint amoutToUnlock = order.amount.sub(filledAmount);

        if (amoutToUnlock > 0) {
            lockUnlockTokens(_ticker, amoutToUnlock, order.price, order.orderSide, order.orderType, LOCKING.UNLOCK);
        }

        for (uint i = orderIndex; i < orders.length.sub(1); i = i.add(1)) {
            uint nextElementIndex = i.add(1);
            orders[i] = orders[nextElementIndex];
        }

        orders.pop();
    }

    // --- Lock And Unlock Tokens ---
    function lockUnlockTokens(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE _side, ORDER_TYPE _orderType, LOCKING _lock) 
        internal {
        
        bytes32 tokenToLock = _ticker;
        uint amountToLock = _amount;

        if (_side == ORDER_SIDE.BUY) {
            tokenToLock = DAI;
            if (_orderType == ORDER_TYPE.LIMIT) { 
                amountToLock = SafeMath.mul(_amount, _price);
            }
        }

        if (_lock == LOCKING.LOCK) {
            lock(tokenToLock, amountToLock);
        } else if (_lock == LOCKING.UNLOCK) {
            unlock(tokenToLock, amountToLock);
        }
    }

    // --- Lock Tokens ---
    function lock(bytes32 _ticker, uint _amount) internal {
        balances[msg.sender][_ticker].locked = balances[msg.sender][_ticker].locked.add(_amount);
        balances[msg.sender][_ticker].free = balances[msg.sender][_ticker].free.sub(_amount);
    }

    // --- Unlock Tokens ---
    function unlock(bytes32 _ticker, uint _amount) internal {
        balances[msg.sender][_ticker].locked = balances[msg.sender][_ticker].locked.sub(_amount);
        balances[msg.sender][_ticker].free = balances[msg.sender][_ticker].free.add(_amount);
    }

    // --- Create And Match Orders ---
    function manageOrders(bytes32 _ticker, uint _amount, uint _price, ORDER_SIDE _side, ORDER_TYPE _orderType) 
        internal {
        
        createOrder(_ticker, _side, _orderType, _amount, _price);
        Order memory newOrder = orderBook[_ticker][uint(_side)][orderBook[_ticker][uint(_side)].length - 1];
        sortOrders(_ticker, _side);

        Order[] storage oppositeOrders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];
        if (oppositeOrders.length > 0) {
            Order storage loadedOrder = findOrderById(_ticker, _side, newOrder.id);
            matchOrders(loadedOrder);
            cleanOrders(_ticker);
        }
    }

    // --- Create Orders ---
    function createOrder(bytes32 _ticker, ORDER_SIDE _side, ORDER_TYPE _orderType, uint _amount, uint _price) 
        internal {
        
        uint[] memory fills;

        orderBook[_ticker][uint(_side)].push(
            Order(nextOrderId, msg.sender, _side, _orderType, _ticker, _amount, fills, _price, block.timestamp)
        );
        nextOrderId = nextOrderId.add(1);
    }

    // --- Sort Orders ---
    function sortOrders(bytes32 _ticker, ORDER_SIDE _side) 
        internal {
        
        Order[] storage orders = orderBook[_ticker][uint(_side)];
        uint index = (orders.length > 0) ? (orders.length - 1) : 0;
        
        if (_side == ORDER_SIDE.SELL) {
            // SELL orders will be matched against Buy orders 
            // For the market buyers, the best price is the lowest price
            // SORT SELL ORDERS BY ASCENDING PRICES [4, 5, 6]
            while(index > 0) {
                if (orders[index - 1].price > orders[index].price) {
                    Order memory order = orders[index - 1];
                    orders[index - 1] = orders[index];
                    orders[index] = order;
                }
                index = index.sub(1);       
            }
        } else {
            // BUY orders will be matched against Sell orders 
            // For the market Sellers, the best price is the highest price
            // SORT BUY ORDERS BY DESCENDING PRICES [3, 2, 1]
            while(index > 0) {
                if (orders[index - 1].price < orders[index].price) {
                    Order memory order = orders[index - 1];
                    orders[index - 1] = orders[index];
                    orders[index] = order;
                }
                index = index.sub(1);       
            }
        }
    }

    function findOrderById(bytes32 _ticker, ORDER_SIDE _side, uint _orderId) 
        internal view returns (Order storage) {
        
        Order[] storage orders = orderBook[_ticker][uint(_side)];

        uint orderIndex;
        bool orderFound = false;
        
        // Look for order index with id = _orderId
        for (uint i = 0; i < orders.length; i = i.add(1)) {
            if (orders[i].id == _orderId) {
                orderIndex = i;
                orderFound = true;
                break;
            }
        }

        require(orderFound == true, "Order Not Found!");

        return orders[orderIndex];
    }

    // --- Match New Order Agaist Existing Opposite Orders ---
    function matchOrders(Order storage _orderToMatch) internal {
        Order[] storage oppositeOrders = orderBook[_orderToMatch.ticker][
            uint(_orderToMatch.orderSide == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)
        ];
        
        uint index;
        uint remaining = _orderToMatch.amount;
        
        while(index < oppositeOrders.length && remaining > 0) {

            if (_orderToMatch.orderType == ORDER_TYPE.MARKET && remaining > 0) {
                matchSingleOrder(_orderToMatch, oppositeOrders[index], remaining);

            } else if (_orderToMatch.orderType == ORDER_TYPE.LIMIT && oppositeOrders[index].price == _orderToMatch.price) {
                matchSingleOrder(_orderToMatch, oppositeOrders[index], remaining);
            }

            remaining = _orderToMatch.amount.sub(amountFilled(_orderToMatch));
            index = index.add(1);
        }
    }

    // --- Execute The Orders Matching ---
    function matchSingleOrder(Order storage _orderToMatch, Order storage _oppositeOrder, uint _remaining) internal {
        // How much amount filled
        uint orderAmountFilled = amountFilled(_oppositeOrder);
        
        // How much amount available
        uint available = SafeMath.sub(_oppositeOrder.amount, orderAmountFilled);
        
        // How much amount matched
        uint matched = (_remaining > available) ? available : _remaining;
        
        _oppositeOrder.fills.push(matched);
        _orderToMatch.fills.push(matched);
        adjustBalances(_orderToMatch, matched, _oppositeOrder);
        
        emitNewTradeEvent(_orderToMatch, _oppositeOrder, matched);
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
            require(balances[msg.sender][DAI].locked >= finalPrice, "Low DAI Balance!");

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
        
        while(index < orders.length) {

            bool isOffset = false;

            if (amountFilled(orders[index]) == orders[index].amount || orders[index].orderType == ORDER_TYPE.MARKET) {
                
                for(uint j = index; j < orders.length - 1; j = j.add(1)) {
                    orders[j] = orders[j + 1];
                    isOffset = true;
                }

                orders.pop();
            }

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

        uint amountToLock = 0;

        while(index < oppositeOrders.length && remaining > 0) {
            uint orderAmountFilled = amountFilled(oppositeOrders[index]);
            uint available = SafeMath.sub(oppositeOrders[index].amount, orderAmountFilled);
            uint matched = (remaining > available) ? available : remaining;

            if (_side == ORDER_SIDE.BUY) {
                amountToLock = SafeMath.add(amountToLock, SafeMath.mul(matched, oppositeOrders[index].price));
            } else if (_side == ORDER_SIDE.SELL) {
                amountToLock = SafeMath.add(amountToLock, matched);
            }

            remaining = remaining.sub(matched);

            index = index.add(1);
        }

        return amountToLock;
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

    // --- Modifier: Token Should NOT Exist ---
    modifier tokenDoesNotExist(bytes32 ticker) {
        require(tokens[ticker].tokenAddress == address(0), "Ticker Already Exist!");
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
            require(balances[msg.sender][ticker].free >= amount, "Low Token Balance!");
        }
        _;
    }

    // --- Modifier: Trader Should Have Enough DAI Balance To Buy ---
    modifier hasEnoughDaiToBuy(uint _amount, uint _price, ORDER_SIDE _side) {
        // This should ONLY be checked on LIMIT orders 
        // since we know the exact amount and price
        // which is not the case in MARKET orders
        if (_side == ORDER_SIDE.BUY) {
            require(balances[msg.sender][DAI].free >= SafeMath.mul(_amount, _price), "Low DAI Balance!");
        }
        _;
    }

    // --- Modifier: Orders Should Exist To Open Market Orders ---
    modifier ordersExists(bytes32 _ticker, ORDER_SIDE _side) {
        // This should ONLY be checked on MARKET orders 
        // since we need opposite orders to exist for the matching to happen
        Order[] memory orders = orderBook[_ticker][uint(_side == ORDER_SIDE.BUY ? ORDER_SIDE.SELL : ORDER_SIDE.BUY)];
        require(orders.length > 0, "Empty Order Book! Please Create Limit Order!");
        _;
    }

    modifier newOrderModifier(bytes32 _ticker, uint _amount, ORDER_SIDE _side) {
        // THIS ORDER MODIFER IS TO AVOID THE `STACK TOO DEEP ERROR COMPILATION`
        // IT HAPPENS WHEN THERE IS +5 MODIFIERS OR +16 FUNCTION PARAMETERS
        
        // --- Modifier: Token Should Exist ---
        require(tokens[_ticker].tokenAddress != address(0), "Ticker Does Not Exist!");

        // --- Modifier: Token Should Not Be DAI ---
        require(_ticker != DAI, "Cannot Trade DAI Token!");

        // --- Modifier: Trader Should Have Enough Token Balance To Sell ---        
        if (_side == ORDER_SIDE.SELL) {
            require(balances[msg.sender][_ticker].free >= _amount, "Low Token Balance!");
        }
        _;
    }
}