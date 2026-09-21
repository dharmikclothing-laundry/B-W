import type {ServiceItem} from '../types/service';
import {apiRequest} from './api';
import type {CheckoutPricingPolicy} from '../utils/orderPricing';

export async function getCheckoutPricingPolicy(accessToken: string): Promise<CheckoutPricingPolicy> {
  const result = await apiRequest<CheckoutPricingPolicy>('/services/pricing-policy', {accessToken});
  if (!Number.isFinite(result.pickupDeliveryFee) || !Number.isFinite(result.freeDeliveryThreshold) ||
    !Number.isFinite(result.gstRatePercent) || !Number.isFinite(result.minimumOrderAmount)) throw new Error('Invalid checkout pricing configuration');
  return result;
}

export async function getServices(
  accessToken: string,
): Promise<ServiceItem[]> {
  const services =
    await apiRequest<ServiceItem[]>(
      '/services',
      {
        accessToken,
      },
    );

  if (!Array.isArray(services)) {
    throw new Error(
      'Invalid services response',
    );
  }

  return services;
}

export async function getFacilityServices(
  accessToken: string,
  facilityId: string,
): Promise<ServiceItem[]> {
  const query =
    encodeURIComponent(
      facilityId,
    );

  const services =
    await apiRequest<ServiceItem[]>(
      `/services?facilityId=${query}`,
      {
        accessToken,
      },
    );

  if (!Array.isArray(services)) {
    throw new Error(
      'Invalid services response',
    );
  }

  return services;
}
