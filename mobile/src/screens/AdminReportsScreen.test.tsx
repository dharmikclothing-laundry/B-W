import React from 'react';
import {cleanup, fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminReportsScreen from './AdminReportsScreen';
import {getAdminAudit, getAdminReport} from '../services/adminReportsApi';

jest.mock('../services/adminReportsApi', () => ({getAdminReport: jest.fn(), getAdminAudit: jest.fn()}));
const report = {range: {from: '2026-09-01', to: '2026-09-20'}, definitions: {revenue: 'Captured online only.',
  orderValue: 'Non-cancelled.', processingAge: 'Snapshot, not SLA.'}, revenue: {grossCaptured: 120, refunded: 20, netCaptured: 100},
  orders: {created: 2, byCurrentStatus: {delivered: 1}, nonCancelledValue: 120, averageOrderValue: 120,
    cancellations: 1, readyForDelivery: 1, delivered: 1}, claims: {created: 1, byCurrentStatus: {}},
  refunds: {completed: 1, byStatus: {}}, drivers: {assigned: 1, completed: 1, byDriver: []},
  facilities: {received: 1, completedStages: 2, activeOrders: 0, averageProcessingAgeHours: 0,
    stuckOver24Hours: 0, byFacility: []}, growth: {couponRedemptions: 1, couponDiscount: 10,
    loyaltyEarnedPoints: 4, loyaltyRedeemedPoints: 1000, packagesPurchased: 1, packagePurchaseValue: 50,
    packageUses: 1, packageUnitsUsed: 2, referrals: 1, referralRewards: 0},
  trend: [{date: '2026-09-10', orders: 1, orderValue: 120, captured: 120, refunded: 0}]};
const audit = {total: 51, limit: 50, offset: 0, events: [{id: 'a1', source: 'staff', action: 'deactivate',
  actorId: 'admin-1', entityId: 'staff-1', createdAt: '2026-09-10T00:00:00Z'}]};
beforeEach(() => {jest.clearAllMocks(); (getAdminReport as jest.Mock).mockResolvedValue(report); (getAdminAudit as jest.Mock).mockResolvedValue(audit);});
afterEach(async () => {await cleanup();});

test('shows network error, retry and empty states', async () => {
  (getAdminReport as jest.Mock).mockReset().mockRejectedValue(new Error('Network unavailable'));
  const view = await render(<AdminReportsScreen accessToken="admin" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  (getAdminReport as jest.Mock).mockResolvedValue({...report, trend: []});
  (getAdminAudit as jest.Mock).mockResolvedValue({...audit, total: 0, events: []});
  await fireEvent.press(view.getByText('Retry reports'));
  await waitFor(() => expect(view.getByText('No activity in this period.')).toBeTruthy());
  expect(view.getByText('No audit events match these filters.')).toBeTruthy();
});

test('renders revenue, trends, operations, growth and Admin audit history', async () => {
  const view = await render(<AdminReportsScreen accessToken="admin" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Net captured ₹100.00')).toBeTruthy());
  expect(view.getByText(/Orders placed 2/)).toBeTruthy();
  expect(view.getByText(/Driver jobs assigned 1/)).toBeTruthy();
  expect(view.getByText(/Coupon uses 1/)).toBeTruthy();
  expect(view.getByText('staff · deactivate')).toBeTruthy();
  expect(view.getByText('2026-09-10')).toBeTruthy();
  expect(view.getByText(/1 order ·/)).toBeTruthy();
});

test('applies date and audit filters, and pages search results', async () => {
  const view = await render(<AdminReportsScreen accessToken="admin" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('staff · deactivate')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('From date'), '2026-09-01');
  await fireEvent.changeText(view.getByLabelText('Search audit action, actor or entity'), 'deactivate');
  await fireEvent.press(view.getByText('staff', {exact: true}));
  await fireEvent.press(view.getByText('Apply report filters'));
  await waitFor(() => expect(getAdminAudit).toHaveBeenCalledWith('admin', expect.objectContaining({
    from: '2026-09-01', source: 'staff', q: 'deactivate', offset: 0})));
  await fireEvent.press(view.getByText('Next audit page'));
  await waitFor(() => expect(getAdminAudit).toHaveBeenCalledWith('admin', expect.objectContaining({offset: 50})));
});
