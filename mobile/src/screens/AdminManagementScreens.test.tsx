import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminOrderDetailScreen from './AdminOrderDetailScreen';
import * as api from '../services/adminManagementApi';

jest.mock('../services/adminManagementApi', () => ({
  getAdminCustomers: jest.fn(), getAdminCustomer: jest.fn(), getAdminCustomerOrders: jest.fn(), getAdminOrder: jest.fn(),
  cancelAdminOrder: jest.fn(), canAdminCancelOrder: (status: string) => status === 'confirmed',
}));
const order = api.getAdminOrder as jest.Mock;
const cancel = api.cancelAdminOrder as jest.Mock;
const detail = {order: {id: 'o1', order_number: 'BW-1', current_status: 'confirmed', payment_method: 'razorpay',
  subtotal: 100, discount_amount: 0, total_amount: 118, pickup_delivery_charge: 0, taxable_amount: 100, gst_rate: 18, gst_amount: 18,
  customers: {profiles: {full_name: 'Test Customer', phone: '+16505550155'}}, order_items: [], order_status_history: [], order_qr_codes: null}, payments: [], claims: []};
beforeEach(() => {jest.clearAllMocks(); order.mockResolvedValue(detail); cancel.mockResolvedValue({});});

test('Admin order shows receipt, empty states, reason and refresh after cancellation', async () => {
  const view = await act(async () => render(<AdminOrderDetailScreen accessToken="t" orderId="o1" onBack={jest.fn()} />));
  await waitFor(() => expect(view.getByText('BW-1')).toBeTruthy());
  expect(view.getByText('GST (18%): ₹18.00')).toBeTruthy();
  expect(view.getByText('No payment record.')).toBeTruthy();
  expect(view.getByText('No claims.')).toBeTruthy();
  await act(async () => {fireEvent.changeText(view.getByLabelText('Admin cancellation reason'), 'Customer requested cancellation');});
  await act(async () => {fireEvent.press(view.getByText('Cancel order'));});
  await waitFor(() => expect(cancel).toHaveBeenCalledWith('t', 'o1', 'Customer requested cancellation'));
  await waitFor(() => expect(order).toHaveBeenCalledTimes(2));
  expect(view.getByText('Order cancelled.')).toBeTruthy();
  view.unmount();
});

test('error and ineligible cancellation handling', async () => {
  order.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({...detail, order: {...detail.order, current_status: 'delivered'}});
  const view = await act(async () => render(<AdminOrderDetailScreen accessToken="t" orderId="o1" onBack={jest.fn()} />));
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  await act(async () => {fireEvent.press(view.getByText('Retry order'));});
  await waitFor(() => expect(view.getByText('Cancellation is unavailable at this stage.')).toBeTruthy());
  expect(view.queryByText('Cancel order')).toBeNull();
  view.unmount();
});
