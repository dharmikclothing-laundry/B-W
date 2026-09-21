import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import DriverDashboardScreen from './DriverDashboardScreen';
import {getDriverDashboard} from '../services/driverAssignmentsApi';

jest.mock('../services/driverAssignmentsApi', () => ({
  getDriverDashboard: jest.fn(),
  formatDriverAddress: jest.fn(() => '1 Test Road'),
}));
const load = getDriverDashboard as jest.Mock;
beforeEach(() => {jest.clearAllMocks();});

test('shows counts, pickup and delivery queues and opens only selected job', async () => {
  load.mockResolvedValue({date: '2026-09-18', summary: {pickups: 1, deliveries: 1, pending: 1, inProgress: 1, completed: 0},
    pickups: [{id: 'pickup-id', orderId: 'order-pickup', type: 'pickup', assignmentStatus: 'assigned',
      assignedAt: '2026-09-18T09:00:00Z', address: null}],
    deliveries: [{id: 'delivery-id', orderId: 'order-delivery', type: 'delivery', assignmentStatus: 'accepted',
      assignedAt: '2026-09-18T10:00:00Z', address: null}],
  });
  const onJob = jest.fn();
  const onNotifications = jest.fn();
  const view = await render(<DriverDashboardScreen accessToken="token" onJob={onJob} onNotifications={onNotifications} onProfile={jest.fn()} onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Pickups 1')).toBeTruthy());
  expect(view.getByText('Deliveries 1')).toBeTruthy();
  expect(view.getByText('Pickup queue')).toBeTruthy();
  expect(view.getByText('Delivery queue')).toBeTruthy();
  await fireEvent.press(view.getByText('Review assignment →'));
  expect(onJob).toHaveBeenCalledWith('pickup-id');
  await fireEvent.press(view.getByLabelText('Driver notifications'));
  expect(onNotifications).toHaveBeenCalledTimes(1);
});

test('shows empty queues when no jobs are assigned', async () => {
  load.mockResolvedValue({date: '2026-09-18', summary: {pickups: 0, deliveries: 0, pending: 0, inProgress: 0, completed: 0}, pickups: [], deliveries: []});
  const view = await render(<DriverDashboardScreen accessToken="token" onJob={jest.fn()} onNotifications={jest.fn()} onProfile={jest.fn()} onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('No pickup queue assigned.')).toBeTruthy());
  expect(view.getByText('No delivery queue assigned.')).toBeTruthy();
});

test('shows a retry state on assignment load error', async () => {
  load.mockRejectedValue(new Error('Network unavailable'));
  const view = await render(<DriverDashboardScreen accessToken="token" onJob={jest.fn()} onNotifications={jest.fn()} onProfile={jest.fn()} onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  expect(view.getByText('Retry assignments')).toBeTruthy();
});
