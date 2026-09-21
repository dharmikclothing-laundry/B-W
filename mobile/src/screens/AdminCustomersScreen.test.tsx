import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminCustomersScreen from './AdminCustomersScreen';
import {getAdminCustomers, lookupAdminQr} from '../services/adminManagementApi';
jest.mock('../components/NativeQrScannerButton', () => {
  const ReactModule = require('react'); const {Text, TouchableOpacity} = require('react-native');
  return ({onScanned}: {onScanned: (value: string) => void}) => ReactModule.createElement(
    TouchableOpacity,
    {onPress: () => onScanned('BW1:11111111-1111-4111-8111-111111111111')},
    ReactModule.createElement(Text, null, 'Scan order QR'),
  );
});
jest.mock('../services/adminManagementApi', () => ({getAdminCustomers: jest.fn(), lookupAdminQr: jest.fn()}));
const customers = getAdminCustomers as jest.Mock;
const lookup = lookupAdminQr as jest.Mock;
beforeEach(() => {customers.mockReset().mockResolvedValue([{id: 'c1', profiles: {full_name: 'Test Customer', phone: '+16505550155'}}]); lookup.mockReset().mockResolvedValue({orderId: 'order-1'});});
test('search and customer navigation', async () => {
  const onCustomer = jest.fn();
  const view = await render(<AdminCustomersScreen accessToken="t" onBack={jest.fn()} onCustomer={onCustomer} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Test Customer')).toBeTruthy());
  await act(async () => {fireEvent.changeText(view.getByLabelText('Search customers'), 'Test');});
  await act(async () => {fireEvent.press(view.getByText('Search'));});
  expect(customers).toHaveBeenLastCalledWith('t', 'Test');
  fireEvent.press(view.getByText('Test Customer'));
  expect(onCustomer).toHaveBeenCalledWith('c1');
});
test('QR lookup opens order and reports invalid codes', async () => {
  const onOrder = jest.fn();
  const view = await render(<AdminCustomersScreen accessToken="t" onBack={jest.fn()} onCustomer={jest.fn()} onOrder={onOrder} />);
  await waitFor(() => expect(view.getByText('Test Customer')).toBeTruthy());
  await act(async () => {fireEvent.changeText(view.getByLabelText('Handoff QR code'), 'BW1:example');});
  await act(async () => {fireEvent.press(view.getByText('Look up order'));});
  expect(onOrder).toHaveBeenCalledWith('order-1');
  lookup.mockRejectedValueOnce(new Error('Invalid QR'));
  await act(async () => {fireEvent.press(view.getByText('Look up order'));});
  expect(view.getByText('Invalid QR')).toBeTruthy();
});
test('native QR scanner opens the matching order', async () => {
  const onOrder = jest.fn();
  const view = await render(<AdminCustomersScreen accessToken="t" onBack={jest.fn()} onCustomer={jest.fn()} onOrder={onOrder} />);
  await waitFor(() => expect(view.getByText('Scan order QR')).toBeTruthy());
  fireEvent.press(view.getByText('Scan order QR'));
  await waitFor(() => expect(lookup).toHaveBeenCalledWith('t', 'BW1:11111111-1111-4111-8111-111111111111'));
  expect(onOrder).toHaveBeenCalledWith('order-1');
});
