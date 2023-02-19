import Web3 from 'web3';
import React from 'react';
import Moment from 'moment';

function ListOrders({orders, user, cancelOrder}) {
    const filledAmount = (fills) => {
        let sum = 0;
        fills.map(filled => sum += (+filled))
        return sum;
    }

    const cancel = (order) => {
        console.log(order);
        cancelOrder(order)
    }

    const renderList = (orders, side, className) => {
        return (
            <>
                <table className={`table table-striped mb-0 order-list ${className}`}>
                    <thead>
                        <tr className="table-title order-list-title">
                        <th colSpan='3'>{side}</th>
                        </tr>
                        <tr>
                            <th></th>
                            <th>amount</th>
                            <th>filled</th>
                            <th>available</th>
                            <th>price</th>
                            <th>date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order.id}>
                                <td>{
                                    (order.traderAddress === user.account) 
                                    ? <button type="button" className="btn btn-danger" onClick={() => cancel(order)}>X</button>
                                    : ''
                                }</td>
                                <td>{Web3.utils.fromWei(order.amount, 'ether')}</td>
                                <td>{Web3.utils.fromWei(filledAmount(order.fills).toString(), 'ether')}</td>
                                <td>{Web3.utils.fromWei((order.amount - filledAmount(order.fills)).toString(), 'ether')}</td>
                                <td>{order.price}</td>
                                {/* <td>
                                    <Moment fromNow>{parseInt(order.date) * 1000}</Moment>
                                </td> */}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </>
        );
    }
  
    return (
        <div className="card">
            <h2 className="card-title">All Orders</h2>
            <div className="row">
                <div className="col-sm-6">
                    {renderList(orders.buy, 'Buy', 'order-list-buy')}
                </div>
                <div className="col-sm-6">
                    {renderList(orders.sell, 'Sell', 'order-list-sell')}
                </div>
            </div>
        </div>
    );
}

export default ListOrders;