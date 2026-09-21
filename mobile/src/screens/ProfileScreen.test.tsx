import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';
import {getCustomerProfile, updateCustomerName} from '../services/profileApi';
jest.mock('../services/profileApi', () => ({getCustomerProfile: jest.fn(), updateCustomerName: jest.fn(), validateName: jest.requireActual('../services/profileApi').validateName}));
test('profile loads verified phone and saves a valid name', async () => {
  (getCustomerProfile as jest.Mock).mockResolvedValue({id: 'customer', profiles: {id: 'profile', full_name: 'Asha', phone: '+919999999999'}});
  (updateCustomerName as jest.Mock).mockResolvedValue({id: 'profile', full_name: 'Asha Reddy', phone: '+919999999999'});
  const view = await render(<ProfileScreen accessToken="token" onBack={jest.fn()} onAddresses={jest.fn()} onLogout={jest.fn()} />);
  await waitFor(() => expect(view.getByText('+919999999999')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Full name'), 'Asha Reddy');
  await fireEvent.press(view.getByText('Save name'));
  await waitFor(() => expect(updateCustomerName).toHaveBeenCalledWith('token', 'Asha Reddy'));
  expect(view.getByText('Phone changes require a new verified login.')).toBeTruthy();
});
