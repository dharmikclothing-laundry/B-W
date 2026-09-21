import {packageDiscount} from './packagePricing';
import type {CustomerPackage} from '../services/packagesApi';
import type {CartItem} from '../types/service';

const item: CartItem = {id: 'service-1', name: 'Wash', categoryId: null, categoryName: null, description: null, pricingUnit: 'each', price: 50, facilityId: null, quantity: 3};
const subscription: CustomerPackage = {id: 'sub-1', package_id: 'pkg-1', status: 'active', starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), isUsable: true, packages: {id: 'pkg-1', name: 'Monthly', monthly_price: 100, package_services: []}, services: [{service_id: 'service-1', usage_limit: 2, used: 1, remaining: 1}], usage: []};

test('limits checkout estimate to remaining eligible credits', () => {
  expect(packageDiscount(subscription, [item])).toBe(50);
  expect(packageDiscount({...subscription, services: []}, [item])).toBe(0);
});
test('does not estimate credit for expired packages', () => {
  expect(packageDiscount({...subscription, expires_at: new Date(Date.now() - 1000).toISOString()}, [item])).toBe(0);
});
