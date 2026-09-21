import {apiRequest} from './api';

export type CatalogueCategory = {id: string; name: string; description: string | null; is_active: boolean};
export type CatalogueService = {id: string; category_id: string | null; name: string; description: string | null; pricing_unit: string; is_active: boolean};
export type CataloguePrice = {id: string; service_id: string; facility_id: string | null; price: number; effective_from: string; effective_to: string | null};
export type CommercialPolicy = {pickupDeliveryFee: number; freeDeliveryThreshold: number; gstRatePercent: number; minimumOrderAmount: number; effectiveFrom: string};
export type AdminCatalogue = {categories: CatalogueCategory[]; services: CatalogueService[]; prices: CataloguePrice[]; policy: CommercialPolicy; packageEligibility: Array<{package_id: string; service_id: string; usage_limit: number | null}>; packages: Array<{id: string; name: string; is_active: boolean; isLocked: boolean}>; audit: Array<{id: string; action: string; entity_id: string; created_at: string}>};

const path = '/admin/catalogue';
export const getAdminCatalogue = (token: string) => apiRequest<AdminCatalogue>(path, {accessToken: token});
export const createAdminCategory = (token: string, input: {name: string; description?: string}) =>
  apiRequest(`${path}/categories`, {accessToken: token, method: 'POST', body: input});
export const updateAdminCategory = (token: string, id: string, input: {name?: string; description?: string; isActive?: boolean}) =>
  apiRequest(`${path}/categories/${encodeURIComponent(id)}`, {accessToken: token, method: 'PATCH', body: input});
export const createAdminService = (token: string, input: {name: string; description?: string; pricingUnit: string; categoryId?: string}) =>
  apiRequest(`${path}/services`, {accessToken: token, method: 'POST', body: input});
export const updateAdminService = (token: string, id: string, input: {name?: string; description?: string; pricingUnit?: string; categoryId?: string; isActive?: boolean}) =>
  apiRequest(`${path}/services/${encodeURIComponent(id)}`, {accessToken: token, method: 'PATCH', body: input});
export const setAdminServicePrice = (token: string, id: string, price: number, facilityId?: string) => {
  if (!Number.isFinite(price) || price < 0 || Math.abs(Math.round(price * 100) - price * 100) > 0.000001) return Promise.reject(new Error('Enter a valid nonnegative price.'));
  return apiRequest(`${path}/services/${encodeURIComponent(id)}/prices`, {accessToken: token, method: 'POST', body: {price, ...(facilityId ? {facilityId} : {})}});
};
export const setAdminPricingPolicy = (token: string, input: {pickupDeliveryFee: number; freeDeliveryThreshold: number; gstRatePercent: number; minimumOrderAmount: number}) => {
  if (Object.values(input).some(value => !Number.isFinite(value) || value < 0) || input.gstRatePercent > 100) return Promise.reject(new Error('Enter valid nonnegative pricing values.'));
  return apiRequest(`${path}/pricing-policy`, {accessToken: token, method: 'POST', body: input});
};
export const setAdminPackageEligibility = (token: string, packageId: string, serviceId: string, eligible: boolean, usageLimit: number | null) => {
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 0)) return Promise.reject(new Error('Invalid package usage limit.'));
  return apiRequest(`${path}/packages/${encodeURIComponent(packageId)}/eligibility`, {accessToken: token, method: 'POST',
    body: {serviceId, eligible, usageLimit}});
};
