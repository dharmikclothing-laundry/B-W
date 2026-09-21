import type {CustomerOrder} from '../types/order';

export function filterOrderHistory(orders: CustomerOrder[], search: string): CustomerOrder[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return orders;
  return orders.filter(order =>
    order.order_number.toLocaleLowerCase().includes(query) ||
    order.current_status.replace(/_/g, ' ').toLocaleLowerCase().includes(query) ||
    (order.order_items ?? []).some(item => item.item_name.toLocaleLowerCase().includes(query)),
  );
}
