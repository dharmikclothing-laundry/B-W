import {apiRequest} from './api';

export type PackageService = {service_id: string; usage_limit: number | null; used?: number; remaining?: number | null};
export type PackageOffer = {id: string; name: string; description?: string | null; monthly_price: number | string; validity_days?: number | null; package_services: PackageService[]};
export type PackageUsage = {service_id: string; usage_quantity: number; order_id: string; created_at: string; reversed_at?: string | null};
export type CustomerPackage = {id: string; package_id: string; status: string; starts_at: string; expires_at: string; isUsable: boolean; packages: PackageOffer; services: PackageService[]; usage: PackageUsage[]};

export const getPackages = (accessToken: string) => apiRequest<PackageOffer[]>('/packages', {accessToken});
export const getPackage = (accessToken: string, id: string) => apiRequest<PackageOffer>(`/packages/${id}`, {accessToken});
export const getMyPackages = (accessToken: string) => apiRequest<CustomerPackage[]>('/packages/me', {accessToken});
export const purchasePackage = (accessToken: string, id: string) => apiRequest<CustomerPackage>(`/packages/${id}/subscribe`, {method: 'POST', accessToken});
