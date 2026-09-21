import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import FacilityDashboardScreen from './FacilityDashboardScreen';
import {getFacilityDashboard} from '../services/facilityDashboardApi';

jest.mock('../services/facilityDashboardApi', () => ({getFacilityDashboard: jest.fn()}));
const load = getFacilityDashboard as jest.Mock;
const dashboard = {facility: {id: 'facility-1', name: 'Local Facility', address: 'Test Lane'}, role: 'manager',
  summary: {incoming: 1, received: 0, processing: 0, ready: 0},
  orders: [{id: 'order-1', order_number: 'BW-1', current_status: 'in_transit_to_facility'}]};

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
