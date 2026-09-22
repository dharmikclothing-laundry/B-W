import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import FacilityDashboardScreen from './FacilityDashboardScreen';
import {getAvailableDeliveryDrivers, getFacilityDashboard, reassignFacilityDelivery} from '../services/facilityDashboardApi';

jest.mock('../services/facilityDashboardApi', () => ({
  getFacilityDashboard: jest.fn(),
  getAvailableDeliveryDrivers: jest.fn(),
  reassignFacilityDelivery: jest.fn(),
}));
const load = getFacilityDashboard as jest.Mock;
const available = getAvailableDeliveryDrivers as jest.Mock;
const reassign = reassignFacilityDelivery as jest.Mock;
const dashboard = {facility: {id: 'facility-1', name: 'Local Facility', address: 'Test Lane'}, role: 'manager',
  summary: {incoming: 1, received: 0, processing: 0, ready: 0},
  orders: [{id: 'order-1', order_number: 'BW-1', current_status: 'in_transit_to_facility', deliveryAssignment: null}]};

beforeEach(() => {jest.clearAllMocks();});

test('shows assigned facility, status counts and orders from authenticated endpoint', async () => {
  load.mockResolvedValue(dashboard);
  const view = await render(<FacilityDashboardScreen accessToken="staff-token" onLogout={jest.fn()} onIntake={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Local Facility')).toBeTruthy());
  expect(load).toHaveBeenCalledWith('staff-token');
  expect(view.getByText('Facility Manager')).toBeTruthy();
  expect(view.getByText('Incoming 1')).toBeTruthy();
  expect(view.getByText('BW-1')).toBeTruthy();
});

test('shows clear Received, Processing and Ready tabs and empty queues', async () => {
  load.mockResolvedValue({...dashboard, role: 'facility_employee', orders: []});
  const view = await render(<FacilityDashboardScreen accessToken="staff-token" onLogout={jest.fn()} onIntake={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('No received orders')).toBeTruthy());
  expect(view.getByText('Facility Staff')).toBeTruthy();
  expect(view.getByText('Processing 0')).toBeTruthy();
  expect(view.getByText('Ready 0')).toBeTruthy();
});

test('clears stale data after failure and retries', async () => {
  load.mockResolvedValueOnce(dashboard).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(dashboard);
  const view = await render(<FacilityDashboardScreen accessToken="staff-token" onLogout={jest.fn()} onIntake={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('BW-1')).toBeTruthy());
  fireEvent.press(view.getByText('Refresh'));
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  expect(view.queryByText('BW-1')).toBeNull();
  fireEvent.press(view.getByText('Retry dashboard'));
  await waitFor(() => expect(view.getByText('BW-1')).toBeTruthy());
});

test('keeps an unaccepted delivery in Ready and reassigns a rejected delivery', async () => {
  const readyDashboard = {
    ...dashboard,
    summary: {incoming: 0, received: 0, processing: 0, ready: 2},
    orders: [
      {id: 'assigned-order', order_number: 'BW-ASSIGNED', current_status: 'delivery_assigned',
        deliveryAssignment: {id: 'assignment-1', driverId: 'driver-1', status: 'assigned', rejectionReason: null}},
      {id: 'rejected-order', order_number: 'BW-REJECTED', current_status: 'delivery_failed',
        deliveryAssignment: {id: 'assignment-2', driverId: 'driver-2', status: 'rejected', rejectionReason: 'Route unavailable'}},
    ],
  };
  load.mockResolvedValue(readyDashboard);
  available.mockResolvedValue({drivers: [{id: 'driver-3', name: 'Meera Shah', activeJobs: 1}]});
  reassign.mockResolvedValue({assignment: {id: 'replacement'}});
  const view = await render(<FacilityDashboardScreen accessToken="staff-token" onLogout={jest.fn()} onIntake={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Ready 2')).toBeTruthy());
  fireEvent.press(view.getByText('Ready 2'));
  await waitFor(() => expect(view.getByText('Waiting for Driver acceptance.')).toBeTruthy());
  expect(view.getByText('Driver rejected the delivery: Route unavailable')).toBeTruthy();
  fireEvent.press(view.getByText('Reassign Driver'));
  await waitFor(() => expect(available).toHaveBeenCalledWith('staff-token', 'rejected-order'));
  await waitFor(() => expect(view.getByText('Meera Shah')).toBeTruthy());
  fireEvent.press(view.getByText('Meera Shah'));
  await waitFor(() => expect(reassign).toHaveBeenCalledWith('staff-token', 'rejected-order', 'driver-3'));
  await waitFor(() => expect(view.getByText('Delivery assigned to Meera Shah. Waiting for acceptance.')).toBeTruthy());
});
