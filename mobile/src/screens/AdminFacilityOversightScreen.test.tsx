import React from 'react';
import {cleanup, fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminFacilityOversightScreen from './AdminFacilityOversightScreen';
import {getAdminFacility, getAdminFacilityOrder, listAdminFacilities} from '../services/adminFacilityOversightApi';

jest.mock('../services/adminFacilityOversightApi', () => ({listAdminFacilities: jest.fn(), getAdminFacility: jest.fn(), getAdminFacilityOrder: jest.fn()}));
const summary = {id: 'facility-a', name: 'Fictional Facility', address: 'Local street', isActive: true,
  workload: 1, received: 0, verification: 0, openDiscrepancies: 1, stages: {washing: 1}, qcFailures: 1,
  rewashCycles: 1, packed: 0, ready: 0, ageWarnings: 1, stuckOrders: 1, oldestActiveHours: 25,
  activeStaff: 2, activeMachines: 1, installedMachineCapacityKg: 10};
beforeEach(() => {jest.clearAllMocks(); (listAdminFacilities as jest.Mock).mockResolvedValue({monitoring: {ageWarningHours: 4, stuckHours: 24, contractualSla: false}, facilities: [summary]});
  (getAdminFacility as jest.Mock).mockResolvedValue({summary, orders: [{id: 'order-a', order_number: 'BW-A', current_status: 'processing',
    latestStage: 'washing', processingAgeHours: 25, ageWarning: true, stuck: true, openDiscrepancies: 1, updated_at: '2026-09-20T00:00:00Z'}]});
  (getAdminFacilityOrder as jest.Mock).mockResolvedValue({order: {id: 'order-a', order_number: 'BW-A', current_status: 'processing'},
    operations: [{id: 'op-a', operation_type: 'washing', current_status: 'started', rewash_cycle: 0, started_at: '2026-09-20T00:00:00Z'}],
    inspections: [], discrepancies: [], qc: [], packings: [], history: [], qr: [{id: 'qr-a', is_active: true,
      scans: [{id: 'scan-a', scan_action: 'facility_intake', scanned_at: '2026-09-20T00:00:00Z'}]}]});});
afterEach(async () => {await cleanup();});

test('shows error and recovers on retry', async () => {
  (listAdminFacilities as jest.Mock).mockReset().mockRejectedValue(new Error('Network unavailable'));
  const view = await render(<AdminFacilityOversightScreen accessToken="admin" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  (listAdminFacilities as jest.Mock).mockResolvedValue({monitoring: {ageWarningHours: 4, stuckHours: 24, contractualSla: false}, facilities: [summary]});
  fireEvent.press(view.getByText('Retry oversight'));
  await waitFor(() => expect(view.getByText(/Fictional Facility · Active/)).toBeTruthy());
});

test('shows cross-Facility metrics, monitoring caveat and drill-down', async () => {
  const onFacility = jest.fn();
  const view = await render(<AdminFacilityOversightScreen accessToken="admin" onBack={jest.fn()} onFacility={onFacility} />);
  await waitFor(() => expect(view.getByText(/Fictional Facility · Active/)).toBeTruthy());
  expect(view.getByText(/not contractual SLAs/)).toBeTruthy();
  expect(view.getByText(/Open discrepancies 1/)).toBeTruthy();
  fireEvent.press(view.getByText('View Facility orders'));
  expect(onFacility).toHaveBeenCalledWith('facility-a');
});

test('shows stuck order, processing history and QR intake audit', async () => {
  const onOrder = jest.fn();
  const view = await render(<AdminFacilityOversightScreen accessToken="admin" facilityId="facility-a" onBack={jest.fn()} onOrder={onOrder} />);
  await waitFor(() => expect(view.getByText(/BW-A · processing/)).toBeTruthy());
  expect(view.getByText(/Stuck order/)).toBeTruthy();
  fireEvent.press(view.getByText('View processing history'));
  expect(onOrder).toHaveBeenCalledWith('facility-a', 'order-a');
  await view.rerender(<AdminFacilityOversightScreen accessToken="admin" facilityId="facility-a" orderId="order-a" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText(/facility intake/)).toBeTruthy());
  expect(view.getByText(/washing · started/)).toBeTruthy();
});
