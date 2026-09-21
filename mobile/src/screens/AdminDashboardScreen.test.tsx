import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminDashboardScreen from './AdminDashboardScreen';
import {getAdminDashboard} from '../services/adminDashboardApi';

jest.mock('../services/adminDashboardApi', () => ({getAdminDashboard: jest.fn()}));
const load = getAdminDashboard as jest.Mock;
const dashboard = {totalOrders: 2, activeOrders: 1, cancelledOrders: 0, grossRevenue: 125.5,
  activeDrivers: 1, activeFacilities: 1, processingOrders: 1, readyOrders: 0,
  ordersByStatus: [{status: 'processing', count: 1}, {status: 'pickup_otp_pending', count: 1}]};

beforeEach(() => load.mockReset());

test('shows Admin-only operational summary, status, refresh and logout', async () => {
  load.mockResolvedValue(dashboard);
  const logout = jest.fn();
  const view = await render(<AdminDashboardScreen accessToken="admin-token" onLogout={logout} />);
  await waitFor(() => expect(view.getByText('Active orders')).toBeTruthy());
  expect(view.getByText('₹125.50')).toBeTruthy();
  expect(view.getAllByText('Processing')).toHaveLength(2);
  expect(view.getByText('Pickup OTP Pending')).toBeTruthy();
  fireEvent.press(view.getByText('Refresh'));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  fireEvent.press(view.getByText('Log out'));
  expect(logout).toHaveBeenCalledTimes(1);
});

test('shows an empty state and recovers from API failure', async () => {
  load.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({...dashboard, ordersByStatus: []});
  const view = await render(<AdminDashboardScreen accessToken="admin-token" onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  fireEvent.press(view.getByText('Retry dashboard'));
  await waitFor(() => expect(view.getByText('No orders yet.')).toBeTruthy());
});
