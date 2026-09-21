import {buildReorderPlan} from './reorder';
import type {CustomerOrder} from '../types/order';
import type {ServiceItem} from '../types/service';
const service = {id: 'service', price: 90} as ServiceItem;
const order = {order_items: [{service_id: 'service', quantity: 2}]} as CustomerOrder;
test('repeat order uses current service pricing and quantity', () => {
  expect(buildReorderPlan(order, [service])).toEqual([{service, quantity: 2}]);
});
test('repeat order rejects unavailable services and empty orders', () => {
  expect(() => buildReorderPlan(order, [])).toThrow('no longer');
  expect(() => buildReorderPlan({order_items: []} as unknown as CustomerOrder, [service])).toThrow('no items');
});
