import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminAssignmentsScreen from './AdminAssignmentsScreen';
import {assignAdminDriver, getAdminAssignmentDetail, listAdminAssignments, reassignAdminDriver} from '../services/adminAssignmentsApi';
jest.mock('../services/adminAssignmentsApi', () => ({listAdminAssignments: jest.fn(), getAdminAssignmentDetail: jest.fn(), assignAdminDriver: jest.fn(), reassignAdminDriver: jest.fn()}));
const list = listAdminAssignments as jest.Mock;
const detail = getAdminAssignmentDetail as jest.Mock;
const assign = assignAdminDriver as jest.Mock;
const reassign = reassignAdminDriver as jest.Mock;
const job = {orderId: 'order', orderNumber: 'BW-9D', orderStatus: 'confirmed', type: 'pickup', assignment: null, lastAssignment: null, canAssign: true, stale: false};
const driver = {id: 'driver', name: 'Fictional Driver', isActive: true, isAvailable: true, maxConcurrentJobs: 5, activeJobs: 1};
beforeEach(() => {jest.clearAllMocks(); list.mockResolvedValue({jobs: [job], drivers: [driver], staleAfterMinutes: 30}); detail.mockResolvedValue({order: {id: 'order', order_number: 'BW-9D', current_status: 'confirmed'}, assignments: [], audit: [], tracking: null}); assign.mockResolvedValue({}); reassign.mockResolvedValue({});});
test('shows unassigned jobs, workload, selection, history, and refresh after assignment', async () => {
  const view = await render(<AdminAssignmentsScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Order BW-9D')).toBeTruthy());
  await fireEvent.press(view.getByText('Order BW-9D'));
  await waitFor(() => expect(view.getByText('No prior assignments.')).toBeTruthy());
  await fireEvent.press(view.getByText('Fictional Driver · 1/5 jobs'));
  await fireEvent.press(view.getAllByText('Assign Driver').at(-1)!);
  await waitFor(() => expect(assign).toHaveBeenCalledWith('token', 'order', 'driver', 'pickup'));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
});
test('shows stale job and reassignment action, then API error', async () => {
  list.mockResolvedValue({jobs: [{...job, orderStatus: 'pickup_assigned', canAssign: false, stale: true,
    assignment: {id: 'old', driver_id: 'old-driver', status: 'assigned', assigned_at: '2026-01-01T00:00:00Z'}}], drivers: [driver], staleAfterMinutes: 30});
  reassign.mockRejectedValue(new Error('Assignment changed'));
  const view = await render(<AdminAssignmentsScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText(/stale/)).toBeTruthy());
  await fireEvent.press(view.getByText('Order BW-9D'));
  await waitFor(() => expect(view.getByText('Reassign Driver')).toBeTruthy());
  await fireEvent.press(view.getByText('Fictional Driver · 1/5 jobs'));
  await fireEvent.press(view.getByText('Confirm reassignment'));
  await waitFor(() => expect(reassign).toHaveBeenCalled());
  await waitFor(() => expect(view.getByText('Assignment changed')).toBeTruthy());
});
