import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {AnalyticsReportsService} from './analytics-reports.service';

const fixtures: Record<string, any[]> = {
  orders: [{id: 'o1', total_amount: 120, current_status: 'delivered', created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z'},
    {id: 'o2', total_amount: 60, current_status: 'cancelled', created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z'},
    {id: 'o3', total_amount: 80, current_status: 'processing', facility_id: 'f1', created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z'}],
  payment_orders: [{id: 'p1', amount: 120, status: 'partially_refunded', paid_at: '2026-09-10T00:00:00Z'}],
  refund_requests: [{id: 'r1', amount: 20, status: 'completed', processed_at: '2026-09-11T00:00:00Z'}],
  order_status_history: [{id: 'e1', to_status: 'cancelled', created_at: '2026-09-11T00:00:00Z'},
    {id: 'e2', to_status: 'delivered', created_at: '2026-09-12T00:00:00Z'}],
  customer_order_claims: [{id: 'c1', status: 'under_review', created_at: '2026-09-12T00:00:00Z'}],
  driver_assignments: [{id: 'a1', driver_id: 'd1', assignment_type: 'pickup', status: 'completed',
    assigned_at: '2026-09-10T00:00:00Z', accepted_at: '2026-09-10T01:00:00Z', completed_at: '2026-09-10T02:00:00Z'}],
  facility_order_operations: [{id: 'fop1', facility_id: 'f1', operation_type: 'washing',
    completed_at: '2026-09-10T00:00:00Z', received_at: null},
    {id: 'fop2', facility_id: 'f1', operation_type: 'facility_workflow', completed_at: null, received_at: '2026-09-11T00:00:00Z'}],
  offer_redemptions: [{id: 'cp1', discount_amount: 10, reversed_at: null, created_at: '2026-09-10T00:00:00Z'},
    {id: 'cp2', discount_amount: 5, reversed_at: '2026-09-12T00:00:00Z', created_at: '2026-09-11T00:00:00Z'}],
  loyalty_point_transactions: [{id: 'lp1', points: 4, transaction_type: 'earned', created_at: '2026-09-10T00:00:00Z'},
    {id: 'lp2', points: -1000, transaction_type: 'redeemed', created_at: '2026-09-11T00:00:00Z'}],
  package_subscriptions: [{id: 'ps1', amount: 50, status: 'active', paid_at: '2026-09-10T00:00:00Z'}],
  package_usage: [{id: 'pu1', usage_quantity: 2, reversed_at: null, created_at: '2026-09-10T00:00:00Z'}],
  referrals: [{id: 'ref1', reward_status: 'rewarded', created_at: '2026-09-10T00:00:00Z'}],
  admin_staff_action_audit: [{id: 'as1', actor_profile_id: 'admin-1', target_profile_id: 'staff-1',
    action: 'deactivate', created_at: '2026-09-10T00:00:00Z'}],
  admin_catalogue_audit: [{id: 'ac1', actor_profile_id: 'admin-1', entity_id: 'service-1',
    action: '=HYPERLINK("evil")', created_at: '2026-09-12T00:00:00Z'}],
  admin_assignment_audit: [], admin_issue_decision_audit: [], admin_growth_audit: [], financial_audit_logs: [],
};
const fixture = () => {
  const from = jest.fn((table: string) => {
    const query: any = {lower: '', upper: '', time: 'created_at', select: () => query,
      gte: (field: string, value: string) => {query.time = field; query.lower = value; return query;},
      lt: (_field: string, value: string) => {query.upper = value; return query;},
      order: () => query,
      range: async (start: number, end: number) => ({data: (fixtures[table] ?? []).filter(row =>
        !query.lower || (row[query.time] >= query.lower && row[query.time] < query.upper)).slice(start, end + 1), error: null})};
    return query;
  });
  return {service: new AnalyticsReportsService({admin: {from}} as any), from};
};
const dates = {from: '2026-09-01', to: '2026-09-30'};

describe('9I read-only Admin reports and audit search', () => {
  it('separates captured revenue, refunds and order value and reports operational metrics', async () => {
    const {service, from} = fixture();
    const report = await service.report(dates);
    expect(report.revenue).toEqual({grossCaptured: 120, refunded: 20, netCaptured: 100});
    expect(report.orders).toMatchObject({created: 3, averageOrderValue: 100, cancellations: 1, delivered: 1});
    expect(report.drivers).toMatchObject({assigned: 1, completed: 1});
    expect(report.facilities).toMatchObject({received: 1, completedStages: 1, activeOrders: 1, stuckOver24Hours: 1});
    expect(report.growth).toMatchObject({couponRedemptions: 1, couponDiscount: 10,
      loyaltyEarnedPoints: 4, loyaltyRedeemedPoints: 1000, packagesPurchased: 1, packageUses: 1, referrals: 1, referralRewards: 1});
    expect(report.trend.map(row => row.date)).toEqual(['2026-09-09','2026-09-10','2026-09-11']);
    expect(from).toHaveBeenCalledWith('payment_orders');
  });

  it('validates date ranges and fails closed when a source is unavailable', async () => {
    const {service} = fixture();
    await expect(service.report({from: '2026-02-30', to: '2026-03-01'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.report({from: '2026-10-01', to: '2026-09-01'})).rejects.toBeInstanceOf(BadRequestException);
    const failed = new AnalyticsReportsService({admin: {from: () => ({select: () => ({gte: () => ({lt: () => ({order: () => ({range: async () => ({error: {message: 'private'}})})})})})})}} as any);
    await expect(failed.audit(dates)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('searches and pages sanitized audit records, and escapes CSV formula text', async () => {
    const {service} = fixture();
    expect(await service.audit({...dates, source: 'staff', q: 'deactivate'})).toMatchObject({total: 1,
      events: [{source: 'staff', action: 'deactivate', entityId: 'staff-1'}]});
    expect(await service.audit({...dates, limit: '1', offset: '1'})).toMatchObject({total: 2, events: [{source: 'staff'}]});
    await expect(service.audit({...dates, source: 'unknown'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.audit({...dates, limit: '101'})).rejects.toBeInstanceOf(BadRequestException);
    const exported = await service.auditCsv(dates);
    expect(exported).toContain("'=HYPERLINK");
    expect(exported).not.toContain('before_value');
    expect(await service.reportCsv(dates)).toContain('grossCaptured');
    expect(await service.reportCsv(dates)).toContain('facilityStagesCompleted');
    expect(await service.reportCsv(dates)).toContain('loyaltyRedeemedPoints');
  });
});
