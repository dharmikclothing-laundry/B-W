import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import DriverProfileScreen from './DriverProfileScreen';
import {getDriverProfile, updateDriverName} from '../services/driverProfileApi';

jest.mock('../services/driverProfileApi', () => ({getDriverProfile: jest.fn(), updateDriverName: jest.fn()}));
beforeEach(() => {jest.clearAllMocks();});

test('Driver sees verified phone and can edit name through existing session', async () => {
  (getDriverProfile as jest.Mock).mockResolvedValue({
    id: 'driver', is_active: true, is_available: false, max_concurrent_jobs: 5,
    profiles: {id: 'profile', full_name: 'Development Driver', phone: '+16505550102', avatar_path: null},
  });
  (updateDriverName as jest.Mock).mockResolvedValue({id: 'profile', full_name: 'Development Driver Two', phone: '+16505550102'});
  const view = await render(<DriverProfileScreen accessToken="token" onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('+16505550102')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Driver full name'), 'Development Driver Two');
  await fireEvent.press(view.getByText('Save name'));
  await waitFor(() => expect(updateDriverName).toHaveBeenCalledWith('token', 'Development Driver Two'));
  expect(view.getByText('Unavailable')).toBeTruthy();
});

test('Driver profile failure shows retry and logout', async () => {
  (getDriverProfile as jest.Mock).mockRejectedValue(new Error('Profile unavailable'));
  const view = await render(<DriverProfileScreen accessToken="token" onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Profile unavailable')).toBeTruthy());
  expect(view.getByText('Retry')).toBeTruthy();
  expect(view.getByText('Log out')).toBeTruthy();
});
