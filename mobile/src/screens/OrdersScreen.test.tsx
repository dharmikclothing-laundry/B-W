import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import OrdersScreen from './OrdersScreen';
import {getOrders} from '../services/ordersApi';
let mockFocus: () => void;
jest.mock('@react-navigation/native', () => ({useFocusEffect: (callback: () => void) => {
  mockFocus = callback;
  require('react').useEffect(callback, [callback]);
}}));
jest.mock('../services/ordersApi', () => ({getOrders: jest.fn()}));
test('returning from a cancelled order refreshes history and moves it to Past', async () => {
  const order = {id: 'order', order_number: 'BW-123', current_status: 'confirmed', total_amount: 100, order_items: []};
  (getOrders as jest.Mock).mockResolvedValueOnce([order]).mockResolvedValueOnce([{...order, current_status: 'cancelled'}]);
  const view = await render(<OrdersScreen accessToken="token" onBack={jest.fn()} onOpenOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Active (1)')).toBeTruthy());
  await act(async () => {mockFocus();});
  await waitFor(() => expect(view.getByText('Active (0)')).toBeTruthy());
  await fireEvent.press(view.getByText('Past (1)'));
  expect(view.getByText('BW-123')).toBeTruthy();
  expect(view.getByText('Cancelled')).toBeTruthy();
});
