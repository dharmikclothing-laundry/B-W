import {BadRequestException, Injectable, ServiceUnavailableException} from '@nestjs/common';
import {SupabaseService} from '../supabase/supabase.service';

const AUDITS = {
  staff: {table: 'admin_staff_action_audit', columns: 'id,actor_profile_id,target_profile_id,action,created_at', entity: 'target_profile_id'},
  assignments: {table: 'admin_assignment_audit', columns: 'id,actor_profile_id,order_id,action,created_at', entity: 'order_id'},
  catalogue: {table: 'admin_catalogue_audit', columns: 'id,actor_profile_id,entity_id,action,created_at', entity: 'entity_id'},
  issues: {table: 'admin_issue_decision_audit', columns: 'id,actor_profile_id,order_id,action,created_at', entity: 'order_id'},
  growth: {table: 'admin_growth_audit', columns: 'id,actor_profile_id,entity_id,action,created_at', entity: 'entity_id'},
  financial: {table: 'financial_audit_logs', columns: 'id,actor_profile_id,entity_id,action,created_at', entity: 'entity_id'},
} as const;
export type AuditSource = keyof typeof AUDITS;
type Filters = {from?: string; to?: string; source?: string; q?: string; limit?: string; offset?: string};
type Range = {from: string; toExclusive: string; fromDay: string; toDay: string};
const money = (value: number) => Math.round(value * 100) / 100;
const sum = (rows: any[], field: string) => money(rows.reduce((total, row) => total + Number(row[field] || 0), 0));
const group = (rows: any[], key: string) => rows.reduce((result: Record<string, number>, row) => {
  const value = String(row[key] ?? 'unknown'); result[value] = (result[value] ?? 0) + 1; return result;
}, {});
const day = (value: string) => value.slice(0, 10);
const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const csv = (rows: unknown[][]) => rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

