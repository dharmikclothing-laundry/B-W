import {filterOrderHistory} from './orderHistory';
import type {CustomerOrder} from '../types/order';
const order = {order_number: 'BW-123', current_status: 'completed', order_items: [{item_name: 'Shirt'}]} as CustomerOrder;
test('searches order number, status and item without changing history', () => {
  expect(filterOrderHistory([order], 'bw-123')).toEqual([order]);
  expect(filterOrderHistory([order], 'completed')).toEqual([order]);
  expect(filterOrderHistory([order], 'shirt')).toEqual([order]);
  expect(filterOrderHistory([order], 'other')).toEqual([]);
});
