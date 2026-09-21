import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminStaffScreen from './AdminStaffScreen';
import {listAdminFacilities, listAdminStaff} from '../services/adminStaffApi';
jest.mock('../services/adminStaffApi', () => ({listAdminFacilities: jest.fn(), listAdminStaff: jest.fn(), provisionAdminStaff: jest.fn()}));
const list = listAdminStaff as jest.Mock;
const facilities = listAdminFacilities as jest.Mock;
beforeEach(() => {list.mockReset().mockResolvedValue([{id: 'd1', profile_id: 'p1', role: 'driver', profiles: {full_name: 'Fictional Driver', is_active: true}, facilities: null}]); facilities.mockReset().mockResolvedValue([]);});
test('Admin staff list opens the selected operational profile', async () => {
  const onStaff = jest.fn();
  const view = await render(<AdminStaffScreen accessToken="t" onBack={jest.fn()} onStaff={onStaff} />);
  await waitFor(() => expect(view.getByText('Fictional Driver')).toBeTruthy());
  fireEvent.press(view.getByText('Fictional Driver'));
  expect(onStaff).toHaveBeenCalledWith('p1');
});