@Injectable()
export class AnalyticsReportsService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() { return this.supabase.admin; }

  private range(filters: Filters): Range {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthAgo = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const fromDay = filters.from ?? monthAgo;
    const toDay = filters.to ?? today;
    const valid = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(`${input}T00:00:00Z`)) &&
      new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) === input;
    if (!valid(fromDay) || !valid(toDay)) throw new BadRequestException('Use valid YYYY-MM-DD report dates');
    const start = Date.parse(`${fromDay}T00:00:00Z`);
    const end = Date.parse(`${toDay}T00:00:00Z`);
    if (end < start || end - start > 365 * 86400000) throw new BadRequestException('Report range must be 1 to 366 days');
    return {from: new Date(start).toISOString(), toExclusive: new Date(end + 86400000).toISOString(), fromDay, toDay};
  }

  private async rows(table: string, columns: string, range?: Range, timestamp = 'created_at'): Promise<any[]> {
    const result: any[] = [];
    for (let offset = 0; ; offset += 500) {
      let query: any = this.db.from(table).select(columns);
      if (range) query = query.gte(timestamp, range.from).lt(timestamp, range.toExclusive);
      const {data, error} = await query.order('id', {ascending: true}).range(offset, offset + 499);
      if (error) throw new ServiceUnavailableException(`Admin report source ${table} unavailable`);
      result.push(...(data ?? []));
      if (result.length > 50000) throw new ServiceUnavailableException('Report range exceeds safe export size');
      if (!data || data.length < 500) return result;
    }
  }

  async report(filters: Filters) {
    const range = this.range(filters);
    const [orders, payments, refunds, statusEvents, claims, assigned, completed, operations, receipts, activeOrders,
      coupons, loyalty, packages, usage, referrals] = await Promise.all([
      this.rows('orders', 'id,total_amount,current_status,created_at', range),
      this.rows('payment_orders', 'id,amount,status,paid_at', range, 'paid_at'),
      this.rows('refund_requests', 'id,amount,status,processed_at', range, 'processed_at'),
      this.rows('order_status_history', 'id,to_status,created_at', range),
      this.rows('customer_order_claims', 'id,status,created_at', range),
      this.rows('driver_assignments', 'id,driver_id,assignment_type,status,assigned_at,accepted_at,completed_at', range, 'assigned_at'),
      this.rows('driver_assignments', 'id,driver_id,assignment_type,status,completed_at', range, 'completed_at'),
      this.rows('facility_order_operations', 'id,facility_id,operation_type,received_at,started_at,completed_at', range, 'completed_at'),
      this.rows('facility_order_operations', 'id,facility_id,operation_type,received_at', range, 'received_at'),
      this.rows('orders', 'id,facility_id,current_status,updated_at,created_at'),
      this.rows('offer_redemptions', 'id,discount_amount,reversed_at,created_at', range),
      this.rows('loyalty_point_transactions', 'id,points,transaction_type,created_at', range),
      this.rows('package_subscriptions', 'id,amount,status,paid_at', range, 'paid_at'),
      this.rows('package_usage', 'id,usage_quantity,reversed_at,created_at', range),
      this.rows('referrals', 'id,reward_status,created_at', range),
    ]);
    const captured = payments.filter(row => row.paid_at && ['paid', 'partially_refunded', 'refunded'].includes(row.status));
    const completedRefunds = refunds.filter(row => row.status === 'completed');
    const validOrders = orders.filter(row => row.current_status !== 'cancelled');
    const grossCaptured = sum(captured, 'amount');
    const refunded = sum(completedRefunds, 'amount');
    const validOrderValue = sum(validOrders, 'total_amount');
    const active = activeOrders.filter(row => ['received_at_facility', 'verification', 'processing', 'quality_check', 'rework_required'].includes(row.current_status));
    const now = Date.now();
    const ages = active.map(row => Math.max(0, (now - Date.parse(row.updated_at || row.created_at)) / 3600000));
    const facilityIds = new Set([...active.map(row => row.facility_id), ...operations.map(row => row.facility_id),
      ...receipts.map(row => row.facility_id)].filter(Boolean));
    const facilities = [...facilityIds].map(id => ({facilityId: id,
      received: receipts.filter(row => row.facility_id === id && row.operation_type === 'facility_workflow').length,
      completedStages: operations.filter(row => row.facility_id === id && row.operation_type !== 'facility_workflow').length,
      activeOrders: active.filter(row => row.facility_id === id).length}));
    const driverIds = new Set([...assigned.map(row => row.driver_id), ...completed.map(row => row.driver_id)].filter(Boolean));
    const drivers = [...driverIds].map(id => ({driverId: id,
      assigned: assigned.filter(row => row.driver_id === id).length,
      accepted: assigned.filter(row => row.driver_id === id && row.accepted_at).length,
      completed: completed.filter(row => row.driver_id === id).length}));
    const trendMap = new Map<string, {date: string; orders: number; orderValue: number; captured: number; refunded: number}>();
    const trend = (date: string, metric: 'orders' | 'orderValue' | 'captured' | 'refunded', value: number) => {
      const key = day(date);
      const row = trendMap.get(key) ?? {date: key, orders: 0, orderValue: 0, captured: 0, refunded: 0};
      row[metric] = money(row[metric] + value); trendMap.set(key, row);
    };
    orders.forEach(row => {trend(row.created_at, 'orders', 1); if (row.current_status !== 'cancelled') trend(row.created_at, 'orderValue', Number(row.total_amount || 0));});
    captured.forEach(row => trend(row.paid_at, 'captured', Number(row.amount || 0)));
    completedRefunds.forEach(row => trend(row.processed_at, 'refunded', Number(row.amount || 0)));
    const activeCoupons = coupons.filter(row => !row.reversed_at);
    const activePackageUsage = usage.filter(row => !row.reversed_at);
    return {range: {from: range.fromDay, to: range.toDay}, definitions: {
      revenue: 'Captured online payments paid in range minus completed refunds processed in range; cash on delivery is excluded.',
      orderValue: 'Value and AOV of orders created in range that are not currently cancelled.',
      processingAge: 'Current age since last update for active Facility orders; snapshot, not a contractual SLA.'},
      revenue: {grossCaptured, refunded, netCaptured: money(grossCaptured - refunded)},
      orders: {created: orders.length, byCurrentStatus: group(orders, 'current_status'),
        nonCancelledValue: validOrderValue, averageOrderValue: validOrders.length ? money(validOrderValue / validOrders.length) : 0,
        cancellations: statusEvents.filter(row => row.to_status === 'cancelled').length,
        readyForDelivery: statusEvents.filter(row => row.to_status === 'ready_for_delivery').length,
        delivered: statusEvents.filter(row => row.to_status === 'delivered').length},
      claims: {created: claims.length, byCurrentStatus: group(claims, 'status')},
      refunds: {completed: completedRefunds.length, byStatus: group(refunds, 'status')},
      drivers: {assigned: assigned.length, completed: completed.length, byDriver: drivers},
      facilities: {received: receipts.filter(row => row.operation_type === 'facility_workflow').length,
        completedStages: operations.filter(row => row.operation_type !== 'facility_workflow').length,
        activeOrders: active.length, averageProcessingAgeHours: ages.length ? Math.round(ages.reduce((x, y) => x + y, 0) / ages.length * 10) / 10 : 0,
        stuckOver24Hours: ages.filter(hours => hours >= 24).length, byFacility: facilities},
      growth: {couponRedemptions: activeCoupons.length, couponDiscount: sum(activeCoupons, 'discount_amount'),
        loyaltyEarnedPoints: sum(loyalty.filter(row => row.transaction_type === 'earned'), 'points'),
        loyaltyRedeemedPoints: Math.abs(sum(loyalty.filter(row => row.transaction_type === 'redeemed'), 'points')),
        packagesPurchased: packages.length, packagePurchaseValue: sum(packages, 'amount'),
        packageUses: activePackageUsage.length, packageUnitsUsed: sum(activePackageUsage, 'usage_quantity'),
        referrals: referrals.length, referralRewards: referrals.filter(row => row.reward_status === 'rewarded').length},
      trend: [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))};
  }

  async reportCsv(filters: Filters) {
    const report = await this.report(filters);
    return csv([['kind', 'date', 'metric', 'value'],
      ['summary', '', 'grossCaptured', report.revenue.grossCaptured],
      ['summary', '', 'refunded', report.revenue.refunded],
      ['summary', '', 'netCaptured', report.revenue.netCaptured],
      ['summary', '', 'ordersCreated', report.orders.created],
      ['summary', '', 'nonCancelledOrderValue', report.orders.nonCancelledValue],
      ['summary', '', 'averageOrderValue', report.orders.averageOrderValue],
      ['summary', '', 'cancellations', report.orders.cancellations],
      ['summary', '', 'readyForDelivery', report.orders.readyForDelivery],
      ['summary', '', 'delivered', report.orders.delivered],
      ['summary', '', 'claimsCreated', report.claims.created],
      ['summary', '', 'refundsCompleted', report.refunds.completed],
      ['summary', '', 'driverJobsAssigned', report.drivers.assigned],
      ['summary', '', 'driverJobsCompleted', report.drivers.completed],
      ['summary', '', 'facilityReceipts', report.facilities.received],
      ['summary', '', 'facilityStagesCompleted', report.facilities.completedStages],
      ['summary', '', 'activeFacilityOrders', report.facilities.activeOrders],
      ['summary', '', 'averageProcessingAgeHours', report.facilities.averageProcessingAgeHours],
      ['summary', '', 'stuckFacilityOrders', report.facilities.stuckOver24Hours],
      ['summary', '', 'couponRedemptions', report.growth.couponRedemptions],
      ['summary', '', 'couponDiscount', report.growth.couponDiscount],
      ['summary', '', 'loyaltyEarnedPoints', report.growth.loyaltyEarnedPoints],
      ['summary', '', 'loyaltyRedeemedPoints', report.growth.loyaltyRedeemedPoints],
      ['summary', '', 'packagesPurchased', report.growth.packagesPurchased],
      ['summary', '', 'packagePurchaseValue', report.growth.packagePurchaseValue],
      ['summary', '', 'packageUses', report.growth.packageUses],
      ['summary', '', 'packageUnitsUsed', report.growth.packageUnitsUsed],
      ['summary', '', 'referrals', report.growth.referrals],
      ['summary', '', 'referralRewards', report.growth.referralRewards],
      ...report.trend.flatMap(row => [['daily', row.date, 'orders', row.orders],
        ['daily', row.date, 'orderValue', row.orderValue], ['daily', row.date, 'captured', row.captured],
        ['daily', row.date, 'refunded', row.refunded]])]);
  }

  private async auditRows(filters: Filters) {
    const range = this.range(filters);
    const source = filters.source || 'all';
    if (source !== 'all' && !Object.prototype.hasOwnProperty.call(AUDITS, source)) throw new BadRequestException('Invalid audit source');
    const sources = source === 'all' ? Object.keys(AUDITS) as AuditSource[] : [source as AuditSource];
    const q = (filters.q ?? '').trim().toLowerCase();
    if (q.length > 100) throw new BadRequestException('Audit search is too long');
    const loaded = await Promise.all(sources.map(async name => {
      const spec = AUDITS[name];
      return (await this.rows(spec.table, spec.columns, range)).map(row => ({id: row.id, source: name,
        actorId: row.actor_profile_id, action: row.action, entityId: row[spec.entity] ?? null, createdAt: row.created_at}));
    }));
    if (loaded.reduce((total, rows) => total + rows.length, 0) > 50000)
      throw new ServiceUnavailableException('Audit range exceeds safe export size');
    return loaded.flat().filter(row => !q || [row.action, row.entityId, row.actorId].some(value => String(value ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async audit(filters: Filters) {
    const limit = filters.limit === undefined ? 50 : Number(filters.limit);
    const offset = filters.offset === undefined ? 0 : Number(filters.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 50000)
      throw new BadRequestException('Audit page must be 1–100 rows with offset 0–50000');
    const rows = await this.auditRows(filters);
    return {total: rows.length, limit, offset, events: rows.slice(offset, offset + limit)};
  }

  async auditCsv(filters: Filters) {
    const rows = await this.auditRows(filters);
    return csv([['time', 'source', 'action', 'actorId', 'entityId'],
      ...rows.map(row => [row.createdAt, row.source, row.action, row.actorId, row.entityId])]);
  }
}
