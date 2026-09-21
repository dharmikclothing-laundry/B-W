import type {CartItem} from '../types/service';
import type {CustomerPackage} from '../services/packagesApi';

export function packageDiscount(subscription: CustomerPackage | null, items: CartItem[]): number {
  if (!subscription?.isUsable || new Date(subscription.expires_at).getTime() <= Date.now()) return 0;
  return items.reduce((total, item) => {
    const service = subscription.services.find(row => row.service_id === item.id);
    if (!service || item.price == null) return total;
    const available = service.remaining == null ? item.quantity : Math.max(0, service.remaining);
    return total + Math.min(item.quantity, available) * item.price;
  }, 0);
}
