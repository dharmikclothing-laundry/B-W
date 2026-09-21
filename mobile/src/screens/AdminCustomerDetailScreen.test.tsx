import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import AdminCustomerDetailScreen from './AdminCustomerDetailScreen';
import {getAdminCustomer, getAdminCustomerOrders} from '../services/adminManagementApi';
jest.mock('../services/adminManagementApi', () => ({getAdminCustomer: jest.fn(), getAdminCustomerOrders: jest.fn()}));
const customer = getAdminCustomer as jest.Mock;
const orders = getAdminCustomerOrders as jest.Mock;
beforeEach(() => {customer.mockReset().mockResolvedValue({id: 'c1', profiles: {full_name: 'Test Customer', phone: '+16505550155', is_active: true}, customer_addresses: []}); orders.mockReset().mockResolvedValue([]);});
test('profile, support contact, empty address and order history', async () => {
  const view = await render(<AdminCustomerDetailScreen accessToken="t" customerId="c1" onBack={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('No orders yet.')).toBeTruthy());
  expect(view.getByText('Contact: +16505550155')).toBeTruthy();
  expect(view.getByText('No saved addresses.')).toBeTruthy();
});
