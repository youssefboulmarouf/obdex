import React from 'react';
import Moment from 'moment';

function AllOrders({orders}) {
    const filledAmount = (fills) => {
        let sum = 0;
        fills.map( filled => sum += filled)
        return sum;
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
                            <th>id</th>
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
                                <td>{order.id}</td>
                                <td>{order.amount}</td>
                                <td>{filledAmount(order.fills)}</td>
                                <td>{order.amount - filledAmount(order.fills)}</td>
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
            <h2 className="card-title">All orders</h2>
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

export default AllOrders;