import {apiRequest} from './api';

export type ReportFilters = {from: string; to: string; source?: string; q?: string; limit?: number; offset?: number};
export type AdminReport = {range: {from: string; to: string}; definitions: {revenue: string; orderValue: string; processingAge: string};
  revenue: {grossCaptured: number; refunded: number; netCaptured: number};
  orders: {created: number; byCurrentStatus: Record<string, number>; nonCancelledValue: number;
    averageOrderValue: number; cancellations: number; readyForDelivery: number; delivered: number};
  claims: {created: number; byCurrentStatus: Record<string, number>}; refunds: {completed: number; byStatus: Record<string, number>};
  drivers: {assigned: number; completed: number; byDriver: Array<{driverId: string; assigned: number; accepted: number; completed: number}>};
  facilities: {received: number; completedStages: number; activeOrders: number; averageProcessingAgeHours: number;
    stuckOver24Hours: number; byFacility: Array<{facilityId: string; received: number; completedStages: number; activeOrders: number}>};
  growth: {couponRedemptions: number; couponDiscount: number; loyaltyEarnedPoints: number; loyaltyRedeemedPoints: number;
    packagesPurchased: number; packagePurchaseValue: number; packageUses: number; packageUnitsUsed: number;
    referrals: number; referralRewards: number};
  trend: Array<{date: string; orders: number; orderValue: number; captured: number; refunded: number}>};
export type AuditEvent = {id: string; source: string; actorId: string | null; action: string; entityId: string | null; createdAt: string};
export type AuditPage = {total: number; limit: number; offset: number; events: AuditEvent[]};
const query = (filters: ReportFilters, audit: boolean) => {
  const params = new URLSearchParams({from: filters.from, to: filters.to});
  if (audit) {
    if (filters.source) params.set('source', filters.source);
    if (filters.q) params.set('q', filters.q);
    if (filters.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  }
  return params.toString();
};
export const getAdminReport = (token: string, filters: ReportFilters) =>
  apiRequest<AdminReport>(`/admin/analytics/report?${query(filters, false)}`, {accessToken: token});
export const getAdminAudit = (token: string, filters: ReportFilters) =>
  apiRequest<AuditPage>(`/admin/analytics/audit?${query(filters, true)}`, {accessToken: token});
