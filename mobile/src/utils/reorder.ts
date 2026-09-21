import type {CustomerOrder} from '../types/order';
import type {ServiceItem} from '../types/service';

export function buildReorderPlan(order: CustomerOrder, services: ServiceItem[]) {
  const items = order.order_items ?? [];
  if (!items.length) throw new Error('This order has no items to repeat.');
  return items.map(item => {
    const service = services.find(candidate => candidate.id === item.service_id);
    if (!service || service.price == null) throw new Error('Some services are no longer priced or available. Please choose services again.');
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('This order has a quantity that cannot be repeated.');
    return {service, quantity};
  });
}
