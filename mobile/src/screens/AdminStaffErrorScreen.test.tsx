import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminStaffScreen from './AdminStaffScreen';
import {listAdminFacilities, listAdminStaff} from '../services/adminStaffApi';
jest.mock('../services/adminStaffApi', () => ({listAdminFacilities: jest.fn(), listAdminStaff: jest.fn(), provisionAdminStaff: jest.fn()}));
const list = listAdminStaff as jest.Mock;
const facilities = listAdminFacilities as jest.Mock;
test('Admin staff list shows API failure, retry, and empty state', async () => {
  list.mockReset().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce([]);
  facilities.mockReset().mockResolvedValue([]);
  const view = await render(<AdminStaffScreen accessToken="t" onBack={jest.fn()} onStaff={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  await act(async () => {fireEvent.press(view.getByRole('button', {name: 'Retry staff'}));});
  await waitFor(() => expect(view.getByText('No staff found.')).toBeTruthy());
});
